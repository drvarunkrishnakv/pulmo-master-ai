/**
 * Batch MCQ Generation using Gemini via Vertex AI
 * 
 * CRITICAL: This generates the knowledge base for the entire app.
 * 
 * This script:
 * 1. Creates input JSONL with all chunk prompts
 * 2. Uploads to GCS
 * 3. Submits batch prediction job
 * 4. Polls for completion
 * 5. Downloads, validates, and saves results
 * 
 * Run with: npm run generate-mcqs-batch
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
const MODEL_ID = 'gemini-2.5-flash'; // PRODUCTION model - NOT preview

const CHUNKS_DIR = path.join(__dirname, '../content/processed/chunks');
const INDEX_FILE = path.join(__dirname, '../content/processed/index.json');
const OUTPUT_DIR = path.join(__dirname, '../content/generated-mcqs');
const BATCH_DIR = path.join(__dirname, '../content/batch-jobs');

// MCQ distribution by book (based on size + exam relevance)
const MCQ_TARGETS: Record<string, number> = {
    'pneumonia-ocr-complete': 200,
    'pneumonia-2-ocr-complete': 200,
    '30-tuberculosis-integrated-session-2-ocr-complete--1-': 350,
    '82-end-tb-strategy-ocr-complete--1-': 300,
    '67-sleep-disorders-clssfcn-physio-ocr-complete--1-': 250,
    '79-phtn-ocr-complete--1-': 250,
    '12-asthma-mx-2-ocr-complete--1-': 200,
    '61-diagnsis-staging-mx-ocr-complete--1-': 150,
    '52-iips-other-than-ipf-nsip-rbild-ocr-complete--1-': 150,
    '2-pleural-effusion-ocr-complete--1-': 150,
    '23-mv-in-asthma-copd-ocr-complete--1-': 150,
    '89-ntm-part-2-ocr-complete--1-': 100,
    '86-spinal-tb-skeletal-tb-ocr-complete--1-': 100,
    '54-ctd-and-lung-part2-hypersensitive-pneumo-ocr-complete--1-': 100,
    '55-sarcoidosis-ocr-complete--1-': 100,
    '63-lymph-node-tb-ocr-complete--1-': 80,
    '62-pleural-tb-ocr-complete--1-': 80,
    '56-occupational-lung-diseases-ocr-complete--1-': 60,
    '102-recent-advances-in-ards-ocr-complete--1-': 30,
    '42-non-invasive-ventilation-ocr-complete--1-': 30,
    '40-pft-series--impulse-oslmtry-feno-tests-for-sad-ocr-complete--1-': 20,
    '88-ntm-mott-ocr-complete--1-': 10,
    '69-endobronchial-tb-ocr-complete--1-': 10
};

// Initialize clients
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

// Enhanced system prompt for NEET-SS + INI-SS
const SYSTEM_PROMPT = `You are an expert examiner for NEET-SS and INI-SS Pulmonary Medicine.

Generate MCQs that test Day-1 Super-Specialist competency with a BALANCED MIX of both exam styles.

### Question Style Distribution (per 10 MCQs):
- 3 Clinical Reasoning Chains (NEET-SS): Multi-step scenario → diagnosis → treatment
- 2 Stepwise Management: "Next best step after..." questions
- 2 Data Interpretation: ABG mixed disorders, PFT flow-volume loops, pleural fluid
- 2 Landmark Trials/Physiological Depth (INI-SS): INBUILD, PROSEVA, RECOVERY trials
- 1 Advanced Imaging/Waveform Analysis: HRCT patterns, ventilator graphics

### Option Requirements:
- Use "Most Appropriate" style (all options valid but one is BEST)
- Include dose-specific options for TB/DR-TB regimens where relevant
- Include 1-2 "EXCEPT" or "NOT" questions per set

### Content Requirements:
1. Clinical vignettes: 3-5 sentences with SPECIFIC values (FEV1%, ABG numbers, AHI scores)
2. Reference current guidelines: GOLD 2024, GINA 2024, NTEP 2024, ATS/ERS
3. Reference landmark trials where relevant: INBUILD, PROSEVA, RECOVERY, PANTHER-IPF
4. Distractors based on common exam misconceptions
5. Each MCQ MUST have a memorable highYieldPearl with a specific fact

### High-Yield Focus:
- Obstructive: COPD (GOLD 2024), Asthma (GINA), Biologics
- ILD: IPF (Antifibrotics, GAP), Sarcoidosis (Scadding), HP (HRCT patterns)
- Infections: TB (NTEP 2024, BPaLM), Fungal (ABPA), Pneumonia (CURB-65/PSI)
- Critical Care: Ventilation (ARDSnet, waveforms), Sepsis-3, Mixed acid-base

### STRICT JSON FORMAT - Return ONLY a valid JSON array:
[
  {
    "question": "A 55-year-old male with progressive dyspnea...",
    "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
    "correctAnswer": "A",
    "explanation": "A is correct because... B is wrong because...",
    "deepDiveExplanation": "Detailed pathophysiology and mechanism...",
    "highYieldPearl": "Remember: specific memorable fact with numbers",
    "examStyle": "NEET-SS",
    "questionStyle": "clinical_reasoning",
    "conceptTags": ["COPD", "GOLD 2024", "Exacerbation"],
    "estimatedDifficulty": 3,
    "guidelineReference": "GOLD 2024"
  }
]

CRITICAL: Return ONLY the JSON array. No markdown, no explanations, no code blocks.`;

// Calculate MCQs per chunk based on book target
function getMCQsPerChunk(bookId: string, totalChunks: number): number {
    const target = MCQ_TARGETS[bookId] || 50;
    const perChunk = Math.ceil(target / totalChunks);
    return Math.max(5, Math.min(15, perChunk)); // Between 5-15 per chunk
}

async function createBatchInputFile(): Promise<string> {
    console.log('\n📋 Creating batch input file...\n');

    // Load book index
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    const books = index.books;

    const batchRequests: BatchRequest[] = [];
    let totalChunks = 0;
    let expectedMCQs = 0;

    for (const book of books) {
        const chunksFile = path.join(CHUNKS_DIR, `${book.id}.json`);

        if (!fs.existsSync(chunksFile)) {
            console.log(`  Skipping ${book.name} - no chunks file`);
            continue;
        }

        const chunks: Chunk[] = JSON.parse(fs.readFileSync(chunksFile, 'utf-8'));
        const mcqsPerChunk = getMCQsPerChunk(book.id, chunks.length);

        console.log(`  📚 ${book.name}: ${chunks.length} chunks × ${mcqsPerChunk} MCQs = ~${chunks.length * mcqsPerChunk} MCQs`);
        expectedMCQs += chunks.length * mcqsPerChunk;

        for (const chunk of chunks) {
            const prompt = `${SYSTEM_PROMPT}

Based on the following medical content from "${book.name}" (section: ${chunk.sectionTitle}):

CONTENT:
${chunk.content.substring(0, 20000)}

Generate exactly ${mcqsPerChunk} high-yield NEET-SS/INI-SS MCQs as a JSON array.`;

            batchRequests.push({
                request: {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.7
                    }
                },
                metadata: `${book.id}|${book.name}|${chunk.id}|${chunk.sectionTitle}|${mcqsPerChunk}`
            });

            totalChunks++;
        }
    }

    console.log(`\n✓ Total requests: ${totalChunks}`);
    console.log(`✓ Expected MCQs: ~${expectedMCQs}`);

    // Create JSONL file
    if (!fs.existsSync(BATCH_DIR)) {
        fs.mkdirSync(BATCH_DIR, { recursive: true });
    }

    const timestamp = Date.now();
    const inputFileName = `batch-input-${timestamp}.jsonl`;
    const inputFilePath = path.join(BATCH_DIR, inputFileName);

    const jsonlContent = batchRequests.map(req => JSON.stringify(req)).join('\n');
    fs.writeFileSync(inputFilePath, jsonlContent);

    console.log(`✓ Created: ${inputFilePath}`);
    console.log(`  Size: ${(fs.statSync(inputFilePath).size / 1024 / 1024).toFixed(2)} MB`);

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
    console.log('\n🚀 Submitting batch job...');

    const timestamp = Date.now();
    const outputGcsUri = `gs://${BUCKET_NAME}/batch-jobs/output-${timestamp}/`;

    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/batchPredictionJobs`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getAccessToken()}`
        },
        body: JSON.stringify({
            displayName: `mcq-generation-v2-${timestamp}`,
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
    console.log(`  Output will be at: ${outputGcsUri}`);

    fs.writeFileSync(
        path.join(BATCH_DIR, `job-${timestamp}.json`),
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
            throw new Error(`Job failed with state: ${state}\n${JSON.stringify(job.error, null, 2)}`);
        }

        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}

// Validate MCQ structure
function validateMCQ(mcq: any): boolean {
    return (
        typeof mcq.question === 'string' &&
        mcq.question.length > 20 &&
        mcq.options &&
        typeof mcq.options.A === 'string' &&
        typeof mcq.options.B === 'string' &&
        typeof mcq.options.C === 'string' &&
        typeof mcq.options.D === 'string' &&
        ['A', 'B', 'C', 'D'].includes(mcq.correctAnswer) &&
        typeof mcq.explanation === 'string'
    );
}

// Extract JSON from potentially wrapped content
function extractJSON(text: string): any[] {
    // Try direct parse first
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        // Try extracting from markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1].trim());
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch (e2) {
                // Continue to next attempt
            }
        }

        // Try finding array brackets
        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            try {
                return JSON.parse(arrayMatch[0]);
            } catch (e3) {
                // Continue
            }
        }

        throw new Error('Could not extract valid JSON');
    }
}

async function downloadAndProcessResults(outputUri: string): Promise<void> {
    console.log('\n📥 Downloading and validating results...');

    const prefix = outputUri.replace(`gs://${BUCKET_NAME}/`, '');
    const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix });

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const allMCQs: Record<string, any[]> = {};
    const failedChunks: Array<{ bookId: string; chunkId: string; error: string }> = [];
    let validMCQs = 0;
    let invalidMCQs = 0;

    for (const file of files) {
        if (file.name.endsWith('.jsonl')) {
            console.log(`  Processing: ${file.name}`);

            const [content] = await file.download();
            const lines = content.toString().split('\n').filter(Boolean);

            for (const line of lines) {
                try {
                    const result = JSON.parse(line);
                    const [bookId, bookName, chunkId, sectionTitle, expectedCount] = result.metadata.split('|');

                    const response = result.response;

                    if (!response || !response.candidates || !response.candidates[0]) {
                        failedChunks.push({ bookId, chunkId, error: 'No response from model' });
                        continue;
                    }

                    if (!allMCQs[bookId]) {
                        allMCQs[bookId] = [];
                    }

                    const text = response.candidates[0].content.parts[0].text;

                    try {
                        const mcqs = extractJSON(text);

                        for (let i = 0; i < mcqs.length; i++) {
                            const mcq = mcqs[i];

                            if (validateMCQ(mcq)) {
                                allMCQs[bookId].push({
                                    id: `${bookId}-${chunkId}-${i}`,
                                    ...mcq,
                                    topic: bookName,
                                    bookId: bookId,
                                    chunkId: chunkId,
                                    sourceSection: sectionTitle,
                                    generatedAt: Date.now(),
                                    // Ensure new fields exist with defaults
                                    examStyle: mcq.examStyle || 'NEET-SS',
                                    questionStyle: mcq.questionStyle || 'clinical_reasoning',
                                    conceptTags: mcq.conceptTags || [],
                                    estimatedDifficulty: mcq.estimatedDifficulty || 3,
                                    guidelineReference: mcq.guidelineReference || null
                                });
                                validMCQs++;
                            } else {
                                invalidMCQs++;
                            }
                        }
                        console.log(`    ✓ ${chunkId}: ${mcqs.length} parsed, ${mcqs.filter(validateMCQ).length} valid`);
                    } catch (parseError: any) {
                        failedChunks.push({ bookId, chunkId, error: parseError.message });
                        console.log(`    ⚠ ${chunkId}: Parse failed - ${parseError.message}`);
                    }
                } catch (e: any) {
                    console.log(`    ✗ Line parse error: ${e.message}`);
                }
            }
        }
    }

    // Save per-book files
    let totalMCQs = 0;
    for (const [bookId, mcqs] of Object.entries(allMCQs)) {
        const outputFile = path.join(OUTPUT_DIR, `${bookId}.json`);
        fs.writeFileSync(outputFile, JSON.stringify(mcqs, null, 2));
        console.log(`  ✓ Saved ${mcqs.length} MCQs to ${bookId}.json`);
        totalMCQs += mcqs.length;
    }

    // Save index
    const indexData = {
        generatedAt: new Date().toISOString(),
        model: MODEL_ID,
        totalMCQs,
        validMCQs,
        invalidMCQs,
        failedChunks: failedChunks.length,
        books: Object.keys(allMCQs).map(id => ({
            id,
            mcqCount: allMCQs[id].length
        }))
    };

    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'index.json'),
        JSON.stringify(indexData, null, 2)
    );

    // Save failed chunks for retry
    if (failedChunks.length > 0) {
        fs.writeFileSync(
            path.join(BATCH_DIR, `failed-chunks-${Date.now()}.json`),
            JSON.stringify(failedChunks, null, 2)
        );
        console.log(`\n⚠ ${failedChunks.length} chunks failed - saved for retry`);
    }

    console.log(`\n📊 Generation Summary:`);
    console.log(`   Total MCQs: ${totalMCQs}`);
    console.log(`   Valid: ${validMCQs}`);
    console.log(`   Invalid: ${invalidMCQs}`);
    console.log(`   Failed chunks: ${failedChunks.length}`);
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  PULMO-MASTER AI - BATCH MCQ GENERATION (NEET-SS + INI-SS)     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\nProject: ${PROJECT_ID}`);
    console.log(`Bucket: ${BUCKET_NAME}`);
    console.log(`Model: ${MODEL_ID} (PRODUCTION)\n`);

    try {
        // Step 1: Create batch input file
        const inputFilePath = await createBatchInputFile();

        // Step 2: Upload to GCS
        const inputGcsUri = await uploadToGCS(inputFilePath);

        // Step 3: Submit batch job
        const jobName = await submitBatchJob(inputGcsUri);

        // Step 4: Poll for completion
        const completedJob = await pollJobStatus(jobName);

        // Step 5: Download, validate, and process results
        await downloadAndProcessResults(completedJob.outputInfo.gcsOutputDirectory);

        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║                    BATCH GENERATION COMPLETE                   ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log(`\n📁 Results saved to: ${OUTPUT_DIR}`);

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
