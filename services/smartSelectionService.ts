/**
 * Smart Question Selection Service
 * 
 * Combines memory intelligence, weak spot detection, and difficulty calibration
 * to select optimal questions for learning.
 */

import { SavedMCQ } from '../types';
import { getAllMCQs, getMCQsByBook } from './mcqBankService';
import { getAtRiskItems, calculatePredictedRetention, getMemoryStats } from './memoryService';
import { getWeakSpotWeight, isWeakSpot } from './weakSpotService';
import { estimateDifficulty, getUserTopicLevel, getDifficultyMatchScore, DifficultyLevel } from './difficultyService';

// Helper: Get MCQs due for SRS review
const getDueMCQs = (): SavedMCQ[] => {
    const now = Date.now();
    return getAllMCQs().filter(m => m.srsNextReviewAt && m.srsNextReviewAt <= now);
};

interface SelectionWeight {
    mcq: SavedMCQ;
    totalWeight: number;
    reasons: string[];
}

/**
 * Get smart selection of MCQs based on memory, difficulty, and weak spots
 */
export const getSmartMCQSelection = (
    count: number,
    bookId?: string,
    options: {
        prioritizeWeakSpots?: boolean;
        prioritizeAtRisk?: boolean;
        matchDifficulty?: boolean;
        includeDue?: boolean;
    } = {}
): SavedMCQ[] => {
    const {
        prioritizeWeakSpots = true,
        prioritizeAtRisk = true,
        matchDifficulty = true,
        includeDue = true
    } = options;

    // Get base pool of MCQs
    let pool = bookId ? getMCQsByBook(bookId) : getAllMCQs();

    if (pool.length === 0) return [];
    if (pool.length <= count) return shuffleArray(pool);

    const memoryStats = getMemoryStats();
    const atRiskIds = new Set(getAtRiskItems(0.5).map(item => item.id));

    // Calculate weight for each MCQ
    const weighted: SelectionWeight[] = pool.map(mcq => {
        let weight = 1;
        const reasons: string[] = [];

        // 1. Due for review (SRS) - highest priority
        if (includeDue && mcq.srsNextReviewAt && mcq.srsNextReviewAt <= Date.now()) {
            weight += 3;
            reasons.push('Due for review');
        }

        // 2. At risk of forgetting
        if (prioritizeAtRisk && atRiskIds.has(mcq.id)) {
            weight += 2;
            reasons.push('At risk of forgetting');
        }

        // 3. Weak spot topic
        if (prioritizeWeakSpots && isWeakSpot(mcq.topic, mcq.subTopicName)) {
            const weakWeight = getWeakSpotWeight(mcq.topic, mcq.subTopicName);
            weight += weakWeight;
            reasons.push('Weak spot area');
        }

        // 4. Difficulty match
        if (matchDifficulty) {
            const targetDifficulty = getUserTopicLevel(mcq.topic) + 1;
            const matchScore = getDifficultyMatchScore(mcq, Math.min(targetDifficulty, DifficultyLevel.MASTER) as DifficultyLevel);
            weight += matchScore;
            if (matchScore > 0.7) {
                reasons.push('Good difficulty match');
            }
        }

        // 5. Never attempted - slight boost to introduce new content
        if (mcq.timesAttempted === 0) {
            weight += 0.5;
            reasons.push('New question');
        }

        // 6. Low memory strength items
        const stats = memoryStats[mcq.id];
        if (stats && stats.memoryStrength < 3) {
            weight += 1;
            reasons.push('Needs reinforcement');
        }

        return { mcq, totalWeight: weight, reasons };
    });

    // Sort by weight (highest first)
    weighted.sort((a, b) => b.totalWeight - a.totalWeight);

    // Take top candidates with some randomization
    const topCandidates = weighted.slice(0, Math.min(count * 3, weighted.length));
    const selected = weightedRandomSelect(topCandidates, count);

    return selected.map(w => w.mcq);
};

/**
 * Weighted random selection from candidates
 */
const weightedRandomSelect = (candidates: SelectionWeight[], count: number): SelectionWeight[] => {
    const selected: SelectionWeight[] = [];
    const remaining = [...candidates];

    while (selected.length < count && remaining.length > 0) {
        const totalWeight = remaining.reduce((sum, c) => sum + c.totalWeight, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < remaining.length; i++) {
            random -= remaining[i].totalWeight;
            if (random <= 0) {
                selected.push(remaining[i]);
                remaining.splice(i, 1);
                break;
            }
        }
    }

    return selected;
};

/**
 * Shuffle array (Fisher-Yates)
 */
const shuffleArray = <T>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

/**
 * Get a study session optimized for learning
 * Mixes due items, weak spots, prerequisite concepts, and new content
 */
export const getOptimalStudySession = (sessionSize: number = 10): {
    mcqs: SavedMCQ[];
    breakdown: {
        dueForReview: number;
        weakSpots: number;
        atRisk: number;
        prerequisites: number;
        newContent: number;
    };
} => {
    const memoryStats = getMemoryStats();
    const atRiskIds = new Set(getAtRiskItems(0.5).map(item => item.id));

    // Get due items first (40%)
    const dueMCQs = getDueMCQs().slice(0, Math.ceil(sessionSize * 0.4));

    // Get prerequisite MCQs from concept linking (10%)
    let prerequisiteMCQs: SavedMCQ[] = [];
    try {
        // Dynamic import to avoid circular dependency
        const { getPrerequisiteMCQs } = require('./conceptLinkService');
        prerequisiteMCQs = getPrerequisiteMCQs(Math.ceil(sessionSize * 0.1));
    } catch (e) {
        // Service not available, skip
    }

    // Get smart selection for remainder
    const usedIds = new Set([...dueMCQs.map(m => m.id), ...prerequisiteMCQs.map(m => m.id)]);
    const remaining = sessionSize - dueMCQs.length - prerequisiteMCQs.length;
    const smartSelection = getSmartMCQSelection(remaining, undefined, {
        prioritizeWeakSpots: true,
        prioritizeAtRisk: true,
        matchDifficulty: true,
        includeDue: false // Already got due items
    }).filter(m => !usedIds.has(m.id));

    // Combine all sources
    const combined = [...dueMCQs, ...prerequisiteMCQs, ...smartSelection].slice(0, sessionSize);

    // Calculate breakdown
    const breakdown = {
        dueForReview: dueMCQs.length,
        weakSpots: combined.filter(m => isWeakSpot(m.topic, m.subTopicName)).length,
        atRisk: combined.filter(m => atRiskIds.has(m.id)).length,
        prerequisites: prerequisiteMCQs.length,
        newContent: combined.filter(m => m.timesAttempted === 0).length
    };

    return { mcqs: shuffleArray(combined), breakdown };
};

/**
 * Get why an MCQ was selected (for debugging/transparency)
 */
export const getSelectionReason = (mcq: SavedMCQ): string[] => {
    const reasons: string[] = [];
    const memoryStats = getMemoryStats();
    const stats = memoryStats[mcq.id];

    if (mcq.srsNextReviewAt && mcq.srsNextReviewAt <= Date.now()) {
        reasons.push('Due for review');
    }

    if (isWeakSpot(mcq.topic, mcq.subTopicName)) {
        reasons.push('Weak spot area');
    }

    if (stats) {
        const retention = calculatePredictedRetention(stats.memoryStrength, stats.lastReviewedAt);
        if (retention < 0.5) {
            reasons.push('At risk of forgetting');
        }
        if (stats.memoryStrength < 3) {
            reasons.push('Low memory strength');
        }
    }

    if (mcq.timesAttempted === 0) {
        reasons.push('New question');
    }

    if (reasons.length === 0) {
        reasons.push('Random selection');
    }

    return reasons;
};

/**
 * Generate a targeted practice session for a specific book
 * Priorities:
 * 1. Wrong answers (50%)
 * 2. At risk / Forgotten (30%)
 * 3. High yield new content (20%)
 */
export const generateTargetedPracticeSession = (bookId: string, sessionSize: number = 15): SavedMCQ[] => {
    const allBookMCQs = getMCQsByBook(bookId);
    if (allBookMCQs.length <= sessionSize) return shuffleArray(allBookMCQs);

    const memoryStats = getMemoryStats();
    const atRiskIds = new Set(getAtRiskItems(0.6).map(item => item.id)); // Slightly looser threshold

    // Bucket questions
    const wrongAnswers = allBookMCQs.filter(m => m.correctAttempts < m.timesAttempted);
    const atRiskOrForgotten = allBookMCQs.filter(m => {
        // SRS due?
        if (m.srsNextReviewAt && m.srsNextReviewAt <= Date.now()) return true;
        // At risk?
        if (atRiskIds.has(m.id)) return true;
        // Correct but long ago (> 7 days)?
        const lastAttempt = m.lastAttemptedAt || 0;
        return m.correctAttempts > 0 && (Date.now() - lastAttempt > 7 * 24 * 60 * 60 * 1000);
    });
    const unattempted = allBookMCQs.filter(m => m.timesAttempted === 0);

    // Allocations
    const wrongCount = Math.floor(sessionSize * 0.5); // 50%
    const riskCount = Math.floor(sessionSize * 0.3);  // 30%
    // Remainder for new content

    const selected: Set<string> = new Set();
    const result: SavedMCQ[] = [];

    // Helper to add unique questions
    const addQuestions = (candidates: SavedMCQ[], limit: number) => {
        const shuffled = shuffleArray(candidates);
        for (const q of shuffled) {
            if (limit <= 0) break;
            if (!selected.has(q.id)) {
                selected.add(q.id);
                result.push(q);
                limit--;
            }
        }
    };

    // 1. Fill with Wrong Answers
    addQuestions(wrongAnswers, wrongCount);

    // 2. Fill with At Risk / Forgotten
    // If we didn't fill the wrong quota, carry over the slots here
    const currentCount = result.length;
    const remainingSlotsForRisk = (wrongCount + riskCount) - currentCount;
    addQuestions(atRiskOrForgotten, remainingSlotsForRisk);

    // 3. Fill Remainder with Unattempted High Yield (or just random unattempted)
    let remainingSlots = sessionSize - result.length;
    addQuestions(unattempted, remainingSlots);

    // 4. If still not full, just fill with random questions from the book
    if (result.length < sessionSize) {
        remainingSlots = sessionSize - result.length;
        const others = allBookMCQs.filter(m => !selected.has(m.id));
        addQuestions(others, remainingSlots);
    }

    return shuffleArray(result);
};
