/**
 * RAG Main CLI
 * 
 * Unified CLI for all RAG operations
 */

import * as fs from 'fs';
import * as path from 'path';

const HELP_TEXT = `
╔══════════════════════════════════════════════════════════════╗
║             Pulmo Master AI - RAG System                     ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  npm run rag <command> [options]

Commands:
  chunk         Process markdown files into chunks
  index         Generate embeddings and build vector index
  query <text>  Search for relevant content
  quiz <topic>  Generate NEET-SS MCQs on a topic

Examples:
  npm run rag chunk
  npm run rag index
  npm run rag query "treatment of MDR tuberculosis"
  npm run rag quiz "ILD classification" 5

Quick Start:
  1. First, run chunking:     npm run rag chunk
  2. Then, build the index:   npm run rag index
  3. Now you can query:       npm run rag query "your question"
  4. Or generate quizzes:     npm run rag quiz "topic" 5
`;

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
        console.log(HELP_TEXT);
        return;
    }

    const command = args[0];
    const commandArgs = args.slice(1);

    switch (command) {
        case 'chunk':
            console.log('Running chunker...\n');
            await import('./chunker');
            break;

        case 'index':
            console.log('Running indexer...\n');
            await import('./indexer');
            break;

        case 'query':
            if (commandArgs.length === 0) {
                console.error('Error: Please provide a search query');
                console.log('Usage: npm run rag query "your search query"');
                process.exit(1);
            }
            // Set process.argv for the retriever
            process.argv = ['node', 'retriever.ts', ...commandArgs];
            await import('./retriever');
            break;

        case 'quiz':
            if (commandArgs.length === 0) {
                console.error('Error: Please provide a topic');
                console.log('Usage: npm run rag quiz "topic" [count]');
                process.exit(1);
            }
            // Set process.argv for the generator
            process.argv = ['node', 'generator.ts', ...commandArgs];
            await import('./generator');
            break;

        case 'status':
            showStatus();
            break;

        default:
            console.error(`Unknown command: ${command}`);
            console.log(HELP_TEXT);
            process.exit(1);
    }
}

function showStatus() {
    const DATA_DIR = path.join(process.cwd(), 'data', 'rag');

    console.log('\n📊 RAG System Status\n');

    // Check chunks
    const chunksFile = path.join(DATA_DIR, 'chunks.jsonl');
    if (fs.existsSync(chunksFile)) {
        const content = fs.readFileSync(chunksFile, 'utf-8');
        const lines = content.trim().split('\n').length;
        console.log(`✅ Chunks: ${lines} chunks ready`);
    } else {
        console.log('❌ Chunks: Not generated (run: npm run rag chunk)');
    }

    // Check embeddings
    const embeddingsFile = path.join(DATA_DIR, 'embeddings.json');
    if (fs.existsSync(embeddingsFile)) {
        const data = JSON.parse(fs.readFileSync(embeddingsFile, 'utf-8'));
        console.log(`✅ Embeddings: ${data.ids?.length || 0} vectors indexed`);
    } else {
        console.log('❌ Embeddings: Not generated (run: npm run rag index)');
    }

    // Check metadata
    const metadataFile = path.join(DATA_DIR, 'index_metadata.json');
    if (fs.existsSync(metadataFile)) {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
        console.log(`\n📋 Index Details:`);
        console.log(`   Model: ${metadata.model}`);
        console.log(`   Dimension: ${metadata.embeddingDimension}`);
        console.log(`   Created: ${metadata.createdAt}`);
    }

    // Check generated quizzes
    const quizDir = path.join(DATA_DIR, 'generated-quizzes');
    if (fs.existsSync(quizDir)) {
        const quizzes = fs.readdirSync(quizDir).filter(f => f.endsWith('.json'));
        console.log(`\n📚 Generated Quizzes: ${quizzes.length}`);
    }

    console.log('');
}

main().catch(console.error);
