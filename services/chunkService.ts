import { Book, Chunk, SubTopic } from '../types';

const BOOKS_KEY = 'pulmo_books';
const CHUNKS_PREFIX = 'pulmo_chunks_';

// Target chunk size: ~8000-12000 characters
const TARGET_CHUNK_SIZE = 10000;
const MIN_CHUNK_SIZE = 4000;
const MAX_CHUNK_SIZE = 15000;

/**
 * Generate a unique ID
 */
const generateId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Count words in a string
 */
const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

/**
 * Extract section title from content (first heading or first line)
 */
const extractSectionTitle = (content: string): string => {
    const headingMatch = content.match(/^#{1,3}\s+(.+)$/m);
    if (headingMatch) {
        return headingMatch[1].trim();
    }
    // Fallback: first 50 chars of first non-empty line
    const firstLine = content.split('\n').find(line => line.trim().length > 0);
    if (firstLine) {
        return firstLine.slice(0, 50).replace(/^#+\s*/, '').trim() + (firstLine.length > 50 ? '...' : '');
    }
    return 'Untitled Section';
};

/**
 * Split markdown by headings into semantic sections
 */
const splitByHeadings = (content: string): string[] => {
    // Split by h1, h2, h3 headings
    const sections = content.split(/(?=^#{1,3}\s)/m);
    return sections.filter(section => section.trim().length > 0);
};

/**
 * Merge small sections until they reach target size
 */
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
            // Current chunk is too small, keep merging
            currentChunk += (currentChunk ? '\n\n' : '') + section;
        }
    }

    if (currentChunk.trim()) {
        merged.push(currentChunk);
    }

    return merged;
};

/**
 * Split large sections into smaller chunks
 */
const splitLargeSections = (sections: string[]): string[] => {
    const result: string[] = [];

    for (const section of sections) {
        if (section.length <= MAX_CHUNK_SIZE) {
            result.push(section);
        } else {
            // Split by paragraphs
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

/**
 * Parse markdown content into a Book and Chunks
 */
export const parseMarkdown = (content: string, bookName: string): { book: Book; chunks: Chunk[] } => {
    const bookId = generateId();

    // Step 1: Split by headings
    let sections = splitByHeadings(content);

    // Step 2: Merge small sections
    sections = mergeSmallSections(sections);

    // Step 3: Split large sections
    sections = splitLargeSections(sections);

    // Create chunks
    const chunks: Chunk[] = sections.map((sectionContent, index) => ({
        id: generateId(),
        bookId,
        sectionTitle: extractSectionTitle(sectionContent),
        content: sectionContent.trim(),
        wordCount: countWords(sectionContent),
        index,
    }));

    // Create book
    const book: Book = {
        id: bookId,
        name: bookName,
        uploadedAt: Date.now(),
        totalChunks: chunks.length,
        totalCharacters: content.length,
    };

    return { book, chunks };
};

/**
 * Parse markdown with sub-topic assignments
 */
export const parseMarkdownWithSubTopics = (
    content: string,
    bookName: string,
    headings: { level: number; text: string; lineIndex: number }[],
    suggestedTopics: { name: string; headingIndices: number[] }[]
): { book: Book; chunks: Chunk[] } => {
    const bookId = generateId();

    // Step 1: Split by headings
    let sections = splitByHeadings(content);

    // Step 2: Merge small sections
    sections = mergeSmallSections(sections);

    // Step 3: Split large sections
    sections = splitLargeSections(sections);

    // Create sub-topics with IDs
    const subTopics: SubTopic[] = suggestedTopics.map(st => ({
        id: generateId(),
        name: st.name,
        chunkIds: [] // Will be populated below
    }));

    // Create a mapping from heading text to sub-topic ID
    const headingToSubTopic = new Map<string, string>();
    suggestedTopics.forEach((st, stIndex) => {
        st.headingIndices.forEach(hi => {
            if (headings[hi]) {
                headingToSubTopic.set(headings[hi].text.toLowerCase(), subTopics[stIndex].id);
            }
        });
    });

    // Create chunks and assign to sub-topics
    const chunks: Chunk[] = sections.map((sectionContent, index) => {
        const title = extractSectionTitle(sectionContent);
        const chunkId = generateId();

        // Find matching sub-topic
        let subTopicId: string | undefined;
        for (const [headingText, stId] of headingToSubTopic.entries()) {
            if (title.toLowerCase().includes(headingText) || headingText.includes(title.toLowerCase())) {
                subTopicId = stId;
                break;
            }
        }

        // If no match, try to match by content keywords
        if (!subTopicId && subTopics.length > 0) {
            subTopicId = subTopics[0].id; // Default to first sub-topic
        }

        // Add chunk ID to sub-topic
        if (subTopicId) {
            const st = subTopics.find(s => s.id === subTopicId);
            if (st) st.chunkIds.push(chunkId);
        }

        return {
            id: chunkId,
            bookId,
            sectionTitle: title,
            content: sectionContent.trim(),
            wordCount: countWords(sectionContent),
            index,
            subTopicId,
        };
    });

    // Create book
    const book: Book = {
        id: bookId,
        name: bookName,
        uploadedAt: Date.now(),
        totalChunks: chunks.length,
        totalCharacters: content.length,
        subTopics,
    };

    return { book, chunks };
};

/**
 * Save a book and its chunks to localStorage
 */
export const saveBook = (book: Book, chunks: Chunk[]): void => {
    // Save book to books list
    const books = getBooks();
    books.push(book);
    localStorage.setItem(BOOKS_KEY, JSON.stringify(books));

    // Save chunks separately (for performance with large content)
    localStorage.setItem(`${CHUNKS_PREFIX}${book.id}`, JSON.stringify(chunks));
};

/**
 * Get all saved books
 */
export const getBooks = (): Book[] => {
    const stored = localStorage.getItem(BOOKS_KEY);
    return stored ? JSON.parse(stored) : [];
};

/**
 * Get chunks for a specific book
 */
export const getChunks = (bookId: string): Chunk[] => {
    const stored = localStorage.getItem(`${CHUNKS_PREFIX}${bookId}`);
    return stored ? JSON.parse(stored) : [];
};

/**
 * Delete a book and its chunks
 */
export const deleteBook = (bookId: string): void => {
    // Remove from books list
    const books = getBooks().filter(b => b.id !== bookId);
    localStorage.setItem(BOOKS_KEY, JSON.stringify(books));

    // Remove chunks
    localStorage.removeItem(`${CHUNKS_PREFIX}${bookId}`);
};

/**
 * Get random chunks from a book for quiz generation
 */
export const getRandomChunks = (bookId: string, count: number = 3): Chunk[] => {
    const chunks = getChunks(bookId);
    if (chunks.length <= count) return chunks;

    // Fisher-Yates shuffle and take first `count`
    const shuffled = [...chunks];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
};

