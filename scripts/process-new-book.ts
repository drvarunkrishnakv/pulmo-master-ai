/**
 * Unified Book Processing Pipeline
 * 
 * One command to process new books:
 * 1. Detects unprocessed books in content/books/
 * 2. Chunks them into sections
 * 3. Generates MCQs via Vertex AI Batch API
 * 4. Generates flashcards via Vertex AI Batch API
 * 
 * Run with: npm run process-book
 */

import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ID = 'pulmo-master';
const LOCATION = 'us-central1';
const BUCKET_NAME = 'pulmo-master.firebasestorage.app';
const MODEL_ID = 'gemini-2.5-flash';

const BOOKS_DIR = path.join(__dirname, '../content/books');
const PROCESSED_DIR = path.join(__dirname, '../content/processed');
const CHUNKS_DIR = path.join(PROCESSED_DIR, 'chunks');
const MCQS_DIR = path.join(__dirname, '../content/generated-mcqs');
const FLASHCARDS_DIR = path.join(__dirname, '../content/generated-flashcards');
const BATCH_DIR = path.join(__dirname, '../content/batch-jobs');
const INDEX_FILE = path.join(PROCESSED_DIR, 'index.json');

// Chunking configuration
const TARGET_CHUNK_SIZE = 10000;
const MIN_CHUNK_SIZE = 4000;
const MAX_CHUNK_SIZE = 15000;

// Generation configuration
const MCQS_PER_CHUNK = 8;  // ~8 MCQs per chunk
const FLASHCARDS_PER_CHUNK = 3;  // ~3 flashcards per chunk

const storage = new Storage({ projectId: PROJECT_ID });

// ============================================================================
// INTERFACES
// ============================================================================

interface SubTopic {
    id: string;
    name: string;
    chunkIndices: number[];
}

interface BookMeta {
    id: string;
    name: string;
    fileName: string;
    totalChunks: number;
    totalCharacters: number;
    subTopics: SubTopic[];
    processedAt: number;
}

interface ChunkData {
    id: string;
    bookId: string;
    sectionTitle: string;
    content: string;
    wordCount: number;
    index: number;
    subTopicId?: string;
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

// ============================================================================
// PROMPTS
// ============================================================================

const MCQ_SYSTEM_PROMPT = `You are an expert examiner for NEET-SS and INI-SS Pulmonary Medicine.

Generate MCQs that test Day-1 Super-Specialist competency with a BALANCED MIX of both exam styles.

### Question Styles (Mix Evenly):
1. NEET-SS Style: Clinical vignette → Best next step / Most likely diagnosis
2. INI-SS Style: "All are true EXCEPT", "Which is NOT a feature of", factual recalls

### STRICT REQUIREMENTS:
1. Each MCQ MUST have a unique clinical scenario or factual question
2. Options must be plausible - no obviously wrong answers
3. Explanation must reference source content directly
4. trapAnalysis must explain why students pick WRONG options
5. Each MCQ MUST have a memorable highYieldPearl with a specific fact

### STRICT JSON FORMAT - Return ONLY a valid JSON array:
[
  {
    "question": "A 55-year-old male smoker presents with...",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "correctAnswer": "B",
    "explanation": "Detailed explanation...",
    "highYieldPearl": "Key fact to remember",
    "trapAnalysis": { "A": "Why students pick A", "C": "Why students pick C", "D": "Why students pick D" },
    "examStyle": "NEET-SS",
    "conceptTags": ["COPD", "GOLD 2024"],
    "estimatedDifficulty": 3
  }
]

CRITICAL: Return ONLY the JSON array. No markdown, no explanations, no code blocks.`;

const FLASHCARD_SYSTEM_PROMPT = `You are an expert medical educator for NEET-SS/INI-SS Pulmonary Medicine.

Generate HIGH-YIELD FLASHCARDS for spaced repetition learning. Focus on:
- Diagnostic criteria and classifications
- Drug doses and regimens (especially TB)
- Numerical thresholds and cutoffs
- Key differentiating features
- Guideline recommendations (GOLD, GINA, NTEP)
- Radiology pattern recognition (HRCT, X-ray findings)

### Flashcard Types:
1. Diagnostic criteria (e.g., "What are the diagnostic criteria for IPF?")
2. Classification systems (e.g., "What are the Scadding stages?")
3. Drug regimens with doses
4. Numerical values (e.g., "What AHI defines severe OSA?")
5. Pattern Recognition (e.g., "Identify: Bilateral basal honeycombing")

### STRICT JSON FORMAT - Return ONLY a valid JSON array:
[
  {
    "front": "What are the diagnostic criteria for IPF on HRCT?",
    "back": "UIP pattern: Basal/subpleural, reticular, honeycombing, traction bronchiectasis.",
    "category": "diagnostic_criteria",
    "conceptTags": ["IPF", "HRCT", "UIP pattern"],
    "difficulty": 3
  }
]

Categories: diagnostic_criteria, classification, drug_regimen, numerical_value, quick_recall, procedure, guideline, pattern_recognition

CRITICAL: Return ONLY the JSON array. No markdown, no explanations.`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const generateId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

const toBookId = (fileName: string): string => {
    return fileName
        .replace('.md', '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
};

const extractSectionTitle = (content: string): string => {
    const lines = content.split('\n');
    for (const line of lines) {
        const match = line.match(/^#+\s+(.+)/);
        if (match) return match[1].trim();
    }
    const firstLine = lines.find(l => l.trim().length > 0);
    return firstLine ? firstLine.substring(0, 50).trim() : 'Untitled Section';
};

async function getAccessToken(): Promise<string> {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token || '';
}

// ============================================================================
// PHASE 1: DETECTION
// ============================================================================

function detectUnprocessedBooks(): string[] {
    console.log('\n🔍 Detecting unprocessed books...\n');

    // Ensure directories exist
    [PROCESSED_DIR, CHUNKS_DIR, MCQS_DIR, FLASHCARDS_DIR, BATCH_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    const bookFiles = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.md'));
    const existingChunks = fs.existsSync(CHUNKS_DIR)
        ? fs.readdirSync(CHUNKS_DIR).map(f => f.replace('.json', ''))
        : [];

    const newBooks: string[] = [];

    for (const bookFile of bookFiles) {
        const bookId = toBookId(bookFile);
        if (!existingChunks.includes(bookId)) {
            newBooks.push(bookFile);
            console.log(`  📘 NEW: ${bookFile}`);
        } else {
            console.log(`  ✓ Already processed: ${bookFile}`);
        }
    }

    console.log(`\n  Found ${newBooks.length} new book(s) to process`);
    return newBooks;
}

// ============================================================================
// PHASE 2: CHUNKING
// ============================================================================

function chunkBook(bookFile: string): { meta: BookMeta; chunks: ChunkData[] } {
    const filePath = path.join(BOOKS_DIR, bookFile);
    const content = fs.readFileSync(filePath, 'utf-8');
    const bookId = toBookId(bookFile);
    const bookName = bookFile.replace('.md', '').replace(/_/g, ' ');

    console.log(`\n📖 Chunking: ${bookName}`);

    // Split by headings
    const sections = content.split(/(?=^#{1,3}\s)/m).filter(s => s.trim().length > MIN_CHUNK_SIZE / 2);

    // Merge small sections, split large ones
    const chunks: ChunkData[] = [];
    let currentSection = '';

    for (const section of sections) {
        currentSection += section;

        if (currentSection.length >= TARGET_CHUNK_SIZE || section === sections[sections.length - 1]) {
            // Split if too large
            if (currentSection.length > MAX_CHUNK_SIZE) {
                const parts = currentSection.match(new RegExp(`.{1,${TARGET_CHUNK_SIZE}}`, 'gs')) || [currentSection];
                for (const part of parts) {
                    if (part.trim().length > MIN_CHUNK_SIZE / 2) {
                        chunks.push({
                            id: `${bookId}-chunk-${chunks.length}`,
                            bookId,
                            sectionTitle: extractSectionTitle(part),
                            content: part.trim(),
                            wordCount: countWords(part),
                            index: chunks.length
                        });
                    }
                }
            } else if (currentSection.trim().length > MIN_CHUNK_SIZE / 2) {
                chunks.push({
                    id: `${bookId}-chunk-${chunks.length}`,
                    bookId,
                    sectionTitle: extractSectionTitle(currentSection),
                    content: currentSection.trim(),
                    wordCount: countWords(currentSection),
                    index: chunks.length
                });
            }
            currentSection = '';
        }
    }

    const meta: BookMeta = {
        id: bookId,
        name: bookName,
        fileName: bookFile,
        totalChunks: chunks.length,
        totalCharacters: content.length,
        subTopics: [],
        processedAt: Date.now()
    };

    // Save chunks
    fs.writeFileSync(path.join(CHUNKS_DIR, `${bookId}.json`), JSON.stringify(chunks, null, 2));
    console.log(`  ✓ Created ${chunks.length} chunks`);

    return { meta, chunks };
}

function updateProcessedIndex(newMeta: BookMeta): void {
    let index: { books: BookMeta[]; lastUpdated: number } = { books: [], lastUpdated: 0 };

    if (fs.existsSync(INDEX_FILE)) {
        index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    }

    // Add or update book
    const existingIdx = index.books.findIndex(b => b.id === newMeta.id);
    if (existingIdx >= 0) {
        index.books[existingIdx] = newMeta;
    } else {
        index.books.push(newMeta);
    }

    index.lastUpdated = Date.now();
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

// ============================================================================
// PHASE 3: BATCH MCQ GENERATION
// ============================================================================

async function generateMCQsForBooks(bookChunks: Map<string, { meta: BookMeta; chunks: ChunkData[] }>): Promise<void> {
    if (bookChunks.size === 0) return;

    console.log('\n🎯 PHASE 3: MCQ Generation via Batch API\n');

    const batchRequests: BatchRequest[] = [];
    let expectedMCQs = 0;

    for (const [bookId, { meta, chunks }] of bookChunks) {
        const totalMCQs = Math.min(300, Math.max(50, chunks.length * MCQS_PER_CHUNK));
        const mcqsPerChunk = Math.ceil(totalMCQs / chunks.length);

        console.log(`  📚 ${meta.name}: ${chunks.length} chunks × ${mcqsPerChunk} = ~${totalMCQs} MCQs`);
        expectedMCQs += totalMCQs;

        for (const chunk of chunks) {
            const prompt = `${MCQ_SYSTEM_PROMPT}

Based on the following medical content from "${meta.name}" (section: ${chunk.sectionTitle}):

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
                metadata: `mcq|${bookId}|${meta.name}|${chunk.id}|${chunk.sectionTitle}|${mcqsPerChunk}`
            });
        }
    }

    console.log(`\n  Total MCQ requests: ${batchRequests.length}`);
    console.log(`  Expected MCQs: ~${expectedMCQs}`);

    await submitAndProcessBatch(batchRequests, 'mcq');
}

// ============================================================================
// PHASE 4: BATCH FLASHCARD GENERATION
// ============================================================================

async function generateFlashcardsForBooks(bookChunks: Map<string, { meta: BookMeta; chunks: ChunkData[] }>): Promise<void> {
    if (bookChunks.size === 0) return;

    console.log('\n🃏 PHASE 4: Flashcard Generation via Batch API\n');

    const batchRequests: BatchRequest[] = [];
    let expectedCards = 0;

    for (const [bookId, { meta, chunks }] of bookChunks) {
        const totalCards = Math.min(100, Math.max(20, chunks.length * FLASHCARDS_PER_CHUNK));
        const cardsPerChunk = Math.ceil(totalCards / chunks.length);

        console.log(`  📚 ${meta.name}: ${chunks.length} chunks × ${cardsPerChunk} = ~${totalCards} flashcards`);
        expectedCards += totalCards;

        for (const chunk of chunks) {
            const prompt = `${FLASHCARD_SYSTEM_PROMPT}

Based on the following medical content from "${meta.name}" (section: ${chunk.sectionTitle}):

CONTENT:
${chunk.content.substring(0, 20000)}

Generate exactly ${cardsPerChunk} high-yield flashcards as a JSON array.`;

            batchRequests.push({
                request: {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.7
                    }
                },
                metadata: `flashcard|${bookId}|${meta.name}|${chunk.id}|${chunk.sectionTitle}|${cardsPerChunk}`
            });
        }
    }

    console.log(`\n  Total flashcard requests: ${batchRequests.length}`);
    console.log(`  Expected flashcards: ~${expectedCards}`);

    await submitAndProcessBatch(batchRequests, 'flashcard');
}

// ============================================================================
// BATCH API FUNCTIONS
// ============================================================================

async function submitAndProcessBatch(requests: BatchRequest[], type: 'mcq' | 'flashcard'): Promise<void> {
    const timestamp = Date.now();
    const inputFileName = `${type}-batch-input-${timestamp}.jsonl`;
    const inputFilePath = path.join(BATCH_DIR, inputFileName);

    // Create JSONL file
    const jsonlContent = requests.map(req => JSON.stringify(req)).join('\n');
    fs.writeFileSync(inputFilePath, jsonlContent);
    console.log(`\n  ✓ Created batch file: ${inputFileName}`);

    // Upload to GCS
    const gcsPath = `batch-jobs/${inputFileName}`;
    await storage.bucket(BUCKET_NAME).upload(inputFilePath, { destination: gcsPath });
    console.log(`  ✓ Uploaded to GCS`);

    // Submit batch job
    const outputGcsUri = `gs://${BUCKET_NAME}/batch-jobs/${type}-output-${timestamp}/`;
    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/batchPredictionJobs`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getAccessToken()}`
        },
        body: JSON.stringify({
            displayName: `${type}-generation-${timestamp}`,
            model: `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}`,
            inputConfig: {
                instancesFormat: 'jsonl',
                gcsSource: { uris: [`gs://${BUCKET_NAME}/${gcsPath}`] }
            },
            outputConfig: {
                predictionsFormat: 'jsonl',
                gcsDestination: { outputUriPrefix: outputGcsUri }
            }
        })
    });

    const job = await response.json();
    if (job.error) {
        throw new Error(`Batch job failed: ${job.error.message}`);
    }

    console.log(`  ✓ Job submitted: ${job.name}`);
    fs.writeFileSync(path.join(BATCH_DIR, `${type}-job-${timestamp}.json`), JSON.stringify(job, null, 2));

    // Poll for completion
    console.log('\n  ⏳ Polling for completion (this may take 10-30 minutes)...\n');
    const completedJob = await pollJobStatus(job.name);

    // Process results
    await processResults(completedJob.outputInfo.gcsOutputDirectory, type);
}

async function pollJobStatus(jobName: string): Promise<any> {
    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/${jobName}`;

    while (true) {
        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${await getAccessToken()}` }
        });

        const job = await response.json();
        const state = job.state;
        const now = new Date().toLocaleTimeString();

        console.log(`  [${now}] Status: ${state}`);

        if (state === 'JOB_STATE_SUCCEEDED') {
            console.log('\n  ✓ Batch job completed!');
            return job;
        }

        if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED') {
            throw new Error(`Job failed: ${state}\n${JSON.stringify(job.error, null, 2)}`);
        }

        await new Promise(resolve => setTimeout(resolve, 30000)); // Poll every 30s
    }
}

async function processResults(outputUri: string, type: 'mcq' | 'flashcard'): Promise<void> {
    console.log(`\n  📥 Processing ${type} results...`);

    const prefix = outputUri.replace(`gs://${BUCKET_NAME}/`, '');
    const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix });

    const results: Record<string, any[]> = {};
    let validCount = 0;
    let invalidCount = 0;

    for (const file of files) {
        if (file.name.endsWith('.jsonl')) {
            const [content] = await file.download();
            const lines = content.toString().split('\n').filter(Boolean);

            for (const line of lines) {
                try {
                    const result = JSON.parse(line);
                    const metaParts = result.metadata.split('|');
                    const bookId = metaParts[1];
                    const bookName = metaParts[2];
                    const chunkId = metaParts[3];

                    if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) continue;

                    const text = result.response.candidates[0].content.parts[0].text;
                    const items = extractJSON(text);

                    if (!results[bookId]) results[bookId] = [];

                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        if (validateItem(item, type)) {
                            results[bookId].push({
                                id: `${bookId}-${chunkId}-${i}`,
                                ...item,
                                topic: bookName,
                                bookId,
                                generatedAt: Date.now()
                            });
                            validCount++;
                        } else {
                            invalidCount++;
                        }
                    }
                } catch (e) {
                    // Skip parse errors
                }
            }
        }
    }

    // Save results
    const outputDir = type === 'mcq' ? MCQS_DIR : FLASHCARDS_DIR;
    for (const [bookId, items] of Object.entries(results)) {
        const outputFile = path.join(outputDir, `${bookId}.json`);

        // Merge with existing if present
        let existing: any[] = [];
        if (fs.existsSync(outputFile)) {
            existing = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        }

        const merged = [...existing, ...items];
        fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2));
        console.log(`  ✓ Saved ${items.length} ${type}s to ${bookId}.json`);
    }

    console.log(`\n  📊 ${type.toUpperCase()} Summary: ${validCount} valid, ${invalidCount} invalid`);
}

function extractJSON(text: string): any[] {
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { }
        }
        return [];
    }
}

function validateItem(item: any, type: 'mcq' | 'flashcard'): boolean {
    if (type === 'mcq') {
        return item.question && item.options?.A && item.options?.B &&
            item.options?.C && item.options?.D && item.correctAnswer;
    } else {
        return item.front && item.back;
    }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     PULMO-MASTER AI - UNIFIED BOOK PROCESSING PIPELINE        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\nProject: ${PROJECT_ID}`);
    console.log(`Model: ${MODEL_ID}\n`);

    try {
        // Phase 1: Detection
        const newBooks = detectUnprocessedBooks();

        if (newBooks.length === 0) {
            console.log('\n✓ All books are already processed. Nothing to do.');
            return;
        }

        // Phase 2: Chunking
        console.log('\n📦 PHASE 2: Chunking New Books\n');
        const bookChunks = new Map<string, { meta: BookMeta; chunks: ChunkData[] }>();

        for (const bookFile of newBooks) {
            const result = chunkBook(bookFile);
            bookChunks.set(result.meta.id, result);
            updateProcessedIndex(result.meta);
        }

        // Phase 3: MCQ Generation
        await generateMCQsForBooks(bookChunks);

        // Phase 4: Flashcard Generation
        await generateFlashcardsForBooks(bookChunks);

        // Done!
        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║                    PROCESSING COMPLETE                         ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log(`\n✓ Processed ${newBooks.length} book(s)`);
        console.log('✓ MCQs saved to content/generated-mcqs/');
        console.log('✓ Flashcards saved to content/generated-flashcards/');

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
