/**
 * Re-parse batch results from GCS
 * Run with: npx tsx scripts/reparse-batch.ts
 */

import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = 'pulmo-master';
const BUCKET_NAME = 'pulmo-master.firebasestorage.app';
const OUTPUT_PREFIX = 'batch-jobs/output-1766627318620/';
const OUTPUT_DIR = path.join(__dirname, '../content/generated-mcqs');

const storage = new Storage({ projectId: PROJECT_ID });

interface MCQ {
    id: string;
    question: string;
    options: { A: string; B: string; C: string; D: string };
    correctAnswer: string;
    explanation: string;
    deepDiveExplanation: string;
    highYieldPearl: string;
    topic: string;
    bookId: string;
    chunkId: string;
    sourceSection: string;
    generatedAt: number;
}

async function main() {
    console.log('📥 Re-parsing batch results from GCS...\n');

    const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix: OUTPUT_PREFIX });
    console.log(`Found ${files.length} files\n`);

    const allMCQs: Record<string, MCQ[]> = {};
    let totalParsed = 0;
    let totalFailed = 0;

    for (const file of files) {
        if (!file.name.endsWith('.jsonl')) continue;

        console.log(`Processing: ${file.name}`);
        const [content] = await file.download();
        const lines = content.toString().split('\n').filter(Boolean);
        console.log(`  Lines: ${lines.length}`);

        for (const line of lines) {
            try {
                const result = JSON.parse(line);
                const [bookId, bookName, chunkId, sectionTitle] = result.metadata.split('|');

                if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    console.log(`  ⚠️ No response for ${chunkId}`);
                    totalFailed++;
                    continue;
                }

                if (!allMCQs[bookId]) allMCQs[bookId] = [];

                const text = result.response.candidates[0].content.parts[0].text;

                // Try to extract JSON from the text
                let mcqs: any[];
                try {
                    mcqs = JSON.parse(text);
                } catch {
                    // Try to find JSON array in text
                    const match = text.match(/\[[\s\S]*\]/);
                    if (match) {
                        mcqs = JSON.parse(match[0]);
                    } else {
                        throw new Error('No JSON array found');
                    }
                }

                if (!Array.isArray(mcqs)) {
                    throw new Error('Response is not an array');
                }

                for (let i = 0; i < mcqs.length; i++) {
                    allMCQs[bookId].push({
                        id: `${bookId}-${chunkId}-${i}`,
                        ...mcqs[i],
                        topic: bookName,
                        bookId,
                        chunkId,
                        sourceSection: sectionTitle,
                        generatedAt: Date.now()
                    });
                }
                totalParsed += mcqs.length;
                console.log(`  ✓ Parsed ${mcqs.length} MCQs from ${chunkId}`);
            } catch (e: any) {
                console.log(`  ⚠️ Parse error: ${e.message}`);
                totalFailed++;
            }
        }
    }

    // Save files
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log('\n💾 Saving files...\n');
    for (const [bookId, mcqs] of Object.entries(allMCQs)) {
        const outputFile = path.join(OUTPUT_DIR, `${bookId}.json`);
        fs.writeFileSync(outputFile, JSON.stringify(mcqs, null, 2));
        console.log(`  ✓ ${bookId}.json: ${mcqs.length} MCQs`);
    }

    // Save index
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'index.json'),
        JSON.stringify({
            generatedAt: new Date().toISOString(),
            totalMCQs: totalParsed,
            books: Object.keys(allMCQs).map(id => ({ id, mcqCount: allMCQs[id].length }))
        }, null, 2)
    );

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    RE-PARSING COMPLETE                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\n📊 Total MCQs: ${totalParsed}`);
    console.log(`📊 Failed: ${totalFailed}`);
    console.log(`📁 Saved to: ${OUTPUT_DIR}`);
}

main().catch(console.error);
