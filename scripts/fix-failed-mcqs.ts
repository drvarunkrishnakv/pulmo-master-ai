/**
 * Fix failed MCQs by regenerating with direct API calls
 * Uses the saved failed-chunks file from batch processing
 * 
 * Run with: npx tsx scripts/fix-failed-mcqs.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '../content/generated-mcqs');
const CHUNKS_DIR = path.join(__dirname, '../content/processed/chunks');
const BATCH_DIR = path.join(__dirname, '../content/batch-jobs');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

// Enhanced NEET-SS + INI-SS prompt
const SYSTEM_PROMPT = `You are an expert examiner for NEET-SS and INI-SS Pulmonary Medicine.

Generate MCQs that test Day-1 Super-Specialist competency with a BALANCED MIX of both exam styles.

### Question Style Distribution (per 10 MCQs):
- 3 Clinical Reasoning Chains (NEET-SS): Multi-step scenario → diagnosis → treatment
- 2 Stepwise Management: "Next best step after..." questions
- 2 Data Interpretation: ABG mixed disorders, PFT flow-volume loops, pleural fluid
- 2 Landmark Trials/Physiological Depth (INI-SS): INBUILD, PROSEVA, RECOVERY trials
- 1 Advanced Imaging/Waveform Analysis: HRCT patterns, ventilator graphics

### Content Requirements:
1. Clinical vignettes: 3-5 sentences with SPECIFIC values (FEV1%, ABG numbers, AHI scores)
2. Reference current guidelines: GOLD 2024, GINA 2024, NTEP 2024, ATS/ERS
3. Distractors based on common exam misconceptions
4. Each MCQ MUST have a memorable highYieldPearl

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
    "conceptTags": ["concept1", "concept2"],
    "estimatedDifficulty": 3,
    "guidelineReference": "GOLD 2024"
  }
]

CRITICAL: Return ONLY the JSON array. No markdown, no code blocks, no explanations.`;

interface FailedChunk {
    bookId: string;
    chunkId: string;
    error: string;
}

interface ChunkData {
    id: string;
    bookId: string;
    sectionTitle: string;
    content: string;
}

function findLatestFailedChunksFile(): string | null {
    const files = fs.readdirSync(BATCH_DIR)
        .filter(f => f.startsWith('failed-chunks-') && f.endsWith('.json'))
        .sort()
        .reverse();

    return files.length > 0 ? path.join(BATCH_DIR, files[0]) : null;
}

async function regenerateMCQs(bookName: string, sectionTitle: string, content: string): Promise<any[]> {
    const prompt = `${SYSTEM_PROMPT}

Based on the following medical content from "${bookName}" (section: ${sectionTitle}):

CONTENT:
${content.substring(0, 20000)}

Generate exactly 10 high-yield NEET-SS/INI-SS MCQs as a JSON array.`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.7
                }
            })
        }
    );

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('No text in response');
    }

    return JSON.parse(text);
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║      FIX FAILED MCQs - DIRECT API REGENERATION                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (!GEMINI_API_KEY) {
        console.error('ERROR: VITE_GEMINI_API_KEY not set');
        console.log('Run with: VITE_GEMINI_API_KEY=your_key npx tsx scripts/fix-failed-mcqs.ts');
        process.exit(1);
    }

    // Find failed chunks file
    const failedFile = findLatestFailedChunksFile();
    if (!failedFile) {
        console.log('✓ No failed chunks file found - nothing to fix!');
        return;
    }

    console.log(`📁 Using: ${path.basename(failedFile)}\n`);

    const failedChunks: FailedChunk[] = JSON.parse(fs.readFileSync(failedFile, 'utf-8'));
    console.log(`Found ${failedChunks.length} failed chunks to retry\n`);

    if (failedChunks.length === 0) {
        console.log('✓ No failed chunks to fix!');
        return;
    }

    // Load chunk files
    const chunkFiles: Record<string, ChunkData[]> = {};
    const bookNames: Record<string, string> = {};

    // Read book index to get display names
    const indexFile = path.join(__dirname, '../content/processed/index.json');
    if (fs.existsSync(indexFile)) {
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
        for (const book of index.books) {
            bookNames[book.id] = book.name;
        }
    }

    for (const fc of failedChunks) {
        if (!chunkFiles[fc.bookId]) {
            const chunkFile = path.join(CHUNKS_DIR, `${fc.bookId}.json`);
            if (fs.existsSync(chunkFile)) {
                chunkFiles[fc.bookId] = JSON.parse(fs.readFileSync(chunkFile, 'utf-8'));
            }
        }
    }

    // Regenerate each failed chunk
    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < failedChunks.length; i++) {
        const fc = failedChunks[i];
        const bookName = bookNames[fc.bookId] || fc.bookId;

        console.log(`[${i + 1}/${failedChunks.length}] 🔄 ${fc.chunkId}`);

        const chunks = chunkFiles[fc.bookId];
        if (!chunks) {
            console.log('  ⚠️ Chunk file not found');
            failed++;
            continue;
        }

        const chunk = chunks.find((c: ChunkData) => c.id === fc.chunkId);
        if (!chunk) {
            console.log('  ⚠️ Chunk not found in file');
            failed++;
            continue;
        }

        try {
            // Rate limiting - 2 second delay
            await new Promise(r => setTimeout(r, 2000));

            const mcqs = await regenerateMCQs(bookName, chunk.sectionTitle, chunk.content);
            console.log(`  ✓ Generated ${mcqs.length} MCQs`);

            // Load existing book MCQs and add new ones
            const bookFile = path.join(OUTPUT_DIR, `${fc.bookId}.json`);
            let existingMCQs: any[] = [];
            if (fs.existsSync(bookFile)) {
                existingMCQs = JSON.parse(fs.readFileSync(bookFile, 'utf-8'));
            }

            // Add new MCQs with proper metadata
            for (let j = 0; j < mcqs.length; j++) {
                const mcq = mcqs[j];
                existingMCQs.push({
                    id: `${fc.bookId}-${fc.chunkId}-retry-${j}`,
                    ...mcq,
                    topic: bookName,
                    bookId: fc.bookId,
                    chunkId: fc.chunkId,
                    sourceSection: chunk.sectionTitle,
                    generatedAt: Date.now(),
                    // Ensure defaults for new fields
                    examStyle: mcq.examStyle || 'NEET-SS',
                    questionStyle: mcq.questionStyle || 'clinical_reasoning',
                    conceptTags: mcq.conceptTags || [],
                    estimatedDifficulty: mcq.estimatedDifficulty || 3,
                    guidelineReference: mcq.guidelineReference || null
                });
            }

            fs.writeFileSync(bookFile, JSON.stringify(existingMCQs, null, 2));
            fixed++;
        } catch (e: any) {
            console.log(`  ❌ Error: ${e.message}`);
            failed++;
        }
    }

    // Update index
    console.log('\n📊 Updating index...');
    const allFiles = fs.readdirSync(OUTPUT_DIR)
        .filter(f => f.endsWith('.json') && f !== 'index.json');

    let totalMCQs = 0;
    const books = allFiles.map(f => {
        const mcqs = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf-8'));
        totalMCQs += mcqs.length;
        return { id: f.replace('.json', ''), mcqCount: mcqs.length };
    });

    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        model: 'gemini-2.5-flash',
        totalMCQs,
        fixedChunks: fixed,
        books
    }, null, 2));

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    FIX COMPLETE                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\n📊 Fixed: ${fixed}/${failedChunks.length}`);
    console.log(`📊 Still failed: ${failed}`);
    console.log(`📊 Total MCQs now: ${totalMCQs}`);
}

main().catch(console.error);
