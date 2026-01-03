/**
 * Smart Medical Chunker for RAG
 * 
 * Processes markdown files from content/books/ and creates semantic chunks
 * that preserve medical context (tables, headings, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';

interface RAGChunk {
    id: string;
    text: string;
    metadata: {
        source: string;
        topic: string;
        source_type: 'notes' | 'textbook';
        heading_level: number;
        // New source location fields
        pageNumber?: number;
        chapter?: string;
        section?: string;
    };
}

// Configuration
const BOOKS_DIR = path.join(process.cwd(), 'content', 'books');
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'rag');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'chunks.jsonl');

// Chunk size limits (in characters)
const MIN_CHUNK_SIZE = 500;
const MAX_CHUNK_SIZE = 4000;
const TARGET_CHUNK_SIZE = 2000;

/**
 * Check if a line is a markdown heading
 */
function isHeading(line: string): { level: number; text: string } | null {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
        return { level: match[1].length, text: match[2].trim() };
    }
    return null;
}

/**
 * Check if we're inside a markdown table
 */
function isTableLine(line: string): boolean {
    return line.trim().startsWith('|') || /^\s*\|?[\s\-:]+\|/.test(line);
}

/**
 * Split markdown content by headings while preserving tables
 * Also tracks page numbers from <!-- Page X --> comments and chapter/section hierarchy
 */
interface SectionInfo {
    text: string;
    topic: string;
    level: number;
    pageNumber?: number;
    chapter?: string;
    section?: string;
}

function splitByHeadings(content: string): SectionInfo[] {
    const lines = content.split('\n');
    const sections: SectionInfo[] = [];

    let currentSection: string[] = [];
    let currentTopic = 'Introduction';
    let currentLevel = 1;
    let inTable = false;

    // Track hierarchy
    let currentPage: number | undefined;
    let currentChapter: string | undefined;
    let currentSectionHeading: string | undefined;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for page marker <!-- Page X -->
        const pageMatch = line.match(/<!--\s*Page\s+(\d+)\s*-->/i);
        if (pageMatch) {
            currentPage = parseInt(pageMatch[1], 10);
            currentSection.push(line);
            continue;
        }

        const heading = isHeading(line);

        // Track table state
        if (isTableLine(line)) {
            inTable = true;
        } else if (line.trim() === '' && inTable) {
            inTable = false;
        }

        // If we hit a heading and we're not in a table, start a new section
        if (heading && !inTable) {
            // Save the previous section if it has content
            if (currentSection.length > 0) {
                const text = currentSection.join('\n').trim();
                if (text.length >= MIN_CHUNK_SIZE) {
                    sections.push({
                        text,
                        topic: currentTopic,
                        level: currentLevel,
                        pageNumber: currentPage,
                        chapter: currentChapter,
                        section: currentSectionHeading
                    });
                } else if (sections.length > 0 && text.length > 0) {
                    sections[sections.length - 1].text += '\n\n' + text;
                }
            }

            // Update hierarchy based on heading level
            if (heading.level === 1) {
                currentChapter = heading.text;
                currentSectionHeading = undefined;
            } else if (heading.level === 2) {
                currentSectionHeading = heading.text;
            }

            currentSection = [line];
            currentTopic = heading.text;
            currentLevel = heading.level;
        } else {
            currentSection.push(line);
        }
    }

    // Don't forget the last section
    if (currentSection.length > 0) {
        const text = currentSection.join('\n').trim();
        if (text.length > 0) {
            sections.push({
                text,
                topic: currentTopic,
                level: currentLevel,
                pageNumber: currentPage,
                chapter: currentChapter,
                section: currentSectionHeading
            });
        }
    }

    return sections;
}

/**
 * Split large sections into smaller chunks
 * Uses aggressive splitting for sections with huge content (e.g., base64 images)
 */
function splitLargeSections(sections: SectionInfo[]): SectionInfo[] {
    const result: SectionInfo[] = [];

    for (const section of sections) {
        // Filter out base64 image data (from OCR) which can be huge
        let cleanText = section.text
            .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[IMAGE]')
            .replace(/!\[.*?\]\([^)]+\)/g, '[IMAGE]'); // Also replace markdown images

        if (cleanText.length <= MAX_CHUNK_SIZE) {
            result.push({ ...section, text: cleanText });
            continue;
        }

        // Split by paragraphs (double newlines)
        const paragraphs = cleanText.split(/\n\n+/);
        let currentChunk = '';
        let chunkIndex = 1;

        for (const para of paragraphs) {
            // Skip very short paragraphs that are just whitespace
            if (para.trim().length < 10) continue;

            // If a single paragraph is too large, split it by lines (handles tables)
            if (para.length > MAX_CHUNK_SIZE) {
                // First, save current chunk if not empty
                if (currentChunk.trim().length > 0) {
                    result.push({
                        text: currentChunk.trim(),
                        topic: `${section.topic} (Part ${chunkIndex})`,
                        level: section.level,
                        pageNumber: section.pageNumber,
                        chapter: section.chapter,
                        section: section.section
                    });
                    chunkIndex++;
                    currentChunk = '';
                }

                // Split by lines (this handles tables and other line-based content)
                const lines = para.split('\n');

                // If there's only one line and it's huge, split by characters
                if (lines.length === 1 && lines[0].length > MAX_CHUNK_SIZE) {
                    const hugeLine = lines[0];
                    for (let i = 0; i < hugeLine.length; i += MAX_CHUNK_SIZE) {
                        const slice = hugeLine.slice(i, i + MAX_CHUNK_SIZE);
                        result.push({
                            text: slice,
                            topic: `${section.topic} (Part ${chunkIndex})`,
                            level: section.level,
                            pageNumber: section.pageNumber,
                            chapter: section.chapter,
                            section: section.section
                        });
                        chunkIndex++;
                    }
                    continue;
                }

                for (const line of lines) {
                    // Skip empty lines
                    if (line.trim().length === 0) continue;

                    // If single line is still huge, split by characters
                    if (line.length > MAX_CHUNK_SIZE) {
                        if (currentChunk.length > 0) {
                            result.push({
                                text: currentChunk.trim(),
                                topic: `${section.topic} (Part ${chunkIndex})`,
                                level: section.level,
                                pageNumber: section.pageNumber,
                                chapter: section.chapter,
                                section: section.section
                            });
                            chunkIndex++;
                            currentChunk = '';
                        }
                        for (let i = 0; i < line.length; i += MAX_CHUNK_SIZE) {
                            result.push({
                                text: line.slice(i, i + MAX_CHUNK_SIZE),
                                topic: `${section.topic} (Part ${chunkIndex})`,
                                level: section.level,
                                pageNumber: section.pageNumber,
                                chapter: section.chapter,
                                section: section.section
                            });
                            chunkIndex++;
                        }
                        continue;
                    }

                    if (currentChunk.length + line.length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
                        result.push({
                            text: currentChunk.trim(),
                            topic: `${section.topic} (Part ${chunkIndex})`,
                            level: section.level,
                            pageNumber: section.pageNumber,
                            chapter: section.chapter,
                            section: section.section
                        });
                        chunkIndex++;
                        currentChunk = line;
                    } else {
                        currentChunk += (currentChunk ? '\n' : '') + line;
                    }
                }
                continue;
            }

            // Check if adding this paragraph would exceed max size
            if (currentChunk.length + para.length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
                result.push({
                    text: currentChunk.trim(),
                    topic: `${section.topic} (Part ${chunkIndex})`,
                    level: section.level,
                    pageNumber: section.pageNumber,
                    chapter: section.chapter,
                    section: section.section
                });
                currentChunk = para;
                chunkIndex++;
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + para;
            }
        }

        // Add the last chunk
        if (currentChunk.trim().length > 0) {
            result.push({
                text: currentChunk.trim(),
                topic: chunkIndex > 1 ? `${section.topic} (Part ${chunkIndex})` : section.topic,
                level: section.level,
                pageNumber: section.pageNumber,
                chapter: section.chapter,
                section: section.section
            });
        }
    }

    return result;
}


/**
 * Merge small consecutive sections
 */
function mergeSmallSections(sections: SectionInfo[]): SectionInfo[] {
    const result: SectionInfo[] = [];

    for (const section of sections) {
        if (result.length === 0) {
            result.push(section);
            continue;
        }

        const lastSection = result[result.length - 1];

        // Merge if current section is small and combined would be under target
        if (section.text.length < MIN_CHUNK_SIZE &&
            lastSection.text.length + section.text.length < TARGET_CHUNK_SIZE) {
            lastSection.text += '\n\n' + section.text;
            // Update topic to include both
            if (!lastSection.topic.includes(' & ')) {
                lastSection.topic = `${lastSection.topic} & ${section.topic}`;
            }
        } else {
            result.push(section);
        }
    }

    return result;
}

/**
 * Process a single markdown file
 */
function processMarkdownFile(filePath: string, sourceType: 'notes' | 'textbook' = 'notes'): RAGChunk[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Split by headings
    let sections = splitByHeadings(content);

    // Split large sections
    sections = splitLargeSections(sections);

    // Merge small sections
    sections = mergeSmallSections(sections);

    // Convert to RAGChunk format
    const chunks: RAGChunk[] = sections.map((section, index) => ({
        id: `${fileName.replace('.md', '')}_chunk_${String(index + 1).padStart(3, '0')}`,
        text: section.text,
        metadata: {
            source: fileName,
            topic: section.topic,
            source_type: sourceType,
            heading_level: section.level,
            pageNumber: section.pageNumber,
            chapter: section.chapter,
            section: section.section
        }
    }));

    return chunks;
}

/**
 * Main chunking pipeline
 */
async function main() {
    console.log('🔪 Starting Smart Medical Chunker...\n');

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Get all markdown files
    const files = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.md'));
    console.log(`📚 Found ${files.length} markdown files\n`);

    const allChunks: RAGChunk[] = [];

    for (const file of files) {
        const filePath = path.join(BOOKS_DIR, file);
        console.log(`  Processing: ${file}`);

        try {
            const chunks = processMarkdownFile(filePath, 'notes');
            allChunks.push(...chunks);
            console.log(`    → ${chunks.length} chunks created`);
        } catch (error) {
            console.error(`    ✗ Error: ${error}`);
        }
    }

    // Write to JSONL file
    const jsonlContent = allChunks.map(chunk => JSON.stringify(chunk)).join('\n');
    fs.writeFileSync(OUTPUT_FILE, jsonlContent, 'utf-8');

    // Print summary
    console.log('\n✅ Chunking complete!');
    console.log(`   Total chunks: ${allChunks.length}`);
    console.log(`   Output: ${OUTPUT_FILE}`);

    // Stats
    const avgSize = Math.round(allChunks.reduce((sum, c) => sum + c.text.length, 0) / allChunks.length);
    const minSize = Math.min(...allChunks.map(c => c.text.length));
    const maxSize = Math.max(...allChunks.map(c => c.text.length));

    console.log(`\n📊 Chunk Statistics:`);
    console.log(`   Average size: ${avgSize} chars`);
    console.log(`   Min size: ${minSize} chars`);
    console.log(`   Max size: ${maxSize} chars`);
}

// Run if called directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}
