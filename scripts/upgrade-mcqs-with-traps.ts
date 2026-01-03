
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from "@google/genai";

console.log('--- ENV DEBUG START ---');

// Load environment variables manually
const envFiles = ['.env.local', '.env'];
for (const file of envFiles) {
    const envPath = path.join(process.cwd(), file);
    if (fs.existsSync(envPath)) {
        console.log(`Loading env from ${file}`);
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const lines = envContent.split(/\r?\n/);
        lines.forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;

            const eqIdx = line.indexOf('=');
            if (eqIdx > 0) {
                let key = line.slice(0, eqIdx).trim();
                let value = line.slice(eqIdx + 1).trim();

                if (key.startsWith('export ')) key = key.slice(7).trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }

                // DEBUG: Log found keys
                if (key.includes('API_KEY')) {
                    console.log(`Found key in file: ${key} (Length: ${value.length})`);
                }

                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
    }
}

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
console.log(`Final API Key to use: ${apiKey ? 'Set (Len: ' + apiKey.length + ')' : 'EMPTY'}`);
console.log('--- ENV DEBUG END ---');

// --- Configuration ---
const INPUT_DIR = path.join(process.cwd(), 'content/generated-mcqs');
const MODEL_NAME = 'gemini-2.5-flash-lite';
const BATCH_SIZE = 5; // We use 5, but recursive retry handles failures adaptively

const ai = new GoogleGenAI({ apiKey });

interface MCQOption {
    [key: string]: string;
}

interface MCQ {
    id: string;
    question: string;
    options: MCQOption;
    correctAnswer: string;
    explanation: string;
    deepDiveExplanation?: string;
    highYieldPearl?: string;
    trapAnalysis?: {
        [optionKey: string]: string;
    };
}

interface FileData {
    bookId: string;
    chapterId?: string;
    mcqs: MCQ[];
}

const analysisSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING },
            traps: {
                type: Type.OBJECT,
                properties: {
                    A: { type: Type.STRING },
                    B: { type: Type.STRING },
                    C: { type: Type.STRING },
                    D: { type: Type.STRING },
                },
                description: "Map of wrong options to explanation"
            }
        },
        required: ["id", "traps"]
    }
};

async function processBatch(mcqs: MCQ[]): Promise<MCQ[]> {
    const mcqsToProcess = mcqs.filter(m => !m.trapAnalysis);

    if (mcqsToProcess.length === 0) return mcqs;

    const prompt = `
    You are an expert Pulmonary Medicine educator. Analyze these multiple-choice questions and identify the "Trap" or "Common Pitfall" for each WRONG option.
    
    For each question, provide a short, single-sentence explanation for why a student might incorrectly choose each distractor.
    Focus on specific confusion points (e.g., "Confused with TB", "Outdated guideline", "Correct for different disease").
    
    INPUT MCQS:
    ${JSON.stringify(mcqsToProcess.map(m => ({
        id: m.id,
        question: m.question,
        options: m.options,
        correctAnswer: m.correctAnswer
    })), null, 2)}
  `;

    try {
        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: analysisSchema
            }
        });

        const responseText = result.text || "[]";
        const trapData = JSON.parse(responseText);

        return mcqs.map(mcq => {
            const analysis = trapData.find((t: any) => t.id === mcq.id);
            if (analysis && analysis.traps) {
                return {
                    ...mcq,
                    trapAnalysis: analysis.traps
                };
            }
            return mcq;
        });

    } catch (error: any) {
        // Recursive Retry Logic
        if (mcqsToProcess.length > 1) {
            console.log(`  ⚠️ Batch failed (${error.message}). Splitting ${mcqsToProcess.length} items...`);
            const mid = Math.floor(mcqsToProcess.length / 2);
            const left = mcqsToProcess.slice(0, mid);
            const right = mcqsToProcess.slice(mid);

            // Recurse on the subsets
            const resLeft = await processBatch(left);
            const resRight = await processBatch(right);

            // Combine results (these are arrays of Enriched MCQs)
            const processedFlat = [...resLeft, ...resRight];

            // Merge back into the original 'mcqs' array
            return mcqs.map(m => processedFlat.find(p => p.id === m.id) || m);
        }

        console.error(`  ❌ Failed to process item ${mcqsToProcess[0]?.id}:`, error.message);
        // Return original so we don't crash, just skip this one item
        return mcqs;
    }
}

async function processFile(filePath: string) {
    console.log(`Processing file: ${path.basename(filePath)}`);
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let data: any = JSON.parse(content);

        let mcqs: MCQ[] = [];
        let isWrapped = false;

        if (Array.isArray(data)) {
            mcqs = data;
        } else if (data.mcqs && Array.isArray(data.mcqs)) {
            mcqs = data.mcqs;
            isWrapped = true;
        } else {
            console.log('  No MCQs found (unknown format).');
            return;
        }

        if (mcqs.length === 0) {
            console.log('  No MCQs found.');
            return;
        }

        const updatedMCQs: MCQ[] = [];
        let hasUpdates = false;

        for (let i = 0; i < mcqs.length; i += BATCH_SIZE) {
            const batch = mcqs.slice(i, i + BATCH_SIZE);
            if (batch.some(m => !m.trapAnalysis)) {
                console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(mcqs.length / BATCH_SIZE)}...`);
                const processedBatch = await processBatch(batch);
                updatedMCQs.push(...processedBatch);
                hasUpdates = true;
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                updatedMCQs.push(...batch);
            }
        }

        if (hasUpdates) {
            if (isWrapped) {
                data.mcqs = updatedMCQs;
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            } else {
                fs.writeFileSync(filePath, JSON.stringify(updatedMCQs, null, 2));
            }
            console.log(`  ✅ Saved updates to ${path.basename(filePath)}`);
        } else {
            console.log('  All MCQs already processed. Skipping save.');
        }

    } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
    }
}

async function main() {
    console.log('🚀 Starting Trap Analysis Upgrade...');
    if (!apiKey) console.warn('Warning: API Key is empty!');

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`Directory not found: ${INPUT_DIR}`);
        return;
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.json'));
    console.log(`Found ${files.length} books to process.`);

    for (const file of files) {
        await processFile(path.join(INPUT_DIR, file));
    }
    console.log('✨ All files processed!');
}

main();
