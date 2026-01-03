/**
 * Memory Intelligence Service
 * 
 * Tracks memory strength across MCQs and flashcards using a forgetting curve model.
 * All intelligence is invisible to the user - the app just gets smarter.
 */

import { SavedMCQ } from '../types';

// Constants for memory calculations
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
const CHARS_PER_MS = 50; // Average reading speed: 50ms per character
const MIN_HESITATION_PENALTY_MS = 3000; // Only penalize hesitation > 3s beyond expected

// Memory storage key
const MEMORY_STATS_KEY = 'pulmo_memory_stats';

export interface MemoryStats {
    [itemId: string]: {
        memoryStrength: number;
        lastReviewedAt: number;
        correctStreak: number;
        totalReviews: number;
        avgHesitationMs: number;
        itemType: 'mcq' | 'flashcard';
        topic: string;
        subTopic?: string;
    };
}

/**
 * Calculate expected reading time based on content length
 */
export const calculateExpectedReadTime = (
    questionText: string,
    options?: { A: string; B: string; C: string; D: string }
): number => {
    let totalChars = questionText.length;

    if (options) {
        totalChars += options.A.length + options.B.length + options.C.length + options.D.length;
    }

    // Base reading time + thinking time
    return totalChars * CHARS_PER_MS + 2000; // 2s base thinking time
};

/**
 * Calculate normalized hesitation (accounts for question length)
 * Returns 0 if answered within expected time, positive if slower
 */
export const calculateNormalizedHesitation = (
    actualTimeMs: number,
    questionText: string,
    options?: { A: string; B: string; C: string; D: string }
): number => {
    const expectedTime = calculateExpectedReadTime(questionText, options);
    const hesitation = actualTimeMs - expectedTime;

    // Only count as hesitation if significantly beyond expected
    return Math.max(0, hesitation - MIN_HESITATION_PENALTY_MS);
};

/**
 * Calculate memory strength based on performance
 * Scale: 0-10, higher = stronger memory
 */
export const calculateMemoryStrength = (
    currentStrength: number,
    correct: boolean,
    hesitationMs: number,
    confidence: 'guessed' | 'somewhat' | 'certain' | null
): number => {
    let newStrength = currentStrength;

    // Base adjustment for correct/wrong
    if (correct) {
        newStrength += 0.5; // Small boost for correct

        // Bonus for quick, confident answers
        if (hesitationMs < 1000) {
            newStrength += 0.3;
        }

        // Confidence multiplier
        if (confidence === 'certain') {
            newStrength += 0.3;
        } else if (confidence === 'guessed') {
            newStrength -= 0.2; // Lucky guess doesn't strengthen memory much
        }
    } else {
        // Wrong answer weakens memory
        newStrength -= 0.8;

        // Extra penalty for confident wrong answers (misconception)
        if (confidence === 'certain') {
            newStrength -= 0.3;
        }
    }

    // Hesitation penalty (normalized by question length)
    if (hesitationMs > 5000) {
        newStrength -= 0.2; // Significant hesitation = weaker memory
    }

    // Clamp to 0-10 range
    return Math.max(0, Math.min(10, newStrength));
};

/**
 * Calculate predicted retention using forgetting curve
 * Returns probability (0-1) that user still remembers
 */
export const calculatePredictedRetention = (
    memoryStrength: number,
    lastReviewedAt: number
): number => {
    const hoursSinceReview = (Date.now() - lastReviewedAt) / MS_PER_HOUR;

    // Forgetting curve: retention = e^(-t/S)
    // Where t = time, S = memory strength as half-life multiplier
    // Higher strength = slower forgetting
    const halfLifeHours = memoryStrength * 24; // Strength 1 = 1 day half-life

    if (halfLifeHours <= 0) return 0;

    const retention = Math.exp(-hoursSinceReview / halfLifeHours);
    return Math.max(0, Math.min(1, retention));
};

/**
 * Get memory stats from storage
 */
export const getMemoryStats = (): MemoryStats => {
    try {
        const stored = localStorage.getItem(MEMORY_STATS_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
};

/**
 * Save memory stats to storage
 */
const saveMemoryStats = (stats: MemoryStats): void => {
    localStorage.setItem(MEMORY_STATS_KEY, JSON.stringify(stats));
};

/**
 * Record an MCQ attempt and update memory stats
 */
export const recordMCQAttempt = (
    mcq: SavedMCQ,
    correct: boolean,
    responseTimeMs: number,
    confidence: 'guessed' | 'somewhat' | 'certain' | null
): { memoryStrength: number; predictedRetention: number } => {
    const stats = getMemoryStats();

    // Get or initialize stats for this MCQ
    const existing = stats[mcq.id] || {
        memoryStrength: 2.5, // Start in the middle
        lastReviewedAt: Date.now(),
        correctStreak: 0,
        totalReviews: 0,
        avgHesitationMs: 0,
        itemType: 'mcq' as const,
        topic: mcq.topic,
        subTopic: mcq.subTopicName
    };

    // Calculate normalized hesitation
    const hesitationMs = calculateNormalizedHesitation(
        responseTimeMs,
        mcq.question,
        mcq.options
    );

    // Update memory strength
    const newStrength = calculateMemoryStrength(
        existing.memoryStrength,
        correct,
        hesitationMs,
        confidence
    );

    // Update streak
    const newStreak = correct ? existing.correctStreak + 1 : 0;

    // Streak bonus: consecutive correct answers strengthen memory faster
    const streakBonus = correct && newStreak >= 3 ? 0.2 * Math.min(newStreak - 2, 3) : 0;

    // Update stats
    stats[mcq.id] = {
        ...existing,
        memoryStrength: Math.min(10, newStrength + streakBonus),
        lastReviewedAt: Date.now(),
        correctStreak: newStreak,
        totalReviews: existing.totalReviews + 1,
        avgHesitationMs: (existing.avgHesitationMs * existing.totalReviews + hesitationMs) / (existing.totalReviews + 1)
    };

    saveMemoryStats(stats);

    const predictedRetention = calculatePredictedRetention(stats[mcq.id].memoryStrength, Date.now());

    return {
        memoryStrength: stats[mcq.id].memoryStrength,
        predictedRetention
    };
};

/**
 * Record a flashcard review and update memory stats
 */
export const recordFlashcardAttempt = (
    cardId: string,
    topic: string,
    subTopic: string | undefined,
    knew: boolean,
    viewTimeMs: number
): { memoryStrength: number; predictedRetention: number } => {
    const stats = getMemoryStats();

    const existing = stats[cardId] || {
        memoryStrength: 2.5,
        lastReviewedAt: Date.now(),
        correctStreak: 0,
        totalReviews: 0,
        avgHesitationMs: 0,
        itemType: 'flashcard' as const,
        topic,
        subTopic
    };

    // Flashcard: "knew" = correct, viewTime doesn't have reading length normalization
    // But we can still penalize very long view times (> 10s)
    const hesitationMs = Math.max(0, viewTimeMs - 5000);

    const newStrength = calculateMemoryStrength(
        existing.memoryStrength,
        knew,
        hesitationMs,
        null // No confidence rating for flashcards
    );

    const newStreak = knew ? existing.correctStreak + 1 : 0;
    const streakBonus = knew && newStreak >= 3 ? 0.2 * Math.min(newStreak - 2, 3) : 0;

    stats[cardId] = {
        ...existing,
        memoryStrength: Math.min(10, newStrength + streakBonus),
        lastReviewedAt: Date.now(),
        correctStreak: newStreak,
        totalReviews: existing.totalReviews + 1,
        avgHesitationMs: (existing.avgHesitationMs * existing.totalReviews + hesitationMs) / (existing.totalReviews + 1)
    };

    saveMemoryStats(stats);

    return {
        memoryStrength: stats[cardId].memoryStrength,
        predictedRetention: calculatePredictedRetention(stats[cardId].memoryStrength, Date.now())
    };
};

/**
 * Get items at risk of being forgotten (retention < 50%)
 * Sorted by retention (lowest first = most at risk)
 */
export const getAtRiskItems = (threshold: number = 0.5): Array<{
    id: string;
    topic: string;
    subTopic?: string;
    itemType: 'mcq' | 'flashcard';
    predictedRetention: number;
    memoryStrength: number;
}> => {
    const stats = getMemoryStats();

    const atRisk = Object.entries(stats)
        .map(([id, stat]) => ({
            id,
            topic: stat.topic,
            subTopic: stat.subTopic,
            itemType: stat.itemType,
            memoryStrength: stat.memoryStrength,
            predictedRetention: calculatePredictedRetention(stat.memoryStrength, stat.lastReviewedAt)
        }))
        .filter(item => item.predictedRetention < threshold)
        .sort((a, b) => a.predictedRetention - b.predictedRetention);

    return atRisk;
};

/**
 * Get memory strength for a specific item
 */
export const getItemMemoryStrength = (itemId: string): number | null => {
    const stats = getMemoryStats();
    return stats[itemId]?.memoryStrength ?? null;
};

/**
 * Get overall memory health by topic
 */
export const getMemoryHealthByTopic = (): Map<string, { avgStrength: number; atRiskCount: number; totalItems: number }> => {
    const stats = getMemoryStats();
    const byTopic = new Map<string, { strengths: number[]; atRiskCount: number }>();

    Object.values(stats).forEach(stat => {
        const topic = stat.topic;
        const existing = byTopic.get(topic) || { strengths: [], atRiskCount: 0 };

        existing.strengths.push(stat.memoryStrength);

        const retention = calculatePredictedRetention(stat.memoryStrength, stat.lastReviewedAt);
        if (retention < 0.5) {
            existing.atRiskCount++;
        }

        byTopic.set(topic, existing);
    });

    const result = new Map<string, { avgStrength: number; atRiskCount: number; totalItems: number }>();

    byTopic.forEach((data, topic) => {
        const avgStrength = data.strengths.reduce((a, b) => a + b, 0) / data.strengths.length;
        result.set(topic, {
            avgStrength,
            atRiskCount: data.atRiskCount,
            totalItems: data.strengths.length
        });
    });

    return result;
};
