/**
 * Pre-generate MCQs for all book sections
 * Uses Gemini 2.5 Flash to generate 10 MCQs per chunk
 * Run with: npm run generate-mcqs
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || '';
const MCQs_PER_CHUNK = 10;
const OUTPUT_DIR = path.join(__dirname, '../content/generated-mcqs');
const CHUNKS_DIR = path.join(__dirname, '../content/processed/chunks');
const INDEX_FILE = path.join(__dirname, '../content/processed/index.json');

interface Chunk {
    id: string;
    bookId: string;
    sectionTitle: string;
    content: string;
    headings: string[];
}

interface GeneratedMCQ {
    id: string;
    question: string;
    options: { A: string; B: string; C: string; D: string };
    correctAnswer: 'A' | 'B' | 'C' | 'D';
    explanation: string;
    deepDiveExplanation: string;
    highYieldPearl: string;
    topic: string;
    bookId: string;
    chunkId: string;
    sourceSection: string;
    generatedAt: number;
}

// System instruction for MCQ generation
const SYSTEM_INSTRUCTION = `You are an expert medical educator for NEET-SS (Super Speciality) Pulmonology. Generate MCQs that:
1. Test clinical reasoning and deep understanding
2. Include complex clinical vignettes when appropriate
3. Have plausible distractors based on common misconceptions
4. Reference current guidelines (GINA, GOLD, ATS, ERS)
5. Include specific numerical values where relevant
6. Provide detailed explanations with clinical pearls

Make questions NEET-SS level (senior resident / DM/DNB exam level).

Return a JSON array of MCQs with this structure:
[
  {
    "question": "Clinical vignette with question...",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "correctAnswer": "A", 
    "explanation": "Brief explanation...",
    "deepDiveExplanation": "Detailed pathophysiology/mechanism...",
    "highYieldPearl": "One-liner exam tip..."
  }
]`;

async function generateMCQsForChunk(chunk: Chunk, bookName: string): Promise<GeneratedMCQ[]> {
    try {
        console.log(`  Generating ${MCQs_PER_CHUNK} MCQs for section: ${chunk.sectionTitle.substring(0, 50)}...`);

        const prompt = `Based on the following medical content from "${bookName}" (section: ${chunk.sectionTitle}), generate ${MCQs_PER_CHUNK} high-yield NEET-SS/INI-SS standard MCQs.

CONTENT:
${chunk.content.substring(0, 25000)}

Generate exactly ${MCQs_PER_CHUNK} MCQs as a JSON array. Make them progressively harder.`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [{ text: prompt }]
                    }],
                    systemInstruction: {
                        parts: [{ text: SYSTEM_INSTRUCTION }]
                    },
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.7
                    }
                })
            }
        );

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const mcqs: any[] = JSON.parse(text);

        // Convert to GeneratedMCQ format
        const generatedMCQs: GeneratedMCQ[] = mcqs.map((mcq, idx) => ({
            id: `${chunk.bookId}-${chunk.id}-${idx}`,
            ...mcq,
            topic: bookName,
            bookId: chunk.bookId,
            chunkId: chunk.id,
            sourceSection: chunk.sectionTitle,
            generatedAt: Date.now(),
        }));

        console.log(`  ✓ Generated ${generatedMCQs.length} MCQs`);
        return generatedMCQs;
    } catch (error: any) {
        console.error(`  ✗ Error generating MCQs: ${error.message}`);
        return [];
    }
}

async function processBook(bookId: string, bookName: string): Promise<GeneratedMCQ[]> {
    const chunksFile = path.join(CHUNKS_DIR, `${bookId}.json`);

    if (!fs.existsSync(chunksFile)) {
        console.log(`  Skipping ${bookName} - no chunks file found`);
        return [];
    }

    const chunks: Chunk[] = JSON.parse(fs.readFileSync(chunksFile, 'utf-8'));
    console.log(`  Found ${chunks.length} chunks in ${bookName}`);

    const allMCQs: GeneratedMCQ[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`  [${i + 1}/${chunks.length}]`);

        // Add delay to avoid rate limiting
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
        }

        const mcqs = await generateMCQsForChunk(chunk, bookName);
        allMCQs.push(...mcqs);
    }

    return allMCQs;
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║       PULMO-MASTER AI - MCQ PRE-GENERATION SCRIPT              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (!GEMINI_API_KEY) {
        console.error('ERROR: VITE_GEMINI_API_KEY environment variable not set');
        console.log('Run with: VITE_GEMINI_API_KEY=your_key npm run generate-mcqs');
        process.exit(1);
    }

    console.log(`API Key: ${GEMINI_API_KEY.substring(0, 10)}...`);

    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Load book index
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    const books = index.books;

    console.log(`Found ${books.length} books to process\n`);

    const stats = {
        totalBooks: books.length,
        processedBooks: 0,
        totalChunks: 0,
        totalMCQs: 0,
        errors: 0
    };

    const allGeneratedMCQs: Record<string, GeneratedMCQ[]> = {};

    for (const book of books) {
        console.log(`\n📚 Processing: ${book.name}`);
        console.log(`   ID: ${book.id}`);
        console.log(`   Chunks: ${book.totalChunks}`);

        stats.totalChunks += book.totalChunks;

        try {
            const mcqs = await processBook(book.id, book.name);
            allGeneratedMCQs[book.id] = mcqs;
            stats.totalMCQs += mcqs.length;
            stats.processedBooks++;

            // Save per-book MCQs
            const bookOutputFile = path.join(OUTPUT_DIR, `${book.id}.json`);
            fs.writeFileSync(bookOutputFile, JSON.stringify(mcqs, null, 2));
            console.log(`   ✓ Saved ${mcqs.length} MCQs to ${book.id}.json`);
        } catch (error: any) {
            console.error(`   ✗ Error processing book: ${error.message}`);
            stats.errors++;
        }

        // Progress update
        console.log(`\n   Progress: ${stats.processedBooks}/${stats.totalBooks} books, ${stats.totalMCQs} MCQs generated`);
    }

    // Save combined index
    const combinedIndex = {
        generatedAt: new Date().toISOString(),
        stats: {
            totalBooks: stats.processedBooks,
            totalChunks: stats.totalChunks,
            totalMCQs: stats.totalMCQs,
            mcqsPerChunk: MCQs_PER_CHUNK
        },
        books: Object.keys(allGeneratedMCQs).map(bookId => ({
            id: bookId,
            mcqCount: allGeneratedMCQs[bookId].length
        }))
    };

    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'index.json'),
        JSON.stringify(combinedIndex, null, 2)
    );

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    GENERATION COMPLETE                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\n📊 Final Statistics:`);
    console.log(`   Books processed: ${stats.processedBooks}/${stats.totalBooks}`);
    console.log(`   Total chunks: ${stats.totalChunks}`);
    console.log(`   Total MCQs: ${stats.totalMCQs}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`\n📁 Output: ${OUTPUT_DIR}`);
}

main().catch(console.error);
