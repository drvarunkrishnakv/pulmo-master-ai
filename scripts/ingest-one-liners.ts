import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ID = 'pulmo-master';
const BUCKET_NAME = 'pulmo-master.firebasestorage.app';
const GCS_OUTPUT_PREFIX = 'batch-jobs/one-liner-output-1767166957425/prediction-model-2025-12-31T07:42:40.133898Z/';
const OUTPUT_DIR = path.join(__dirname, '../content/generated-mcqs');
const TEMP_DIR = path.join(__dirname, '../temp-results');

const storage = new Storage({ projectId: PROJECT_ID });

interface MCQ {
    id?: string;
    question: string;
    options: string[] | Record<string, string>;
    correctAnswer: string;
    topic: string;
    deepDiveExplanation: string;
    highYieldPearl: string;
    examStyle: string;
    difficulty: string;
    trapAnalysis?: string;
    isOneLiner?: boolean;
}

async function ingest() {
    console.log('📥 Starting ingestion of one-liner MCQs...');

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

    const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix: GCS_OUTPUT_PREFIX });
    console.log(`✓ Found ${files.length} result files`);

    const mcqsByTopic: Record<string, MCQ[]> = {};
    let totalIngested = 0;

    for (const file of files) {
        if (!file.name.endsWith('.jsonl')) continue;

        console.log(`  Processing ${file.name}...`);
        const localPath = path.join(TEMP_DIR, path.basename(file.name));
        await file.download({ destination: localPath });

        const content = fs.readFileSync(localPath, 'utf8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                const metadata = data.metadata;
                // Extract topicId from metadata (format: one-liner|topicId|name|count)
                const topicId = metadata.split('|')[1];

                // Prediction parts contain the response
                const predictionText = data.response.candidates[0].content.parts[0].text;

                // Parse the inner JSON list of MCQs
                const jsonMatch = predictionText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const mcqs: MCQ[] = JSON.parse(jsonMatch[0]);
                    mcqs.forEach((m, idx) => {
                        m.isOneLiner = true;
                        // Generate a stable-ish ID if missing
                        if (!m.id) {
                            const hash = Math.random().toString(36).substring(2, 10);
                            m.id = `one_liner_${topicId}_${hash}`;
                        }
                        if (!mcqsByTopic[topicId]) mcqsByTopic[topicId] = [];
                        mcqsByTopic[topicId].push(m);
                        totalIngested++;
                    });
                }
            } catch (e) {
                console.error(`  ❌ Error parsing line in ${file.name}:`, e.message);
            }
        }
    }

    console.log(`\n✅ Parsed ${totalIngested} total MCQs across ${Object.keys(mcqsByTopic).length} topics.`);

    // Now merge into the files
    for (const [topicId, newMcqs] of Object.entries(mcqsByTopic)) {
        const filePath = path.join(OUTPUT_DIR, `${topicId}.json`);
        let existingMcqs: MCQ[] = [];

        if (fs.existsSync(filePath)) {
            try {
                const fileData = fs.readFileSync(filePath, 'utf8');
                existingMcqs = JSON.parse(fileData);
            } catch (e) {
                console.error(`  ❌ Error reading ${filePath}:`, e.message);
            }
        }

        const mergedMcqs = [...existingMcqs, ...newMcqs];
        fs.writeFileSync(filePath, JSON.stringify(mergedMcqs, null, 2));
        console.log(`  ✓ Merged ${newMcqs.length} MCQs into ${topicId}.json`);
    }

    // Update index.json if needed (count)
    const indexFile = path.join(OUTPUT_DIR, 'index.json');
    if (fs.existsSync(indexFile)) {
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        // Recalculate or estimate
        // index.totalCount += totalIngested; // Better to recalculate after a big batch

        // Simple recalculation:
        let newTotal = 0;
        const mcqFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
        for (const f of mcqFiles) {
            const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf8'));
            newTotal += data.length;
        }
        index.totalCount = newTotal;
        fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
        console.log(`\n📑 Updated index.json. New total MCQs: ${newTotal}`);
    }

    console.log('\n✨ Ingestion complete!');
}

ingest().then(async () => {
    console.log('🧹 Final check for any remaining missing IDs...');
    const mcqFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
    let fixedAny = 0;

    for (const f of mcqFiles) {
        const filePath = path.join(OUTPUT_DIR, f);
        const data: MCQ[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let modified = false;

        data.forEach(m => {
            if (!m.id) {
                const topicId = f.replace('.json', '');
                const hash = Math.random().toString(36).substring(2, 10);
                m.id = `one_liner_${topicId}_${hash}`;
                modified = true;
                fixedAny++;
            }
        });

        if (modified) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }
    }
    console.log(`✨ Fixed ${fixedAny} missing IDs across all files.`);
}).catch(console.error);
