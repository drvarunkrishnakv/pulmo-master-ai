import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    updateDoc,
    query,
    where,
    writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { Book, Chunk, SavedMCQ } from '../types';

// Collection names
const COLLECTIONS = {
    BOOKS: 'books',
    CHUNKS: 'chunks',
    MCQS: 'mcqs',
    USER_DATA: 'userData'
};

/**
 * Save a book to Firestore
 */
export const saveBookToFirestore = async (book: Book): Promise<void> => {
    await setDoc(doc(db, COLLECTIONS.BOOKS, book.id), book);
};

/**
 * Save chunks to Firestore
 */
export const saveChunksToFirestore = async (chunks: Chunk[]): Promise<void> => {
    const batch = writeBatch(db);
    chunks.forEach(chunk => {
        const ref = doc(db, COLLECTIONS.CHUNKS, chunk.id);
        batch.set(ref, chunk);
    });
    await batch.commit();
};

/**
 * Get all books from Firestore
 */
export const getBooksFromFirestore = async (): Promise<Book[]> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.BOOKS));
    return snapshot.docs.map(doc => doc.data() as Book);
};

/**
 * Get chunks for a book from Firestore
 */
export const getChunksFromFirestore = async (bookId: string): Promise<Chunk[]> => {
    const q = query(collection(db, COLLECTIONS.CHUNKS), where('bookId', '==', bookId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Chunk);
};

/**
 * Delete a book and its chunks from Firestore
 */
export const deleteBookFromFirestore = async (bookId: string): Promise<void> => {
    // Delete book
    await deleteDoc(doc(db, COLLECTIONS.BOOKS, bookId));

    // Delete chunks
    const chunksQuery = query(collection(db, COLLECTIONS.CHUNKS), where('bookId', '==', bookId));
    const chunksSnapshot = await getDocs(chunksQuery);
    const batch = writeBatch(db);
    chunksSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
};

/**
 * Save MCQs to Firestore
 */
export const saveMCQsToFirestore = async (mcqs: SavedMCQ[]): Promise<void> => {
    const batch = writeBatch(db);
    mcqs.forEach(mcq => {
        const ref = doc(db, COLLECTIONS.MCQS, mcq.id);
        batch.set(ref, mcq);
    });
    await batch.commit();
};

/**
 * Get all MCQs from Firestore
 */
export const getAllMCQsFromFirestore = async (): Promise<SavedMCQ[]> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.MCQS));
    return snapshot.docs.map(doc => doc.data() as SavedMCQ);
};

/**
 * Get MCQs for a book from Firestore
 */
export const getMCQsByBookFromFirestore = async (bookId: string): Promise<SavedMCQ[]> => {
    const q = query(collection(db, COLLECTIONS.MCQS), where('bookId', '==', bookId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as SavedMCQ);
};

/**
 * Update an MCQ in Firestore
 */
export const updateMCQInFirestore = async (mcqId: string, updates: Partial<SavedMCQ>): Promise<void> => {
    await updateDoc(doc(db, COLLECTIONS.MCQS, mcqId), updates);
};

/**
 * Delete an MCQ from Firestore
 */
export const deleteMCQFromFirestore = async (mcqId: string): Promise<void> => {
    await deleteDoc(doc(db, COLLECTIONS.MCQS, mcqId));
};

/**
 * Delete multiple MCQs from Firestore
 */
export const deleteMCQsFromFirestore = async (mcqIds: string[]): Promise<void> => {
    const batch = writeBatch(db);
    mcqIds.forEach(id => {
        batch.delete(doc(db, COLLECTIONS.MCQS, id));
    });
    await batch.commit();
};

/**
 * Delete all MCQs for a book from Firestore
 */
export const deleteMCQsByBookFromFirestore = async (bookId: string): Promise<void> => {
    const q = query(collection(db, COLLECTIONS.MCQS), where('bookId', '==', bookId));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
};
