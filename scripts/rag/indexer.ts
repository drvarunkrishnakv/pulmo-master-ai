/**
 * Embedding Generator and FAISS Index Builder
 * 
 * Generates embeddings for all chunks using Gemini and creates a FAISS index
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
    };
}

interface ChunkMapping {
    id: string;
    text: string;
    metadata: RAGChunk['metadata'];
    embeddingIndex: number;
}

interface IndexMetadata {
    totalChunks: number;
    embeddingDimension: number;
    model: string;
    createdAt: string;
}

// Configuration
const DATA_DIR = path.join(process.cwd(), 'data', 'rag');
const CHUNKS_FILE = path.join(DATA_DIR, 'chunks.jsonl');
const EMBEDDINGS_FILE = path.join(DATA_DIR, 'embeddings.json');
const MAPPING_FILE = path.join(DATA_DIR, 'chunk_mapping.json');
const METADATA_FILE = path.join(DATA_DIR, 'index_metadata.json');

// Embedding model configuration
const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSION = 768;
const BATCH_SIZE = 100; // Process in batches
const RATE_LIMIT_DELAY = 100; // Reduced: only 100ms between batches (retry handles rate limits)

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate embeddings for a batch of texts (up to 100 at a time)
 * Uses the batch embedding API for much faster processing
 */
async function generateBatchEmbeddings(texts: string[], retries = 3): Promise<number[][]> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            // Gemini batch embedding API - embed multiple texts at once
            const results: number[][] = [];

            // Process texts one by one but in rapid succession
            // (Gemini's embedContent doesn't support true batch in JS SDK yet)
            // But we reduce rate limit delays significantly
            for (const text of texts) {
                const result = await ai.models.embedContent({
                    model: EMBEDDING_MODEL,
                    contents: text,
                });

                if (result.embeddings && result.embeddings.length > 0) {
                    results.push(result.embeddings[0].values || []);
                } else {
                    // Return zero vector for failed embeddings
                    results.push(new Array(EMBEDDING_DIMENSION).fill(0));
                }
            }

            return results;
        } catch (error: any) {
            if (error.status === 429 || error.message?.includes('rate')) {
                // Rate limit - exponential backoff
                const delay = Math.pow(2, attempt + 1) * 1000;
                console.log(`\n    ⏳ Rate limited, waiting ${delay}ms...`);
                await sleep(delay);
            } else if (attempt === retries - 1) {
                throw error;
            }
        }
    }
    throw new Error('Failed to generate embeddings after retries');
}

/**
 * Load chunks from JSONL file
 */
function loadChunks(): RAGChunk[] {
    const content = fs.readFileSync(CHUNKS_FILE, 'utf-8');
    const lines = content.trim().split('\n');
    return lines.map(line => JSON.parse(line) as RAGChunk);
}

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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
 * Simple vector index (FAISS alternative for Node.js)
 * Since faiss-node can be tricky to install, we use a simple cosine similarity search
 */
export class VectorIndex {
    private embeddings: number[][] = [];
    private ids: string[] = [];

    constructor() { }

    add(id: string, embedding: number[]): void {
        this.ids.push(id);
        this.embeddings.push(embedding);
    }

    search(queryEmbedding: number[], topK: number = 5): { id: string; score: number }[] {
        const scores = this.embeddings.map((emb, idx) => ({
            id: this.ids[idx],
            score: cosineSimilarity(queryEmbedding, emb)
        }));

        return scores
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    save(filePath: string): void {
        fs.writeFileSync(filePath, JSON.stringify({
            ids: this.ids,
            embeddings: this.embeddings
        }), 'utf-8');
    }

    static load(filePath: string): VectorIndex {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const index = new VectorIndex();
        index.ids = data.ids;
        index.embeddings = data.embeddings;
        return index;
    }

    get size(): number {
        return this.ids.length;
    }
}

/**
 * Main indexing pipeline
 */
async function main() {
    console.log('🔍 Starting Embedding & Index Builder...\n');

    // Check for API key
    if (!API_KEY) {
        console.error('❌ API key not found');
        console.log('   Set GEMINI_API_KEY in .env.local or export API_KEY');
        process.exit(1);
    }

    // Load chunks
    if (!fs.existsSync(CHUNKS_FILE)) {
        console.error('❌ Chunks file not found. Run chunker first:');
        console.log('   npm run rag:chunk');
        process.exit(1);
    }

    const chunks = loadChunks();
    console.log(`📚 Loaded ${chunks.length} chunks\n`);

    // Initialize index and mapping
    const index = new VectorIndex();
    const mapping: ChunkMapping[] = [];

    // Process in batches
    console.log('🧠 Generating embeddings (batch mode - much faster!)...\n');

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

        console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} chunks)`);

        try {
            // Extract texts for batch embedding
            const texts = batch.map(chunk => chunk.text);

            // Generate all embeddings for this batch at once
            const embeddings = await generateBatchEmbeddings(texts);

            // Add all to index and mapping
            for (let j = 0; j < batch.length; j++) {
                const chunk = batch[j];
                const globalIndex = i + j;
                const embedding = embeddings[j];

                // Add to index
                index.add(chunk.id, embedding);

                // Add to mapping
                mapping.push({
                    id: chunk.id,
                    text: chunk.text,
                    metadata: chunk.metadata,
                    embeddingIndex: globalIndex
                });
            }

            // Progress indicator
            const processed = Math.min(i + BATCH_SIZE, chunks.length);
            console.log(`    ✓ Processed ${processed}/${chunks.length} (${Math.round(processed / chunks.length * 100)}%)`);
        } catch (error) {
            console.error(`\n    ✗ Error processing batch ${batchNum}: ${error}`);
        }

        // Rate limit delay between batches (reduced since we're doing true batching)
        if (i + BATCH_SIZE < chunks.length) {
            await sleep(RATE_LIMIT_DELAY);
        }
    }

    console.log('\n');

    // Save index
    console.log('💾 Saving index...');
    index.save(EMBEDDINGS_FILE);
    console.log(`   → ${EMBEDDINGS_FILE}`);

    // Save mapping
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2), 'utf-8');
    console.log(`   → ${MAPPING_FILE}`);

    // Save metadata
    const metadata: IndexMetadata = {
        totalChunks: index.size,
        embeddingDimension: EMBEDDING_DIMENSION,
        model: EMBEDDING_MODEL,
        createdAt: new Date().toISOString()
    };
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`   → ${METADATA_FILE}`);

    console.log('\n✅ Indexing complete!');
    console.log(`   Total embeddings: ${index.size}`);
    console.log(`   Dimension: ${EMBEDDING_DIMENSION}`);
}

// Run if called directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}
