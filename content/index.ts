/**
 * Content Loader
 * Provides access to pre-bundled books, chunks, pre-generated MCQs, and flashcards
 */

import { Book, Chunk, SubTopic, SavedMCQ } from '../types';

// Type for index.json structure
interface BookIndex {
    books: {
        id: string;
        name: string;
        fileName: string;
        totalChunks: number;
        totalCharacters: number;
        subTopics: SubTopic[];
        processedAt: number;
    }[];
    generatedAt: number;
    totalBooks: number;
    totalChunks: number;
}

// Type for generated MCQs index (supports both old 'books' and new 'topics' format)
interface GeneratedMCQIndex {
    generatedAt: string;
    totalMCQs: number;
    books?: { id: string; mcqCount: number }[];
    topics?: string[];  // New RAG format: array of topic IDs
    source?: string;
}

// Type for generated flashcards index
interface GeneratedFlashcardIndex {
    generatedAt: string;
    totalFlashcards: number;
    books?: { id: string; flashcardCount: number }[];
    topics?: string[];
}

// Type for bundled flashcard (pre-generated)
export interface BundledFlashcard {
    id: string;
    front: string;
    back: string;
    category?: string;
    conceptTags?: string[];
    difficulty?: number;
    examRelevance?: string;
    bookId: string;
    topic: string;
    sourceSection?: string;
}

// Cache for loaded chunks
const chunksCache = new Map<string, Chunk[]>();

// Cache for generated MCQs
const mcqCache = new Map<string, SavedMCQ[]>();

// Cache for generated flashcards
const flashcardCache = new Map<string, BundledFlashcard[]>();

// Index cache
let indexCache: BookIndex | null = null;
let mcqIndexCache: GeneratedMCQIndex | null = null;
let flashcardIndexCache: GeneratedFlashcardIndex | null = null;

/**
 * Load the book index
 */
export const loadBookIndex = async (): Promise<BookIndex> => {
    if (indexCache) return indexCache;

    try {
        const response = await import('../content/processed/index.json');
        indexCache = response.default as BookIndex;
        return indexCache;
    } catch (error) {
        console.error('Failed to load book index:', error);
        return {
            books: [],
            generatedAt: 0,
            totalBooks: 0,
            totalChunks: 0
        };
    }
};

/**
 * Load the generated MCQs index
 */
export const loadMCQIndex = async (): Promise<GeneratedMCQIndex> => {
    if (mcqIndexCache) return mcqIndexCache;

    try {
        const response = await import('../content/generated-mcqs/index.json');
        mcqIndexCache = response.default as GeneratedMCQIndex;
        return mcqIndexCache;
    } catch (error) {
        console.error('Failed to load MCQ index:', error);
        return {
            generatedAt: '',
            totalMCQs: 0,
            books: []
        };
    }
};

/**
 * Load the generated flashcards index
 */
export const loadFlashcardIndex = async (): Promise<GeneratedFlashcardIndex> => {
    if (flashcardIndexCache) return flashcardIndexCache;

    try {
        const response = await import('../content/generated-flashcards/index.json');
        flashcardIndexCache = response.default as GeneratedFlashcardIndex;
        return flashcardIndexCache;
    } catch (error) {
        console.error('Failed to load flashcard index:', error);
        return {
            generatedAt: '',
            totalFlashcards: 0,
            books: []
        };
    }
};

/**
 * Get all bundled books (metadata only, no chunks)
 */
export const getBundledBooks = async (): Promise<Book[]> => {
    const index = await loadBookIndex();

    return index.books.map(b => ({
        id: b.id,
        name: b.name,
        uploadedAt: b.processedAt,
        totalChunks: b.totalChunks,
        totalCharacters: b.totalCharacters,
        subTopics: b.subTopics
    }));
};

/**
 * Load chunks for a specific book (lazy loading)
 */
export const loadBundledChunks = async (bookId: string): Promise<Chunk[]> => {
    if (chunksCache.has(bookId)) {
        return chunksCache.get(bookId)!;
    }

    try {
        const module = await import(`../content/processed/chunks/${bookId}.json`);
        const chunks = module.default as Chunk[];
        chunksCache.set(bookId, chunks);
        return chunks;
    } catch (error) {
        console.error(`Failed to load chunks for book ${bookId}:`, error);
        return [];
    }
};

/**
 * Load pre-generated MCQs for a specific book/topic
 * Sets bookId to the topic ID for proper filtering by getMCQsByBook
 */
export const loadBundledMCQs = async (bookId: string): Promise<SavedMCQ[]> => {
    if (mcqCache.has(bookId)) {
        return mcqCache.get(bookId)!;
    }

    try {
        const module = await import(`../content/generated-mcqs/${bookId}.json`);
        const mcqs = (module.default as any[]).map(mcq => ({
            ...mcq,
            bookId: bookId,  // Override with topic ID for proper filtering
            timesAttempted: 0,
            correctAttempts: 0,
            lastAttempted: 0,
            isBundled: true
        })) as SavedMCQ[];
        mcqCache.set(bookId, mcqs);
        return mcqs;
    } catch (error) {
        console.error(`Failed to load MCQs for book ${bookId}:`, error);
        return [];
    }
};

/**
 * Load pre-generated flashcards for a specific book
 */
export const loadBundledFlashcards = async (bookId: string): Promise<BundledFlashcard[]> => {
    if (flashcardCache.has(bookId)) {
        return flashcardCache.get(bookId)!;
    }

    try {
        const module = await import(`../content/generated-flashcards/${bookId}.json`);
        const flashcards = module.default as BundledFlashcard[];
        flashcardCache.set(bookId, flashcards);
        return flashcards;
    } catch (error) {
        console.error(`Failed to load flashcards for book ${bookId}:`, error);
        return [];
    }
};

/**
 * Get all pre-generated MCQs
 * Supports both old 'books' format and new 'topics' format from RAG
 */
export const getAllBundledMCQs = async (): Promise<SavedMCQ[]> => {
    const index = await loadMCQIndex();
    const allMCQs: SavedMCQ[] = [];

    // New RAG format: topics array
    if (index.topics && index.topics.length > 0) {
        for (const topicId of index.topics) {
            const mcqs = await loadBundledMCQs(topicId);
            allMCQs.push(...mcqs);
        }
    }

    // Old format: books array - IGNORE (Deprecated in favor of RAG topics)
    // if (index.books && index.books.length > 0) {
    //    for (const book of index.books) {
    //        const mcqs = await loadBundledMCQs(book.id);
    //        allMCQs.push(...mcqs);
    //    }
    // }

    return allMCQs;
};

/**
 * Get all pre-generated flashcards
 */
export const getAllBundledFlashcards = async (): Promise<BundledFlashcard[]> => {
    const index = await loadFlashcardIndex();
    const allFlashcards: BundledFlashcard[] = [];

    // New format: topics is an array of topic IDs
    if (index.topics && index.topics.length > 0) {
        for (const topicId of index.topics) {
            const flashcards = await loadBundledFlashcards(topicId);
            allFlashcards.push(...flashcards);
        }
    }
    // Legacy format: books array (deprecated)
    else if (index.books && index.books.length > 0) {
        for (const book of index.books) {
            const flashcards = await loadBundledFlashcards(book.id);
            allFlashcards.push(...flashcards);
        }
    }

    return allFlashcards;
};

/**
 * Get random pre-generated MCQs
 */
export const getRandomBundledMCQs = async (count: number = 10): Promise<SavedMCQ[]> => {
    const allMCQs = await getAllBundledMCQs();

    if (allMCQs.length <= count) return allMCQs;

    // Fisher-Yates shuffle
    const shuffled = [...allMCQs];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
};

/**
 * Get random pre-generated flashcards
 */
export const getRandomBundledFlashcards = async (count: number = 20): Promise<BundledFlashcard[]> => {
    const allFlashcards = await getAllBundledFlashcards();

    if (allFlashcards.length <= count) return allFlashcards;

    // Fisher-Yates shuffle
    const shuffled = [...allFlashcards];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
};

/**
 * Get random pre-generated MCQs for a specific book
 */
export const getRandomBundledMCQsForBook = async (bookId: string, count: number = 10): Promise<SavedMCQ[]> => {
    const mcqs = await loadBundledMCQs(bookId);

    if (mcqs.length <= count) return mcqs;

    const shuffled = [...mcqs];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
};

/**
 * Get random chunks from a bundled book
 */
export const getRandomBundledChunks = async (bookId: string, count: number = 3): Promise<Chunk[]> => {
    const chunks = await loadBundledChunks(bookId);

    if (chunks.length <= count) return chunks;

    const shuffled = [...chunks];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
};

/**
 * Check if bundled content is available
 */
export const hasBundledContent = async (): Promise<boolean> => {
    const index = await loadBookIndex();
    return index.books.length > 0;
};

/**
 * Check if pre-generated MCQs are available
 */
export const hasBundledMCQs = async (): Promise<boolean> => {
    const index = await loadMCQIndex();
    return index.totalMCQs > 0;
};

/**
 * Check if pre-generated flashcards are available
 */
export const hasBundledFlashcards = async (): Promise<boolean> => {
    const index = await loadFlashcardIndex();
    return index.totalFlashcards > 0;
};

/**
 * Get total pre-generated MCQ count
 */
export const getBundledMCQCount = async (): Promise<number> => {
    const index = await loadMCQIndex();
    return index.totalMCQs;
};

/**
 * Get total pre-generated flashcard count
 */
export const getBundledFlashcardCount = async (): Promise<number> => {
    const index = await loadFlashcardIndex();
    return index.totalFlashcards;
};

/**
 * Clear caches (if needed for memory management)
 */
export const clearChunksCache = () => {
    chunksCache.clear();
};

export const clearMCQCache = () => {
    mcqCache.clear();
};


export const clearFlashcardCache = () => {
    flashcardCache.clear();
};

// RAG Topic list interface
interface RAGTopic {
    id: string;
    name: string;
    priority: 'high' | 'medium' | 'low';
    mcqCount: number;
}

interface RAGTopicList {
    version: string;
    totalTargetMCQs: number;
    generatedAt: string | null;
    topics: RAGTopic[];
}

/**
 * Get RAG topics formatted as Book[] for Dashboard compatibility
 * This replaces the old getBundledBooks() for the new topic-based MCQ system
 */
export const getRAGTopicsAsBooks = async (): Promise<Book[]> => {
    try {
        const response = await import('../data/rag/topic-list.json');
        const topicList = response.default as RAGTopicList;

        return topicList.topics.map(topic => ({
            id: topic.id,
            name: topic.name,
            uploadedAt: Date.now(),
            totalChunks: topic.mcqCount,  // Use mcqCount as a proxy for "size"
            totalCharacters: 0,
            subTopics: [],
            priority: topic.priority  // Extra field for sorting if needed
        }));
    } catch (error) {
        console.error('Failed to load RAG topic list:', error);
        return [];
    }
};

// Topic Category interface for grouped display
export interface TopicCategory {
    id: string;
    name: string;
    icon: string;
    subtopics: string[];  // Array of subtopic IDs
}

interface TopicCategoriesFile {
    version: string;
    description: string;
    categories: TopicCategory[];
}

/**
 * Get topic categories for Dashboard display (12 grouped categories)
 * Each category contains multiple subtopic IDs for loading MCQs
 */
export const getTopicCategories = async (): Promise<TopicCategory[]> => {
    try {
        const response = await import('../data/rag/topic-categories.json');
        const data = response.default as TopicCategoriesFile;
        return data.categories;
    } catch (error) {
        console.error('Failed to load topic categories:', error);
        return [];
    }
};

/**
 * Get all MCQs for a category (loads from all subtopics)
 * Used when user selects a category to start a quiz
 */
export const getMCQsForCategory = async (categoryId: string): Promise<SavedMCQ[]> => {
    try {
        const categories = await getTopicCategories();
        const category = categories.find(c => c.id === categoryId);

        if (!category) {
            console.error(`Category not found: ${categoryId}`);
            return [];
        }

        // Load MCQs from all subtopics in this category
        const allMCQs: SavedMCQ[] = [];
        for (const subtopicId of category.subtopics) {
            const mcqs = await loadBundledMCQs(subtopicId);
            allMCQs.push(...mcqs);
        }

        return allMCQs;
    } catch (error) {
        console.error(`Failed to load MCQs for category ${categoryId}:`, error);
        return [];
    }
};

