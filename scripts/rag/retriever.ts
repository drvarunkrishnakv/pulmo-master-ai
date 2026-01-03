/**
 * RAG Retriever
 * 
 * Retrieves relevant context chunks for a given query using semantic search
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

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

// Types
interface RAGChunk {
    id: string;
    text: string;
    metadata: {
        source: string;
        topic: string;
        source_type: 'notes' | 'textbook';
        heading_level: number;
        // Source location
        pageNumber?: number;
        chapter?: string;
        section?: string;
    };
}

interface ChunkMapping {
    id: string;
    text: string;
    metadata: RAGChunk['metadata'];
    embeddingIndex: number;
}

interface VectorIndexData {
    ids: string[];
    embeddings: number[][];
}

export interface RetrievalResult {
    chunk: ChunkMapping;
    score: number;
}

// Configuration
const DATA_DIR = path.join(process.cwd(), 'data', 'rag');
const EMBEDDINGS_FILE = path.join(DATA_DIR, 'embeddings.json');
const MAPPING_FILE = path.join(DATA_DIR, 'chunk_mapping.json');
const EMBEDDING_MODEL = 'text-embedding-004';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Load vector index from file
 */
function loadVectorIndex(): VectorIndexData {
    if (!fs.existsSync(EMBEDDINGS_FILE)) {
        throw new Error('Index not found. Run: npm run rag:index');
    }
    return JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'));
}

/**
 * Load chunk mapping from file
 */
function loadChunkMapping(): Map<string, ChunkMapping> {
    if (!fs.existsSync(MAPPING_FILE)) {
        throw new Error('Chunk mapping not found. Run: npm run rag:index');
    }
    const mappings = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8')) as ChunkMapping[];
    return new Map(mappings.map(m => [m.id, m]));
}

/**
 * Generate embedding for query
 */
async function embedQuery(query: string): Promise<number[]> {
    const result = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: query,
    });

    if (result.embeddings && result.embeddings.length > 0) {
        return result.embeddings[0].values || [];
    }
    throw new Error('Failed to generate query embedding');
}

/**
 * Compute cosine similarity
 */
function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search for similar chunks
 */
function searchIndex(
    queryEmbedding: number[],
    indexData: VectorIndexData,
    topK: number
): { id: string; score: number }[] {
    const scores = indexData.embeddings.map((emb, idx) => ({
        id: indexData.ids[idx],
        score: cosineSimilarity(queryEmbedding, emb)
    }));

    return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}

/**
 * Get context for a query
 * 
 * @param query - The search query
 * @param topK - Number of results to return (default: 5)
 * @returns Array of matching chunks with scores
 */
export async function getContext(query: string, topK: number = 5): Promise<RetrievalResult[]> {
    // Check for API key
    if (!API_KEY) {
        throw new Error('API key not found. Set GEMINI_API_KEY in .env.local');
    }

    // Load index and mapping
    const indexData = loadVectorIndex();
    const chunkMap = loadChunkMapping();

    // Generate query embedding
    const queryEmbedding = await embedQuery(query);

    // Search for similar chunks
    const searchResults = searchIndex(queryEmbedding, indexData, topK);

    // Map to full chunk data
    const results: RetrievalResult[] = searchResults
        .map(result => {
            const chunk = chunkMap.get(result.id);
            if (!chunk) return null;
            return { chunk, score: result.score };
        })
        .filter((r): r is RetrievalResult => r !== null);

    return results;
}

/**
 * Format retrieval results for display
 */
export function formatResults(results: RetrievalResult[]): string {
    return results.map((r, i) => {
        const { chunk, score } = r;
        return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 Result ${i + 1} | Score: ${(score * 100).toFixed(1)}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 Source: ${chunk.metadata.source}
📌 Topic: ${chunk.metadata.topic}
🏷️ Type: ${chunk.metadata.source_type}

${chunk.text.slice(0, 500)}${chunk.text.length > 500 ? '...' : ''}
`;
    }).join('\n');
}

/**
 * CLI entry point
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: npm run rag:query "your search query"');
        console.log('Example: npm run rag:query "treatment of MDR tuberculosis"');
        process.exit(1);
    }

    const query = args.join(' ');
    const topK = 5;

    console.log(`\n🔍 Searching for: "${query}"\n`);

    try {
        const results = await getContext(query, topK);

        if (results.length === 0) {
            console.log('No results found.');
            return;
        }

        console.log(formatResults(results));
        console.log(`\n✅ Found ${results.length} relevant chunks`);
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
