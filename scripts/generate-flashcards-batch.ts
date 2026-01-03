/**
 * Batch Flashcard Generation using Gemini via Vertex AI
 * 
 * Generates high-yield flashcards for SRS-based learning.
 * 
 * Run with: npm run generate-flashcards-batch
 */

import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ID = 'pulmo-master';
const LOCATION = 'us-central1';
const BUCKET_NAME = 'pulmo-master.firebasestorage.app';
const MODEL_ID = 'gemini-2.5-flash'; // PRODUCTION model

const CHUNKS_DIR = path.join(__dirname, '../content/processed/chunks');
const INDEX_FILE = path.join(__dirname, '../content/processed/index.json');
const OUTPUT_DIR = path.join(__dirname, '../content/generated-flashcards');
const BATCH_DIR = path.join(__dirname, '../content/batch-jobs');

// Flashcard targets by book (about 1/5 of MCQ targets)
const FLASHCARD_TARGETS: Record<string, number> = {
    'pneumonia-ocr-complete': 40,
    'pneumonia-2-ocr-complete': 40,
    '30-tuberculosis-integrated-session-2-ocr-complete--1-': 70,
    '82-end-tb-strategy-ocr-complete--1-': 60,
    '67-sleep-disorders-clssfcn-physio-ocr-complete--1-': 50,
    '79-phtn-ocr-complete--1-': 50,
    '12-asthma-mx-2-ocr-complete--1-': 40,
    '61-diagnsis-staging-mx-ocr-complete--1-': 30,
    '52-iips-other-than-ipf-nsip-rbild-ocr-complete--1-': 30,
    '2-pleural-effusion-ocr-complete--1-': 30,
    '23-mv-in-asthma-copd-ocr-complete--1-': 30,
    '89-ntm-part-2-ocr-complete--1-': 20,
    '86-spinal-tb-skeletal-tb-ocr-complete--1-': 20,
    '54-ctd-and-lung-part2-hypersensitive-pneumo-ocr-complete--1-': 20,
    '55-sarcoidosis-ocr-complete--1-': 20,
    '63-lymph-node-tb-ocr-complete--1-': 15,
    '62-pleural-tb-ocr-complete--1-': 15,
    '56-occupational-lung-diseases-ocr-complete--1-': 12,
    '102-recent-advances-in-ards-ocr-complete--1-': 6,
    '42-non-invasive-ventilation-ocr-complete--1-': 6,
    '40-pft-series--impulse-oslmtry-feno-tests-for-sad-ocr-complete--1-': 4,
    '88-ntm-mott-ocr-complete--1-': 2,
    '69-endobronchial-tb-ocr-complete--1-': 2
};

const storage = new Storage({ projectId: PROJECT_ID });

interface Chunk {
    id: string;
    bookId: string;
    sectionTitle: string;
    content: string;
}

interface BatchRequest {
    request: {
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
        generationConfig?: {
            responseMimeType?: string;
            temperature?: number;
        };
    };
    metadata: string;
}

const SYSTEM_PROMPT = `You are an expert medical educator for NEET-SS/INI-SS Pulmonary Medicine.

Generate HIGH-YIELD FLASHCARDS for spaced repetition learning. Focus on:
- Diagnostic criteria and classifications
- Drug doses and regimens (especially TB)
- Numerical thresholds and cutoffs
- Key differentiating features
- Guideline recommendations (GOLD, GINA, NTEP)
- Landmark trial conclusions
- **Radiology pattern recognition** (HRCT, X-ray findings)

### Flashcard Types to Include:
1. Diagnostic criteria (e.g., "What are the diagnostic criteria for IPF?")
2. Classification systems (e.g., "What are the Scadding stages of Sarcoidosis?")
3. Drug regimens with doses (e.g., "What is the BPaLM regimen for DR-TB?")
4. Numerical values (e.g., "What AHI defines severe OSA?")
5. Quick recalls (e.g., "What is the half-life of Nintedanib?")
6. **Pattern Recognition** (e.g., "Identify: Bilateral basal honeycombing with traction bronchiectasis - Diagnosis?")

### RADIOLOGY PATTERN RECOGNITION CARDS:
For content mentioning HRCT, CT, X-ray, or imaging findings:
- Front: Describe the imaging finding vividly (location, distribution, pattern)
- Back: The diagnosis, disease, or key differential
- Example:
  - Front: "HRCT Pattern: Bilateral ground-glass opacities with interlobular septal thickening in a 'crazy paving' pattern"
  - Back: "Pulmonary Alveolar Proteinosis (PAP) - Also consider: COVID pneumonia, Lipoid pneumonia, ARDS"

### STRICT JSON FORMAT - Return ONLY a valid JSON array:
[
  {
    "front": "What are the diagnostic criteria for IPF on HRCT?",
    "back": "UIP pattern: Basal/subpleural, reticular, honeycombing, traction bronchiectasis. NO ground glass or consolidation predominance.",
    "category": "diagnostic_criteria",
    "conceptTags": ["IPF", "HRCT", "UIP pattern"],
    "difficulty": 3,
    "examRelevance": "high"
  }
]

Categories: diagnostic_criteria, classification, drug_regimen, numerical_value, quick_recall, procedure, guideline, pattern_recognition

CRITICAL: Return ONLY the JSON array. No markdown, no explanations.`;

function getFlashcardsPerChunk(bookId: string, totalChunks: number): number {
    const target = FLASHCARD_TARGETS[bookId] || 10;
    const perChunk = Math.ceil(target / totalChunks);
    return Math.max(2, Math.min(5, perChunk));
}

async function createBatchInputFile(): Promise<string> {
    console.log('\n📋 Creating flashcard batch input file...\n');

    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    const books = index.books;

    const batchRequests: BatchRequest[] = [];
    let totalChunks = 0;
    let expectedFlashcards = 0;

    for (const book of books) {
        const chunksFile = path.join(CHUNKS_DIR, `${book.id}.json`);

        if (!fs.existsSync(chunksFile)) {
            console.log(`  Skipping ${book.name} - no chunks file`);
            continue;
        }

        const chunks: Chunk[] = JSON.parse(fs.readFileSync(chunksFile, 'utf-8'));
        const cardsPerChunk = getFlashcardsPerChunk(book.id, chunks.length);

        console.log(`  📚 ${book.name}: ${chunks.length} chunks × ${cardsPerChunk} cards = ~${chunks.length * cardsPerChunk}`);
        expectedFlashcards += chunks.length * cardsPerChunk;

        for (const chunk of chunks) {
            const prompt = `${SYSTEM_PROMPT}

Based on the following medical content from "${book.name}" (section: ${chunk.sectionTitle}):

CONTENT:
${chunk.content.substring(0, 15000)}

Generate exactly ${cardsPerChunk} high-yield flashcards as a JSON array.`;

            batchRequests.push({
                request: {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.5
                    }
                },
                metadata: `${book.id}|${book.name}|${chunk.id}|${chunk.sectionTitle}|${cardsPerChunk}`
            });

            totalChunks++;
        }
    }

    console.log(`\n✓ Total requests: ${totalChunks}`);
    console.log(`✓ Expected flashcards: ~${expectedFlashcards}`);

    if (!fs.existsSync(BATCH_DIR)) {
        fs.mkdirSync(BATCH_DIR, { recursive: true });
    }

    const timestamp = Date.now();
    const inputFileName = `flashcard-batch-input-${timestamp}.jsonl`;
    const inputFilePath = path.join(BATCH_DIR, inputFileName);

    const jsonlContent = batchRequests.map(req => JSON.stringify(req)).join('\n');
    fs.writeFileSync(inputFilePath, jsonlContent);

    console.log(`✓ Created: ${inputFilePath}`);

    return inputFilePath;
}

async function uploadToGCS(localPath: string): Promise<string> {
    const fileName = path.basename(localPath);
    const gcsPath = `batch-jobs/${fileName}`;

    console.log(`\n☁️  Uploading to GCS: gs://${BUCKET_NAME}/${gcsPath}`);

    await storage.bucket(BUCKET_NAME).upload(localPath, {
        destination: gcsPath
    });

    console.log('✓ Upload complete');
    return `gs://${BUCKET_NAME}/${gcsPath}`;
}

async function getAccessToken(): Promise<string> {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token || '';
}

async function submitBatchJob(inputGcsUri: string): Promise<string> {
    console.log('\n🚀 Submitting flashcard batch job...');

    const timestamp = Date.now();
    const outputGcsUri = `gs://${BUCKET_NAME}/batch-jobs/flashcard-output-${timestamp}/`;

    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/batchPredictionJobs`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getAccessToken()}`
        },
        body: JSON.stringify({
            displayName: `flashcard-generation-${timestamp}`,
            model: `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}`,
            inputConfig: {
                instancesFormat: 'jsonl',
                gcsSource: {
                    uris: [inputGcsUri]
                }
            },
            outputConfig: {
                predictionsFormat: 'jsonl',
                gcsDestination: {
                    outputUriPrefix: outputGcsUri
                }
            }
        })
    });

    const job = await response.json();

    if (job.error) {
        throw new Error(`Batch job creation failed: ${job.error.message}`);
    }

    console.log(`✓ Job submitted: ${job.name}`);

    fs.writeFileSync(
        path.join(BATCH_DIR, `flashcard-job-${timestamp}.json`),
        JSON.stringify(job, null, 2)
    );

    return job.name;
}

async function pollJobStatus(jobName: string): Promise<any> {
    console.log('\n⏳ Polling job status...\n');

    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/${jobName}`;

    while (true) {
        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${await getAccessToken()}`
            }
        });

        const job = await response.json();
        const state = job.state;
        const now = new Date().toLocaleTimeString();

        console.log(`[${now}] Status: ${state}`);

        if (state === 'JOB_STATE_SUCCEEDED') {
            console.log('\n✓ Batch job completed successfully!');
            return job;
        }

        if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED') {
            throw new Error(`Job failed with state: ${state}`);
        }

        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}

function validateFlashcard(card: any): boolean {
    return (
        typeof card.front === 'string' &&
        card.front.length > 10 &&
        typeof card.back === 'string' &&
        card.back.length > 5
    );
}

function extractJSON(text: string): any[] {
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1].trim());
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch (e2) { }
        }

        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            try {
                return JSON.parse(arrayMatch[0]);
            } catch (e3) { }
        }

        throw new Error('Could not extract valid JSON');
    }
}

async function downloadAndProcessResults(outputUri: string): Promise<void> {
    console.log('\n📥 Downloading flashcard results...');

    const prefix = outputUri.replace(`gs://${BUCKET_NAME}/`, '');
    const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix });

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const allFlashcards: Record<string, any[]> = {};
    let validCards = 0;

    for (const file of files) {
        if (file.name.endsWith('.jsonl')) {
            console.log(`  Processing: ${file.name}`);

            const [content] = await file.download();
            const lines = content.toString().split('\n').filter(Boolean);

            for (const line of lines) {
                try {
                    const result = JSON.parse(line);
                    const [bookId, bookName, chunkId, sectionTitle] = result.metadata.split('|');

                    const response = result.response;
                    if (!response?.candidates?.[0]) continue;

                    if (!allFlashcards[bookId]) {
                        allFlashcards[bookId] = [];
                    }

                    const text = response.candidates[0].content.parts[0].text;

                    try {
                        const cards = extractJSON(text);

                        for (let i = 0; i < cards.length; i++) {
                            const card = cards[i];

                            if (validateFlashcard(card)) {
                                allFlashcards[bookId].push({
                                    id: `fc-${bookId}-${chunkId}-${i}`,
                                    ...card,
                                    bookId,
                                    topic: bookName,
                                    sourceSection: sectionTitle,
                                    category: card.category || 'quick_recall',
                                    conceptTags: card.conceptTags || [],
                                    difficulty: card.difficulty || 3,
                                    examRelevance: card.examRelevance || 'medium'
                                });
                                validCards++;
                            }
                        }
                    } catch (parseError) {
                        console.log(`    ⚠ ${chunkId}: Parse failed`);
                    }
                } catch (e) { }
            }
        }
    }

    // Save per-book files
    let totalCards = 0;
    for (const [bookId, cards] of Object.entries(allFlashcards)) {
        const outputFile = path.join(OUTPUT_DIR, `${bookId}.json`);
        fs.writeFileSync(outputFile, JSON.stringify(cards, null, 2));
        console.log(`  ✓ Saved ${cards.length} flashcards to ${bookId}.json`);
        totalCards += cards.length;
    }

    // Save index
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'index.json'),
        JSON.stringify({
            generatedAt: new Date().toISOString(),
            model: MODEL_ID,
            totalFlashcards: totalCards,
            books: Object.keys(allFlashcards).map(id => ({
                id,
                flashcardCount: allFlashcards[id].length
            }))
        }, null, 2)
    );

    console.log(`\n📊 Total flashcards: ${totalCards}`);
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║   PULMO-MASTER AI - BATCH FLASHCARD GENERATION                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\nModel: ${MODEL_ID}\n`);

    try {
        const inputFilePath = await createBatchInputFile();
        const inputGcsUri = await uploadToGCS(inputFilePath);
        const jobName = await submitBatchJob(inputGcsUri);
        const completedJob = await pollJobStatus(jobName);
        await downloadAndProcessResults(completedJob.outputInfo.gcsOutputDirectory);

        console.log('\n✅ Flashcard generation complete!');
        console.log(`📁 Results saved to: ${OUTPUT_DIR}`);

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
