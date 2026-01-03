/**
 * Flashcard Service - SRS-based Flashcard Learning
 * 
 * Now loads pre-generated flashcards from content/generated-flashcards/
 * Maintains SRS for flashcards (spaced repetition).
 * User swipes left/right; system optimizes what to show next.
 */

import { getRandomBundledFlashcards, BundledFlashcard } from '../content/index';

// Storage key
const FLASHCARD_SRS_KEY = 'pulmo_flashcard_srs';

// SRS Constants
const DEFAULT_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0;
const EASE_BONUS = 0.15;
const EASE_PENALTY = 0.25;
const MAX_INTERVAL_DAYS = 90;

// SRS data stored per flashcard
interface FlashcardSRSData {
    srsInterval: number;
    srsEaseFactor: number;
    srsNextReviewAt: number;
    srsLevel: number;
    timesReviewed: number;
    lastReviewedAt: number | null;
}

// Dynamic flashcard type (combines bundled + SRS data)
export interface DynamicFlashcard {
    id: string;
    front: string;
    back: string;
    topic: string;
    bookId: string;
    category?: string;
    conceptTags?: string[];
    difficulty?: number;
    sourceSection?: string;
    emoji: string;
    color: string;
    // SRS fields
    srsInterval: number;
    srsEaseFactor: number;
    srsNextReviewAt: number;
    srsLevel: number;
    timesReviewed: number;
    lastReviewedAt: number | null;
}

// Topic emoji and color mapping
const TOPIC_STYLES: Record<string, { emoji: string; color: string }> = {
    'copd': { emoji: '🫁', color: 'from-blue-500 to-indigo-600' },
    'asthma': { emoji: '💨', color: 'from-cyan-500 to-teal-600' },
    'ild': { emoji: '🕸️', color: 'from-purple-500 to-violet-600' },
    'tb': { emoji: '🦠', color: 'from-amber-500 to-orange-600' },
    'tuberculosis': { emoji: '🦠', color: 'from-amber-500 to-orange-600' },
    'pneumonia': { emoji: '🤒', color: 'from-red-500 to-rose-600' },
    'pe': { emoji: '🩸', color: 'from-red-600 to-pink-600' },
    'phtn': { emoji: '💗', color: 'from-fuchsia-500 to-purple-600' },
    'sleep': { emoji: '😴', color: 'from-indigo-500 to-purple-600' },
    'cancer': { emoji: '🎗️', color: 'from-pink-500 to-rose-600' },
    'sarcoid': { emoji: '✨', color: 'from-violet-500 to-purple-600' },
    'ards': { emoji: '🏥', color: 'from-red-600 to-orange-600' },
    'niv': { emoji: '😮‍💨', color: 'from-sky-500 to-blue-600' },
    'ventilation': { emoji: '😮‍💨', color: 'from-sky-500 to-blue-600' },
    'pft': { emoji: '📊', color: 'from-green-500 to-emerald-600' },
    'pleural': { emoji: '💧', color: 'from-blue-400 to-cyan-500' },
    'ntm': { emoji: '🔬', color: 'from-teal-500 to-green-600' },
    'occupational': { emoji: '🏭', color: 'from-stone-500 to-gray-600' },
    'default': { emoji: '📚', color: 'from-gray-500 to-slate-600' }
};

/**
 * Get style (emoji + color) for a topic
 */
const getTopicStyle = (topic: string): { emoji: string; color: string } => {
    const lowerTopic = topic.toLowerCase();
    for (const [key, style] of Object.entries(TOPIC_STYLES)) {
        if (lowerTopic.includes(key)) return style;
    }
    return TOPIC_STYLES.default;
};

/**
 * Get stored SRS data for all flashcards
 */
const getStoredSRS = (): Record<string, FlashcardSRSData> => {
    try {
        const stored = localStorage.getItem(FLASHCARD_SRS_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('Error reading flashcard SRS:', e);
    }
    return {};
};

/**
 * Save SRS data
 */
const saveSRS = (data: Record<string, FlashcardSRSData>): void => {
    try {
        localStorage.setItem(FLASHCARD_SRS_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving flashcard SRS:', e);
    }
};

/**
 * Convert bundled flashcard to dynamic flashcard with SRS
 */
const toDynamicFlashcard = (
    bundled: BundledFlashcard,
    srsData?: FlashcardSRSData
): DynamicFlashcard => {
    const style = getTopicStyle(bundled.topic || bundled.bookId);
    const now = Date.now();

    return {
        id: bundled.id,
        front: bundled.front,
        back: bundled.back,
        topic: bundled.topic,
        bookId: bundled.bookId,
        category: bundled.category,
        conceptTags: bundled.conceptTags,
        difficulty: bundled.difficulty,
        sourceSection: bundled.sourceSection,
        emoji: style.emoji,
        color: style.color,
        srsInterval: srsData?.srsInterval ?? 1,
        srsEaseFactor: srsData?.srsEaseFactor ?? DEFAULT_EASE_FACTOR,
        srsNextReviewAt: srsData?.srsNextReviewAt ?? now,
        srsLevel: srsData?.srsLevel ?? 0,
        timesReviewed: srsData?.timesReviewed ?? 0,
        lastReviewedAt: srsData?.lastReviewedAt ?? null
    };
};

/**
 * Get flashcards for today's session
 * Loads from pre-generated content and applies SRS
 */
export const getFlashcardsForSession = async (maxCount: number = 20): Promise<{
    cards: DynamicFlashcard[];
    dueCount: number;
    newCount: number;
}> => {
    const now = Date.now();
    const srsData = getStoredSRS();

    // Load bundled flashcards
    const bundledFlashcards = await getRandomBundledFlashcards(100);

    // Convert to dynamic flashcards with SRS
    const allCards = bundledFlashcards.map(fc =>
        toDynamicFlashcard(fc, srsData[fc.id])
    );

    // 1. Get due cards (highest priority)
    const dueCards = allCards
        .filter(c => c.srsNextReviewAt <= now && c.timesReviewed > 0)
        .sort((a, b) => a.srsNextReviewAt - b.srsNextReviewAt);

    // 2. Get new cards (never reviewed)
    const newCards = allCards
        .filter(c => c.timesReviewed === 0)
        .sort(() => Math.random() - 0.5); // Shuffle new cards

    // Combine with priority
    const combined: DynamicFlashcard[] = [];
    const seen = new Set<string>();

    // Add due first (priority)
    for (const card of dueCards) {
        if (combined.length >= maxCount) break;
        if (!seen.has(card.id)) {
            combined.push(card);
            seen.add(card.id);
        }
    }
    const dueCount = combined.length;

    // Add new cards
    for (const card of newCards) {
        if (combined.length >= maxCount) break;
        if (!seen.has(card.id)) {
            combined.push(card);
            seen.add(card.id);
        }
    }
    const newCount = combined.length - dueCount;

    // Shuffle final deck (but keep some SRS priority)
    const shuffled = combined.sort(() => Math.random() - 0.3);

    return {
        cards: shuffled,
        dueCount,
        newCount
    };
};

/**
 * Get friendly duration message
 */
const getFriendlyDuration = (days: number): string => {
    if (days === 1) return "See you tomorrow! 👋";
    if (days <= 3) return `See you in ${days} days`;
    if (days <= 7) return "See you next week 📅";
    if (days <= 14) return "Solid! See you in 2 weeks 🎯";
    if (days <= 30) return "Locked in! See you in a month 💪";
    return "Mastered! 🏆";
};

/**
 * Update flashcard SRS after review
 * Called when user swipes left (didn't know) or right (knew it)
 */
export const updateFlashcardSRS = (
    cardId: string,
    knewIt: boolean
): { message: string; nextReviewIn: number } => {
    const srsData = getStoredSRS();
    const now = Date.now();

    // Get or create SRS data for this card
    const current = srsData[cardId] || {
        srsInterval: 1,
        srsEaseFactor: DEFAULT_EASE_FACTOR,
        srsNextReviewAt: now,
        srsLevel: 0,
        timesReviewed: 0,
        lastReviewedAt: null
    };

    let newInterval: number;
    let newEaseFactor: number;
    let newLevel: number;
    let message: string;

    if (knewIt) {
        // Knew it - advance SRS
        newEaseFactor = Math.min(current.srsEaseFactor + EASE_BONUS, MAX_EASE_FACTOR);

        if (current.srsLevel < 3) {
            // Learning phase - fixed intervals: 1, 3, 7 days
            const learningIntervals = [1, 3, 7];
            newLevel = current.srsLevel + 1;
            newInterval = learningIntervals[Math.min(current.srsLevel, learningIntervals.length - 1)];
        } else {
            // Review phase - multiply by ease factor
            newLevel = current.srsLevel + 1;
            newInterval = Math.round(current.srsInterval * newEaseFactor);
        }

        newInterval = Math.min(newInterval, MAX_INTERVAL_DAYS);
        message = getFriendlyDuration(newInterval);
    } else {
        // Didn't know - reset to beginning
        newLevel = 0;
        newInterval = 1;
        newEaseFactor = Math.max(current.srsEaseFactor - EASE_PENALTY, MIN_EASE_FACTOR);
        message = "Let's review tomorrow 📖";
    }

    // Update SRS data
    srsData[cardId] = {
        srsLevel: newLevel,
        srsInterval: newInterval,
        srsEaseFactor: newEaseFactor,
        srsNextReviewAt: now + (newInterval * 24 * 60 * 60 * 1000),
        timesReviewed: current.timesReviewed + 1,
        lastReviewedAt: now
    };

    saveSRS(srsData);

    return { message, nextReviewIn: newInterval };
};

/**
 * Get flashcard stats for dashboard display
 */
export const getFlashcardStats = (): {
    totalCards: number;
    dueToday: number;
    mastered: number;
} => {
    const srsData = getStoredSRS();
    const now = Date.now();
    const entries = Object.values(srsData);

    return {
        totalCards: entries.length,
        dueToday: entries.filter(c => c.srsNextReviewAt <= now).length,
        mastered: entries.filter(c => c.srsInterval >= 14).length
    };
};

/**
 * Get count of due flashcards for display
 */
export const getFlashcardsDueCount = (): number => {
    const stats = getFlashcardStats();
    // Show at least 10 if no tracked cards yet
    if (stats.totalCards === 0) return 20;
    return Math.max(stats.dueToday, 10);
};

// Legacy export for compatibility
export const generateFlashcardsFromWeakMCQs = (): number => 0;
