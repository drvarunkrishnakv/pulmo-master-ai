import { SavedMCQ } from '../types';
import { getAllBundledMCQs } from '../content';
import { calculateNextReview } from './srsService';
import { recordQuestionAttempt, isGoalCompleted, wasGoalBonusClaimed, markGoalBonusClaimed } from './dailyGoalService';
import { awardDailyGoalBonus } from './gamificationService';
import { analyticsCache } from './analyticsCache';

const MCQ_BANK_KEY = 'pulmo_mcq_bank';
const MCQ_STATS_KEY = 'pulmo_mcq_stats';

// Cache for bundled MCQs  
let bundledMCQsCache: SavedMCQ[] | null = null;
let bundledMCQsLoaded = false;

import { getBalancedMCQSet } from './mcqUtils';

// Cache for user MCQs to avoid repeated JSON.parse in same render cycle
let userMCQsCache: SavedMCQ[] | null = null;
let userMCQsCacheTime = 0;
const USER_CACHE_DURATION = 30 * 1000; // 30 seconds

/**
 * Invalidate user MCQs cache (call after any modification)
 */
const invalidateUserMCQsCache = (): void => {
    userMCQsCache = null;
    userMCQsCacheTime = 0;
};

/**
 * Get user-generated MCQs from localStorage (with caching)
 */
export const getUserMCQs = (): SavedMCQ[] => {
    const now = Date.now();
    if (userMCQsCache && (now - userMCQsCacheTime) < USER_CACHE_DURATION) {
        return userMCQsCache;
    }

    const stored = localStorage.getItem(MCQ_BANK_KEY);
    userMCQsCache = stored ? JSON.parse(stored) : [];
    userMCQsCacheTime = now;
    return userMCQsCache;
};

/**
 * Get stats for bundled MCQs (from localStorage)
 */
const getBundledMCQStats = (): Record<string, { timesAttempted: number; correctAttempts: number; lastAttemptedAt: number }> => {
    const stored = localStorage.getItem(MCQ_STATS_KEY);
    return stored ? JSON.parse(stored) : {};
};

/**
 * Save stats for bundled MCQs
 */
const saveBundledMCQStats = (stats: Record<string, { timesAttempted: number; correctAttempts: number; lastAttemptedAt: number }>): void => {
    localStorage.setItem(MCQ_STATS_KEY, JSON.stringify(stats));
};

/**
 * Load bundled MCQs (async, with caching)
 */
export const loadBundledMCQsAsync = async (): Promise<SavedMCQ[]> => {
    if (bundledMCQsCache) return bundledMCQsCache;

    try {
        const mcqs = await getAllBundledMCQs();
        const stats = getBundledMCQStats();

        // Merge stats into bundled MCQs
        bundledMCQsCache = mcqs.map(mcq => ({
            ...mcq,
            timesAttempted: stats[mcq.id]?.timesAttempted || 0,
            correctAttempts: stats[mcq.id]?.correctAttempts || 0,
            lastAttemptedAt: stats[mcq.id]?.lastAttemptedAt || 0,
            isBundled: true
        }));

        bundledMCQsLoaded = true;

        // Clear analytics cache so it recalculates with full MCQ data
        analyticsCache.clear();

        return bundledMCQsCache;
    } catch (error) {
        console.error('Failed to load bundled MCQs:', error);
        return [];
    }
};

/**
 * Get bundled MCQs (sync, returns cached or empty if not loaded)
 */
export const getBundledMCQs = (): SavedMCQ[] => {
    if (!bundledMCQsCache) return [];
    return bundledMCQsCache;
};

/**
 * Check if bundled MCQs are loaded
 */
export const areBundledMCQsLoaded = (): boolean => bundledMCQsLoaded;

/**
 * Get all MCQs (user-generated + bundled)
 */
export const getAllMCQs = (): SavedMCQ[] => {
    const userMCQs = getUserMCQs();
    const bundled = getBundledMCQs();
    return [...userMCQs, ...bundled];
};

/**
 * Get unique books derived from MCQ data
 * Creates virtual "books" from unique topic fields (or bookId) in MCQs
 */
export const getUniqueBooksFromMCQs = (): { id: string; name: string; total: number; uploadedAt: number; totalChunks: number; totalCharacters: number }[] => {
    const allMCQs = getAllMCQs();

    // Group MCQs by topic (preferred) or bookId
    const topicMap = new Map<string, number>();
    for (const mcq of allMCQs) {
        // Prefer topic field for grouping, fall back to bookId
        const topic = mcq.topic || mcq.bookId || 'General';
        topicMap.set(topic, (topicMap.get(topic) || 0) + 1);
    }

    // Convert to Book-like objects
    return Array.from(topicMap.entries()).map(([topicId, count]) => {
        // Clean up topic name for display
        let name = topicId
            .replace(/_/g, ' ')
            .replace(/OCR$/i, '')
            .replace(/\(\d+\)$/, '')
            .replace(/^\d+\./, '')
            .trim();

        // Capitalize words
        name = name.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');

        return {
            id: topicId,
            name: name || topicId,
            total: count,
            uploadedAt: Date.now(),
            totalChunks: 0,
            totalCharacters: 0
        };
    }).sort((a, b) => b.total - a.total);
};

/**
 * Save MCQs to the bank (only user-generated, not bundled)
 */
export const saveMCQs = (mcqs: SavedMCQ[]): void => {
    // Only save non-bundled MCQs to user storage
    const newMCQs = mcqs.filter(m => !m.isBundled);
    const existing = getUserMCQs();
    const updated = [...existing, ...newMCQs];
    localStorage.setItem(MCQ_BANK_KEY, JSON.stringify(updated));
    invalidateUserMCQsCache();
};

/**
 * Get MCQs for a specific book
 */
export const getMCQsByBook = (bookId: string): SavedMCQ[] => {
    return getAllMCQs().filter(mcq => mcq.bookId === bookId);
};

/**
 * Get MCQs that haven't been attempted yet
 */
export const getUnusedMCQs = (bookId: string): SavedMCQ[] => {
    return getMCQsByBook(bookId).filter(mcq => mcq.timesAttempted === 0);
};

/**
 * Get MCQs sorted by least attempted (for spaced repetition)
 */
export const getLeastAttemptedMCQs = (bookId: string, count: number = 10): SavedMCQ[] => {
    return getMCQsByBook(bookId)
        .sort((a, b) => a.timesAttempted - b.timesAttempted)
        .slice(0, count);
};

/**
 * Get MCQs sorted by lowest accuracy (weakest areas)
 */
export const getWeakestMCQs = (bookId: string, count: number = 10): SavedMCQ[] => {
    return getMCQsByBook(bookId)
        .filter(mcq => mcq.timesAttempted > 0)
        .sort((a, b) => {
            const accuracyA = a.correctAttempts / a.timesAttempted;
            const accuracyB = b.correctAttempts / b.timesAttempted;
            return accuracyA - accuracyB;
        })
        .slice(0, count);
};

/**
 * Get MCQs that were answered incorrectly (more wrong than right)
 */
export const getWrongAnswers = (count: number = 20): SavedMCQ[] => {
    return getAllMCQs()
        .filter(mcq => mcq.timesAttempted > 0 && mcq.correctAttempts < mcq.timesAttempted)
        .sort((a, b) => {
            // Sort by accuracy (worst first)
            const accuracyA = a.correctAttempts / a.timesAttempted;
            const accuracyB = b.correctAttempts / b.timesAttempted;
            return accuracyA - accuracyB;
        })
        .slice(0, count);
};

/**
 * Get random MCQs from all books (for Quick Quiz)
 */
export const getRandomMCQs = (count: number = 5): SavedMCQ[] => {
    const allMCQs = getAllMCQs();
    if (allMCQs.length === 0) return [];

    // Shuffle using Fisher-Yates
    const shuffled = [...allMCQs];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return getBalancedMCQSet(shuffled, count);
};


/**
 * Update MCQ stats after an attempt (with SRS integration + time/mistake tracking)
 * Returns a friendly message for UI display
 * 
 * @param mcqId - The MCQ ID
 * @param correct - Whether the answer was correct
 * @param answerTimeMs - Time taken to answer in milliseconds
 * @param selectedOption - The option the user selected
 */
export const updateMCQStats = (
    mcqId: string,
    correct: boolean,
    answerTimeMs?: number,
    selectedOption?: 'A' | 'B' | 'C' | 'D'
): string => {
    const allMCQs = getAllMCQs();
    const mcq = allMCQs.find(m => m.id === mcqId);

    if (!mcq) return '';

    // Track daily goal progress (invisible to user)
    recordQuestionAttempt(correct);

    // DAILY GOAL BONUS IS NOW HANDLED IN APP.TSX TO TRIGGER UI EVENTS

    // Calculate SRS scheduling
    const srsResult = calculateNextReview(mcq, correct);

    // Helper to update time tracking
    const updateTimeTracking = (stats: any) => {
        if (answerTimeMs && answerTimeMs > 0) {
            // Keep last 5 answer times
            const times = stats.answerTimesMs || [];
            times.push(answerTimeMs);
            if (times.length > 5) times.shift();
            stats.answerTimesMs = times;

            // Update running average
            stats.avgAnswerTimeMs = Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length);
        }
    };

    // Helper to update wrong option tracking
    const updateWrongOptionHistory = (stats: any) => {
        if (!correct && selectedOption && selectedOption !== mcq.correctAnswer) {
            // Keep last 10 wrong options
            const history = stats.wrongOptionHistory || [];
            history.push(selectedOption);
            if (history.length > 10) history.shift();
            stats.wrongOptionHistory = history;
        }
    };

    if (mcq.isBundled) {
        // Update bundled MCQ stats in separate storage
        const stats = JSON.parse(localStorage.getItem(MCQ_STATS_KEY) || '{}');
        if (!stats[mcqId]) {
            stats[mcqId] = {
                timesAttempted: 0,
                correctAttempts: 0,
                lastAttemptedAt: 0,
                srsInterval: 1,
                srsEaseFactor: 2.5,
                srsNextReviewAt: 0,
                srsLevel: 0,
                avgAnswerTimeMs: 0,
                answerTimesMs: [],
                wrongOptionHistory: []
            };
        }
        stats[mcqId].timesAttempted += 1;
        stats[mcqId].lastAttemptedAt = Date.now();
        if (correct) {
            stats[mcqId].correctAttempts += 1;
        }
        // SRS updates
        stats[mcqId].srsInterval = srsResult.newInterval;
        stats[mcqId].srsEaseFactor = srsResult.newEaseFactor;
        stats[mcqId].srsNextReviewAt = srsResult.nextReviewAt;
        stats[mcqId].srsLevel = srsResult.newLevel;

        // Time and mistake tracking
        updateTimeTracking(stats[mcqId]);
        updateWrongOptionHistory(stats[mcqId]);

        localStorage.setItem(MCQ_STATS_KEY, JSON.stringify(stats));

        // Update cache too
        if (bundledMCQsCache) {
            const cacheIndex = bundledMCQsCache.findIndex(m => m.id === mcqId);
            if (cacheIndex !== -1) {
                bundledMCQsCache[cacheIndex].timesAttempted += 1;
                bundledMCQsCache[cacheIndex].lastAttemptedAt = Date.now();
                if (correct) {
                    bundledMCQsCache[cacheIndex].correctAttempts += 1;
                }
                bundledMCQsCache[cacheIndex].srsInterval = srsResult.newInterval;
                bundledMCQsCache[cacheIndex].srsEaseFactor = srsResult.newEaseFactor;
                bundledMCQsCache[cacheIndex].srsNextReviewAt = srsResult.nextReviewAt;
                bundledMCQsCache[cacheIndex].srsLevel = srsResult.newLevel;
                bundledMCQsCache[cacheIndex].avgAnswerTimeMs = stats[mcqId].avgAnswerTimeMs;
                bundledMCQsCache[cacheIndex].answerTimesMs = stats[mcqId].answerTimesMs;
                bundledMCQsCache[cacheIndex].wrongOptionHistory = stats[mcqId].wrongOptionHistory;
            }
        }
    } else {
        // Update user MCQ in localStorage
        const userMCQs = getUserMCQs();
        const index = userMCQs.findIndex(m => m.id === mcqId);
        if (index !== -1) {
            userMCQs[index].timesAttempted += 1;
            userMCQs[index].lastAttemptedAt = Date.now();
            if (correct) {
                userMCQs[index].correctAttempts += 1;
            }
            // SRS updates
            userMCQs[index].srsInterval = srsResult.newInterval;
            userMCQs[index].srsEaseFactor = srsResult.newEaseFactor;
            userMCQs[index].srsNextReviewAt = srsResult.nextReviewAt;
            userMCQs[index].srsLevel = srsResult.newLevel;

            // Time and mistake tracking
            updateTimeTracking(userMCQs[index]);
            updateWrongOptionHistory(userMCQs[index]);

            localStorage.setItem(MCQ_BANK_KEY, JSON.stringify(userMCQs));
            invalidateUserMCQsCache();
        }
    }

    return srsResult.friendlyMessage;
};

/**
 * Delete all MCQs for a book
 */
export const deleteMCQsByBook = (bookId: string): void => {
    const mcqs = getAllMCQs().filter(m => m.bookId !== bookId);
    localStorage.setItem(MCQ_BANK_KEY, JSON.stringify(mcqs));
    invalidateUserMCQsCache();
};

/**
 * Get statistics for a book's MCQs
 */
export const getBookMCQStats = (bookId: string): {
    total: number;
    attempted: number;
    correct: number;
    accuracy: number;
} => {
    const mcqs = getMCQsByBook(bookId);
    const attempted = mcqs.filter(m => m.timesAttempted > 0).length;
    const totalAttempts = mcqs.reduce((sum, m) => sum + m.timesAttempted, 0);
    const totalCorrect = mcqs.reduce((sum, m) => sum + m.correctAttempts, 0);

    return {
        total: mcqs.length,
        attempted,
        correct: totalCorrect,
        accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    };
};

/**
 * Delete a single MCQ
 */
export const deleteMCQ = (mcqId: string): void => {
    const mcqs = getAllMCQs().filter(m => m.id !== mcqId);
    localStorage.setItem(MCQ_BANK_KEY, JSON.stringify(mcqs));
    invalidateUserMCQsCache();
};

/**
 * Delete multiple MCQs
 */
export const deleteMCQs = (mcqIds: string[]): void => {
    const idsSet = new Set(mcqIds);
    const mcqs = getAllMCQs().filter(m => !idsSet.has(m.id));
    localStorage.setItem(MCQ_BANK_KEY, JSON.stringify(mcqs));
    invalidateUserMCQsCache();
};

/**
 * Update an MCQ (for editing answers/explanations)
 */
export const updateMCQ = (mcqId: string, updates: Partial<SavedMCQ>): void => {
    const mcqs = getAllMCQs();
    const index = mcqs.findIndex(m => m.id === mcqId);

    if (index !== -1) {
        mcqs[index] = { ...mcqs[index], ...updates };
        localStorage.setItem(MCQ_BANK_KEY, JSON.stringify(mcqs));
        invalidateUserMCQsCache();
    }
};

/**
 * Reset stats for a single MCQ (clear attempts, accuracy, SRS data)
 */
export const resetMCQStats = (mcqId: string): void => {
    const mcqs = getUserMCQs();
    const index = mcqs.findIndex(m => m.id === mcqId);

    if (index !== -1) {
        mcqs[index] = {
            ...mcqs[index],
            timesAttempted: 0,
            correctAttempts: 0,
            lastAttemptedAt: undefined,
            avgAnswerTimeMs: undefined,
            answerTimesMs: [],
            wrongOptionHistory: [],
            srsInterval: 1,
            srsEaseFactor: 2.5,
            srsNextReviewAt: undefined
        };
        localStorage.setItem(MCQ_BANK_KEY, JSON.stringify(mcqs));
        invalidateUserMCQsCache();
    }
};

/**
 * Get MCQs by sub-topic
 */
export const getMCQsBySubTopic = (subTopicId: string): SavedMCQ[] => {
    return getAllMCQs().filter(m => m.subTopicId === subTopicId);
};

/**
 * Get MCQs by sub-topic name
 */
export const getMCQsBySubTopicName = (subTopicName: string): SavedMCQ[] => {
    return getAllMCQs().filter(m => m.subTopicName === subTopicName);
};

/**
 * Get unique sub-topics from MCQs
 */
export const getUniqueSubTopics = (bookId?: string): { id: string; name: string }[] => {
    let mcqs = bookId ? getMCQsByBook(bookId) : getAllMCQs();

    const subTopicMap = new Map<string, string>();
    mcqs.forEach(m => {
        if (m.subTopicId && m.subTopicName) {
            subTopicMap.set(m.subTopicId, m.subTopicName);
        }
    });

    return Array.from(subTopicMap.entries()).map(([id, name]) => ({ id, name }));
};

/**
 * Get statistics for a specific sub-topic
 */
export const getSubTopicStats = (subTopicId: string): {
    total: number;
    attempted: number;
    correct: number;
    accuracy: number;
    name: string;
} => {
    const mcqs = getMCQsBySubTopic(subTopicId);
    const attempted = mcqs.filter(m => m.timesAttempted > 0).length;
    const totalAttempts = mcqs.reduce((sum, m) => sum + m.timesAttempted, 0);
    const totalCorrect = mcqs.reduce((sum, m) => sum + m.correctAttempts, 0);
    const name = mcqs[0]?.subTopicName || 'Unknown';

    return {
        total: mcqs.length,
        attempted,
        correct: totalCorrect,
        accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
        name,
    };
};

/**
 * Get statistics for all sub-topics of a book
 * Uses sourceSection (from MCQ generation) to group by actual content sections
 */
export const getAllSubTopicStats = (bookId: string): {
    subTopicId: string;
    name: string;
    total: number;
    attempted: number;
    accuracy: number;
    isWeak: boolean;
}[] => {
    const mcqs = getMCQsByBook(bookId);

    // Group by sourceSection (the actual section title from generation)
    // Falls back to 'General' only if sourceSection is truly missing
    const subTopicMap = new Map<string, SavedMCQ[]>();
    mcqs.forEach(m => {
        // Use sourceSection, clean it up, or fall back to 'General'
        let key = m.sourceSection?.trim() || 'General';

        // Truncate very long section names for display
        if (key.length > 50) {
            key = key.substring(0, 47) + '...';
        }

        if (!subTopicMap.has(key)) {
            subTopicMap.set(key, []);
        }
        subTopicMap.get(key)!.push(m);
    });

    // Calculate stats for each sub-topic
    const stats = Array.from(subTopicMap.entries()).map(([sectionName, mcqList]) => {
        const totalAttempts = mcqList.reduce((sum, m) => sum + m.timesAttempted, 0);
        const totalCorrect = mcqList.reduce((sum, m) => sum + m.correctAttempts, 0);
        const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : -1;
        const attempted = mcqList.filter(m => m.timesAttempted > 0).length;

        return {
            subTopicId: sectionName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            name: sectionName,
            total: mcqList.length,
            attempted,
            accuracy,
            isWeak: accuracy >= 0 && accuracy < 60, // < 60% is weak
        };
    });

    // Sort: weak areas first, then by accuracy
    return stats.sort((a, b) => {
        if (a.isWeak && !b.isWeak) return -1;
        if (!a.isWeak && b.isWeak) return 1;
        if (a.accuracy === -1) return 1;
        if (b.accuracy === -1) return -1;
        return a.accuracy - b.accuracy;
    });
};

/**
 * Ghost Intelligence: Get MCQs for Sprint Mode
 * 
 * Prioritizes questions in the "almost mastered" range (60-85% accuracy).
 * These are questions the user knows somewhat but need reinforcement under pressure.
 * 
 * Falls back to random if not enough "almost mastered" questions.
 */
export const getSprintMCQs = (count: number = 50): SavedMCQ[] => {
    const allMCQs = getAllMCQs();
    if (allMCQs.length === 0) return [];

    // Find "almost mastered" questions (60-85% accuracy)
    const almostMastered = allMCQs.filter(mcq => {
        if (mcq.timesAttempted < 1) return false;
        const accuracy = mcq.correctAttempts / mcq.timesAttempted;
        return accuracy >= 0.60 && accuracy <= 0.85;
    });

    // Find weak questions (< 60% accuracy) for additional challenge
    const weakQuestions = allMCQs.filter(mcq => {
        if (mcq.timesAttempted < 1) return false;
        const accuracy = mcq.correctAttempts / mcq.timesAttempted;
        return accuracy < 0.60;
    });

    // Shuffle both pools
    const shuffleArray = <T>(arr: T[]): T[] => {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    const shuffledAlmost = shuffleArray(almostMastered);
    const shuffledWeak = shuffleArray(weakQuestions);

    // Combine: 70% almost mastered, 30% weak (for challenge)
    const result: SavedMCQ[] = [];
    const seen = new Set<string>();

    // Add almost mastered (priority)
    const almostTarget = Math.floor(count * 0.7);
    for (const mcq of shuffledAlmost) {
        if (result.length >= almostTarget) break;
        if (!seen.has(mcq.id)) {
            result.push(mcq);
            seen.add(mcq.id);
        }
    }

    // Add weak questions
    for (const mcq of shuffledWeak) {
        if (result.length >= count) break;
        if (!seen.has(mcq.id)) {
            result.push(mcq);
            seen.add(mcq.id);
        }
    }

    // If still not enough, fill with any random MCQs
    if (result.length < count) {
        const remaining = shuffleArray(allMCQs.filter(m => !seen.has(m.id)));
        for (const mcq of remaining) {
            if (result.length >= count) break;
            result.push(mcq);
        }
    }

    // Apply strict balancing to the final selection to ensure speed
    // For Sprint, we allow a higher ratio of one-liners (up to 40%) for speed
    return getBalancedMCQSet(result, count, 0.4);
};

/**
 * Ghost Intelligence: Get coverage-aware MCQs for Random Challenge
 * 
 * Prioritizes topics/books that haven't been seen recently.
 * Ensures all topics get attention, not just favorites.
 */
export const getCoverageAwareMCQs = (count: number = 10): SavedMCQ[] => {
    const allMCQs = getAllMCQs();
    if (allMCQs.length === 0) return [];

    // Group by topic
    const topicMap = new Map<string, SavedMCQ[]>();
    allMCQs.forEach(mcq => {
        const topic = mcq.topic || mcq.bookId || 'unknown';
        if (!topicMap.has(topic)) {
            topicMap.set(topic, []);
        }
        topicMap.get(topic)!.push(mcq);
    });

    // Calculate recency score for each topic (lower = less recently practiced)
    const topicRecency: Array<{ topic: string; recencyScore: number; mcqs: SavedMCQ[] }> = [];
    topicMap.forEach((mcqs, topic) => {
        const lastAttemptedTimes = mcqs
            .filter(m => m.lastAttemptedAt)
            .map(m => m.lastAttemptedAt || 0);

        const avgRecency = lastAttemptedTimes.length > 0
            ? lastAttemptedTimes.reduce((a, b) => a + b, 0) / lastAttemptedTimes.length
            : 0; // Topics never attempted get priority

        topicRecency.push({ topic, recencyScore: avgRecency, mcqs });
    });

    // Sort by recency (least recent first = highest priority)
    topicRecency.sort((a, b) => a.recencyScore - b.recencyScore);

    // Round-robin pick from topics, prioritizing least-recently-seen
    const result: SavedMCQ[] = [];
    const seen = new Set<string>();

    // Keep cycling through topics until we have enough
    let attempts = 0;
    while (result.length < count && attempts < count * 3) {
        for (const { mcqs } of topicRecency) {
            if (result.length >= count) break;

            // Pick a random unseen MCQ from this topic
            const available = mcqs.filter(m => !seen.has(m.id));
            if (available.length > 0) {
                const randomIndex = Math.floor(Math.random() * available.length);
                const picked = available[randomIndex];
                result.push(picked);
                seen.add(picked.id);
            }
        }
        attempts++;
    }

    // Final shuffle
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return getBalancedMCQSet(result, count);
};
