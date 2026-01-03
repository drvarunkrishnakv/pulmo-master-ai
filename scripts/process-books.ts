/**
 * Book Processing Script
 * 
 * Reads markdown files from /content/books/
 * Outputs processed chunks to /content/processed/
 * 
 * Run with: npx tsx scripts/process-books.ts
 * Or: npm run process-books
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOOKS_DIR = path.join(__dirname, '../content/books');
const OUTPUT_DIR = path.join(__dirname, '../content/processed');
const CHUNKS_DIR = path.join(OUTPUT_DIR, 'chunks');

// Chunking configuration
const TARGET_CHUNK_SIZE = 10000;
const MIN_CHUNK_SIZE = 4000;
const MAX_CHUNK_SIZE = 15000;

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

// Generate unique ID
const generateId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Count words
const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

// Extract section title from content
const extractSectionTitle = (content: string): string => {
    const headingMatch = content.match(/^#{1,3}\s+(.+)$/m);
    if (headingMatch) {
        return headingMatch[1].trim().slice(0, 100);
    }
    const firstLine = content.split('\n').find(line => line.trim().length > 0);
    if (firstLine) {
        return firstLine.slice(0, 50).replace(/^#+\s*/, '').trim();
    }
    return 'Untitled Section';
};

// Extract all headings from content
const extractHeadings = (content: string): { level: number; text: string; lineIndex: number }[] => {
    const lines = content.split('\n');
    const headings: { level: number; text: string; lineIndex: number }[] = [];

    lines.forEach((line, index) => {
        const match = line.match(/^(#{1,3})\s+(.+)/);
        if (match) {
            headings.push({
                level: match[1].length,
                text: match[2].trim().slice(0, 100),
                lineIndex: index
            });
        }
    });

    return headings;
};

// Split by headings
const splitByHeadings = (content: string): string[] => {
    const sections = content.split(/(?=^#{1,3}\s)/m);
    return sections.filter(section => section.trim().length > 0);
};

// Merge small sections
const mergeSmallSections = (sections: string[]): string[] => {
    const merged: string[] = [];
    let currentChunk = '';

    for (const section of sections) {
        if (currentChunk.length + section.length < TARGET_CHUNK_SIZE) {
            currentChunk += (currentChunk ? '\n\n' : '') + section;
        } else if (currentChunk.length >= MIN_CHUNK_SIZE) {
            merged.push(currentChunk);
            currentChunk = section;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + section;
        }
    }

    if (currentChunk.trim()) {
        merged.push(currentChunk);
    }

    return merged;
};

// Split large sections
const splitLargeSections = (sections: string[]): string[] => {
    const result: string[] = [];

    for (const section of sections) {
        if (section.length <= MAX_CHUNK_SIZE) {
            result.push(section);
        } else {
            const paragraphs = section.split(/\n\n+/);
            let currentChunk = '';

            for (const para of paragraphs) {
                if (currentChunk.length + para.length < TARGET_CHUNK_SIZE) {
                    currentChunk += (currentChunk ? '\n\n' : '') + para;
                } else {
                    if (currentChunk.trim()) {
                        result.push(currentChunk);
                    }
                    currentChunk = para;
                }
            }

            if (currentChunk.trim()) {
                result.push(currentChunk);
            }
        }
    }

    return result;
};

// Auto-generate sub-topics from headings
const generateSubTopics = (headings: { level: number; text: string }[]): SubTopic[] => {
    // Group by level-1 or level-2 headings
    const subTopics: SubTopic[] = [];
    let currentSubTopic: SubTopic | null = null;

    headings.forEach((h, index) => {
        if (h.level <= 2) {
            // New sub-topic
            if (currentSubTopic) {
                subTopics.push(currentSubTopic);
            }
            currentSubTopic = {
                id: generateId(),
                name: h.text,
                chunkIndices: []
            };
        }
    });

    if (currentSubTopic) {
        subTopics.push(currentSubTopic);
    }

    // If no sub-topics found, create a general one
    if (subTopics.length === 0) {
        subTopics.push({
            id: generateId(),
            name: 'General',
            chunkIndices: []
        });
    }

    // Limit to 15 sub-topics max (merge if more)
    if (subTopics.length > 15) {
        return subTopics.slice(0, 15);
    }

    return subTopics;
};

// Process a single book
const processBook = (filePath: string): { meta: BookMeta; chunks: ChunkData[] } => {
    const fileName = path.basename(filePath, '.md');
    const content = fs.readFileSync(filePath, 'utf-8');
    const bookId = fileName.toLowerCase().replace(/[^a-z0-9]/g, '-');

    console.log(`  Processing: ${fileName} (${(content.length / 1000).toFixed(0)}K chars)`);

    // Extract headings
    const headings = extractHeadings(content);
    console.log(`    Found ${headings.length} headings`);

    // Generate sub-topics
    const subTopics = generateSubTopics(headings);
    console.log(`    Generated ${subTopics.length} sub-topics`);

    // Chunk content
    let sections = splitByHeadings(content);
    sections = mergeSmallSections(sections);
    sections = splitLargeSections(sections);

    console.log(`    Created ${sections.length} chunks`);

    // Create chunks
    const chunks: ChunkData[] = sections.map((sectionContent, index) => {
        const title = extractSectionTitle(sectionContent);

        // Assign to sub-topic based on title match
        let subTopicId = subTopics[0]?.id;
        for (const st of subTopics) {
            if (title.toLowerCase().includes(st.name.toLowerCase().slice(0, 20)) ||
                st.name.toLowerCase().includes(title.toLowerCase().slice(0, 20))) {
                subTopicId = st.id;
                break;
            }
        }

        return {
            id: `${bookId}-chunk-${index}`,
            bookId,
            sectionTitle: title,
            content: sectionContent.trim(),
            wordCount: countWords(sectionContent),
            index,
            subTopicId
        };
    });

    // Update sub-topic chunk indices
    chunks.forEach((chunk, index) => {
        const st = subTopics.find(s => s.id === chunk.subTopicId);
        if (st) {
            st.chunkIndices.push(index);
        }
    });

    // Clean up book name for display
    let displayName = fileName
        .replace(/_OCR_Complete$/i, '')  // Remove OCR suffix
        .replace(/^(\d+\.)\s*/, '')       // Remove leading number prefix like "102."
        .replace(/_/g, ' ')               // Replace underscores with spaces
        .replace(/\s+/g, ' ')             // Normalize whitespace
        .trim();

    // Title case
    displayName = displayName.replace(/\b\w/g, l => l.toUpperCase());

    const meta: BookMeta = {
        id: bookId,
        name: displayName,
        fileName,
        totalChunks: chunks.length,
        totalCharacters: content.length,
        subTopics,
        processedAt: Date.now()
    };

    return { meta, chunks };
};

// Main processing
const main = () => {
    console.log('\n📚 Processing Books...\n');

    // Ensure directories exist
    if (!fs.existsSync(BOOKS_DIR)) {
        fs.mkdirSync(BOOKS_DIR, { recursive: true });
        console.log('Created /content/books/ - Add your .md files here\n');
        return;
    }

    if (!fs.existsSync(CHUNKS_DIR)) {
        fs.mkdirSync(CHUNKS_DIR, { recursive: true });
    }

    // Find all markdown files
    const files = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.md'));

    if (files.length === 0) {
        console.log('No .md files found in /content/books/\n');
        console.log('Add your medical book markdown files there and run again.\n');
        return;
    }

    console.log(`Found ${files.length} book(s)\n`);

    const allBooks: BookMeta[] = [];

    for (const file of files) {
        const filePath = path.join(BOOKS_DIR, file);
        const { meta, chunks } = processBook(filePath);

        // Save chunks
        const chunksPath = path.join(CHUNKS_DIR, `${meta.id}.json`);
        fs.writeFileSync(chunksPath, JSON.stringify(chunks, null, 2));

        allBooks.push(meta);
        console.log(`    ✓ Saved ${meta.id}.json\n`);
    }

    // Save index
    const indexPath = path.join(OUTPUT_DIR, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
        books: allBooks,
        generatedAt: Date.now(),
        totalBooks: allBooks.length,
        totalChunks: allBooks.reduce((sum, b) => sum + b.totalChunks, 0)
    }, null, 2));

    console.log(`\n✅ Done! Processed ${allBooks.length} book(s)`);
    console.log(`   Total chunks: ${allBooks.reduce((sum, b) => sum + b.totalChunks, 0)}`);
    console.log(`   Output: /content/processed/\n`);
};

main();
