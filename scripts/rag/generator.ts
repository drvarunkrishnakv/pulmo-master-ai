/**
 * NEET-SS Quiz Generator with RAG
 * 
 * Generates clinical-vignette MCQs based on retrieved context
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import { getContext, RetrievalResult } from './retriever';

// Load .env.local file
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value && !process.env[key]) {
            process.env[key] = value.trim();
        }
    });
}

// Get API key from various env var names
const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY || '';

// Types (matching existing SavedMCQ structure)
interface GeneratedMCQ {
    id: string;
    topic: string;
    question: string;
    options: {
        A: string;
        B: string;
        C: string;
        D: string;
    };
    correctAnswer: 'A' | 'B' | 'C' | 'D';
    deepDiveExplanation: string;
    highYieldPearl: string;
    sourceReference: string;
    bookId: string;
    chunkId: string;
    generatedAt: number;
    timesAttempted: number;
    correctAttempts: number;
    isRAGGenerated: boolean;
}

// Configuration
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'rag', 'generated-quizzes');
const MODEL = 'gemini-2.5-flash-lite';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * System prompt for NEET-SS quiz generation
 */
const SYSTEM_PROMPT = `You are a NEET-SS Pulmonology Examiner with expertise in creating clinical-vignette based MCQs.

Your task is to generate high-quality multiple choice questions based ONLY on the provided medical context.

Rules:
1. Questions MUST be based on information present in the context
2. Create clinical scenario-based questions when possible (case vignettes)
3. Options should be plausible and test understanding, not just recall
4. Include exactly one correct answer
5. Explanations should teach the underlying concept
6. High-yield pearls should be exam-focused memory hooks

Output Format: Return ONLY a valid JSON array with no additional text, markdown, or formatting.
Each object must have these exact keys:
- question: string (the clinical vignette or question)
- options: object with keys A, B, C, D (each a string)
- correctAnswer: string ("A", "B", "C", or "D")
- explanation: string (detailed explanation of correct answer)
- highYieldPearl: string (one memorable exam fact)
- sourceReference: string (topic/heading from context used)`;

/**
 * Generate unique ID
 */
function generateId(): string {
    return 'rag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Build context string from retrieval results
 */
function buildContextString(results: RetrievalResult[]): string {
    return results.map((r, i) => {
        return `--- CONTEXT ${i + 1} (Source: ${r.chunk.metadata.source}, Topic: ${r.chunk.metadata.topic}) ---
${r.chunk.text}`;
    }).join('\n\n');
}

/**
 * Parse and validate MCQ output from Gemini
 */
function parseMCQOutput(output: string, topic: string, results: RetrievalResult[]): GeneratedMCQ[] {
    // Try to extract JSON from the response
    let jsonStr = output.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
        const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
            jsonStr = match[1].trim();
        }
    }

    try {
        const parsed = JSON.parse(jsonStr);
        const mcqs = Array.isArray(parsed) ? parsed : [parsed];

        // Transform to our MCQ format
        return mcqs.map((mcq: any) => {
            const primarySource = results[0]?.chunk;

            return {
                id: generateId(),
                topic: topic,
                question: mcq.question || '',
                options: {
                    A: mcq.options?.A || '',
                    B: mcq.options?.B || '',
                    C: mcq.options?.C || '',
                    D: mcq.options?.D || ''
                },
                correctAnswer: mcq.correctAnswer as 'A' | 'B' | 'C' | 'D',
                deepDiveExplanation: mcq.explanation || '',
                highYieldPearl: mcq.highYieldPearl || '',
                sourceReference: mcq.sourceReference || primarySource?.metadata.topic || topic,
                bookId: primarySource?.metadata.source.replace('.md', '') || 'rag',
                chunkId: primarySource?.id || 'rag',
                generatedAt: Date.now(),
                timesAttempted: 0,
                correctAttempts: 0,
                isRAGGenerated: true,
                // Add source location from chunk metadata
                sourceLocation: primarySource?.metadata ? {
                    pageNumber: primarySource.metadata.pageNumber,
                    chapter: primarySource.metadata.chapter,
                    section: primarySource.metadata.section
                } : undefined
            };
        }).filter(mcq =>
            mcq.question &&
            mcq.options.A &&
            mcq.correctAnswer &&
            ['A', 'B', 'C', 'D'].includes(mcq.correctAnswer)
        );
    } catch (error) {
        console.error('Failed to parse MCQ output:', error);
        console.error('Raw output:', output.slice(0, 500));
        return [];
    }
}

/**
 * Generate NEET-SS quiz from a topic
 * 
 * @param topic - The topic to generate questions about
 * @param count - Number of questions to generate (default: 5)
 * @returns Array of generated MCQs
 */
export async function generateNEETQuiz(topic: string, count: number = 5): Promise<GeneratedMCQ[]> {
    // Check for API key
    if (!API_KEY) {
        throw new Error('API key not found. Set GEMINI_API_KEY in .env.local');
    }

    console.log(`\n🎯 Generating ${count} MCQs on: "${topic}"\n`);

    // Step 1: Retrieve relevant context
    console.log('📚 Retrieving context...');
    const results = await getContext(topic, 8); // Get more context for better coverage

    if (results.length === 0) {
        throw new Error('No relevant context found for this topic');
    }

    console.log(`   Found ${results.length} relevant chunks\n`);

    // Step 2: Build context string
    const contextString = buildContextString(results);

    // Step 3: Generate MCQs
    console.log('🧠 Generating MCQs...');

    const prompt = `Based on the following medical context, generate ${count} clinical-vignette based MCQs suitable for NEET-SS Pulmonology examination.

${contextString}

Generate exactly ${count} MCQs as a JSON array.`;

    const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.7,
            maxOutputTokens: 4096,
        }
    });

    const outputText = response.text || '';

    // Step 4: Parse and validate
    console.log('✅ Parsing output...');
    const mcqs = parseMCQOutput(outputText, topic, results);

    if (mcqs.length === 0) {
        throw new Error('Failed to generate valid MCQs');
    }

    return mcqs;
}

/**
 * Save generated quiz to file
 */
function saveQuiz(mcqs: GeneratedMCQ[], topic: string): string {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const filename = `quiz_${topic.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.json`;
    const filepath = path.join(OUTPUT_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(mcqs, null, 2), 'utf-8');

    return filepath;
}

/**
 * Format quiz for display
 */
function formatQuiz(mcqs: GeneratedMCQ[]): string {
    return mcqs.map((mcq, i) => `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Question ${i + 1}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${mcq.question}

A) ${mcq.options.A}
B) ${mcq.options.B}
C) ${mcq.options.C}
D) ${mcq.options.D}

✅ Correct: ${mcq.correctAnswer}

📖 Explanation:
${mcq.deepDiveExplanation}

💡 High-Yield Pearl:
${mcq.highYieldPearl}

📌 Source: ${mcq.sourceReference}
`).join('\n');
}

/**
 * CLI entry point
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: npm run rag:quiz "topic" [count]');
        console.log('Example: npm run rag:quiz "ILD classification" 5');
        process.exit(1);
    }

    const topic = args[0];
    const count = args[1] ? parseInt(args[1], 10) : 5;

    try {
        const mcqs = await generateNEETQuiz(topic, count);

        // Display results
        console.log(formatQuiz(mcqs));

        // Save to file
        const filepath = saveQuiz(mcqs, topic);
        console.log(`\n💾 Saved to: ${filepath}`);
        console.log(`\n✅ Generated ${mcqs.length} MCQs successfully!`);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

// Run if called directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}
