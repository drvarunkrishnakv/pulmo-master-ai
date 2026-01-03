/**
 * Difficulty Calibration Service
 * 
 * Estimates question difficulty and adapts selection based on user performance.
 * Harder questions for strong performers, easier for those who need foundations.
 */

import { SavedMCQ } from '../types';
import { getAllMCQs } from './mcqBankService';
import { getMemoryStats } from './memoryService';

// Difficulty levels
export enum DifficultyLevel {
    EASY = 1,
    MEDIUM = 2,
    HARD = 3,
    EXPERT = 4,
    MASTER = 5
}

const DIFFICULTY_STATS_KEY = 'pulmo_difficulty_stats';

interface DifficultyStats {
    [mcqId: string]: {
        globalCorrectRate: number; // Based on multiple users (future) or time-based decay
        estimatedDifficulty: DifficultyLevel;
        totalAttempts: number;
    };
}

/**
 * Estimate difficulty of an MCQ based on global accuracy
 * (For now, uses user's own performance as proxy)
 */
export const estimateDifficulty = (mcq: SavedMCQ): DifficultyLevel => {
    if (mcq.timesAttempted === 0) {
        // New question - use heuristics
        return estimateDifficultyFromContent(mcq);
    }

    const accuracy = mcq.timesAttempted > 0
        ? mcq.correctAttempts / mcq.timesAttempted
        : 0.5;

    // Lower accuracy = harder question
    if (accuracy >= 0.9) return DifficultyLevel.EASY;
    if (accuracy >= 0.7) return DifficultyLevel.MEDIUM;
    if (accuracy >= 0.5) return DifficultyLevel.HARD;
    if (accuracy >= 0.3) return DifficultyLevel.EXPERT;
    return DifficultyLevel.MASTER;
};

/**
 * Estimate difficulty from question content (for new questions)
 */
const estimateDifficultyFromContent = (mcq: SavedMCQ): DifficultyLevel => {
    let difficultyScore = 2; // Start at medium

    // Longer questions tend to be harder
    if (mcq.question.length > 300) difficultyScore += 0.5;
    if (mcq.question.length > 500) difficultyScore += 0.5;

    // Questions with numbers/calculations tend to be harder
    const hasNumbers = /\d+/.test(mcq.question);
    if (hasNumbers) difficultyScore += 0.3;

    // Keywords that suggest higher difficulty
    const hardKeywords = ['except', 'not true', 'false', 'contraindicated', 'most likely'];
    const hasHardKeywords = hardKeywords.some(kw => mcq.question.toLowerCase().includes(kw));
    if (hasHardKeywords) difficultyScore += 0.5;

    // Similar options (confusing) = harder
    const optionLengths = [
        mcq.options.A.length,
        mcq.options.B.length,
        mcq.options.C.length,
        mcq.options.D.length
    ];
    const avgOptionLength = optionLengths.reduce((a, b) => a + b, 0) / 4;
    if (avgOptionLength > 100) difficultyScore += 0.3;

    return Math.round(Math.max(1, Math.min(5, difficultyScore))) as DifficultyLevel;
};

/**
 * Get user's current performance level in a topic
 */
export const getUserTopicLevel = (topic: string): DifficultyLevel => {
    const allMCQs = getAllMCQs();
    const topicMCQs = allMCQs.filter(m => m.topic === topic && m.timesAttempted > 0);

    if (topicMCQs.length < 3) {
        return DifficultyLevel.MEDIUM; // Not enough data
    }

    const totalCorrect = topicMCQs.reduce((sum, m) => sum + m.correctAttempts, 0);
    const totalAttempts = topicMCQs.reduce((sum, m) => sum + m.timesAttempted, 0);
    const accuracy = totalCorrect / totalAttempts;

    // Also consider recent performance (streak)
    const memoryStats = getMemoryStats();
    const recentStreaks = topicMCQs
        .map(m => memoryStats[m.id]?.correctStreak || 0)
        .filter(s => s > 0);
    const avgStreak = recentStreaks.length > 0
        ? recentStreaks.reduce((a, b) => a + b, 0) / recentStreaks.length
        : 0;

    // Combine accuracy and streak for level determination
    const performanceScore = accuracy * 0.7 + Math.min(avgStreak / 5, 1) * 0.3;

    if (performanceScore >= 0.85) return DifficultyLevel.MASTER;
    if (performanceScore >= 0.7) return DifficultyLevel.EXPERT;
    if (performanceScore >= 0.55) return DifficultyLevel.HARD;
    if (performanceScore >= 0.4) return DifficultyLevel.MEDIUM;
    return DifficultyLevel.EASY;
};

/**
 * Get target difficulty for next question based on user level
 */
export const getTargetDifficulty = (topic: string): DifficultyLevel => {
    const userLevel = getUserTopicLevel(topic);

    // Challenge slightly above current level
    return Math.min(DifficultyLevel.MASTER, userLevel + 1) as DifficultyLevel;
};

/**
 * Score how well an MCQ matches target difficulty
 * Higher score = better match
 */
export const getDifficultyMatchScore = (mcq: SavedMCQ, targetDifficulty: DifficultyLevel): number => {
    const mcqDifficulty = estimateDifficulty(mcq);
    const diff = Math.abs(mcqDifficulty - targetDifficulty);

    // Perfect match = 1, one level off = 0.7, two levels = 0.4, etc.
    return Math.max(0.1, 1 - diff * 0.3);
};

/**
 * Filter and sort MCQs by difficulty match
 */
export const sortByDifficultyMatch = (mcqs: SavedMCQ[], topic: string): SavedMCQ[] => {
    const targetDifficulty = getTargetDifficulty(topic);

    return [...mcqs].sort((a, b) => {
        const scoreA = getDifficultyMatchScore(a, targetDifficulty);
        const scoreB = getDifficultyMatchScore(b, targetDifficulty);
        return scoreB - scoreA; // Higher score first
    });
};

/**
 * Get difficulty distribution for analytics
 */
export const getDifficultyDistribution = (topic?: string): Map<DifficultyLevel, number> => {
    const allMCQs = getAllMCQs();
    const filtered = topic ? allMCQs.filter(m => m.topic === topic) : allMCQs;

    const distribution = new Map<DifficultyLevel, number>();
    distribution.set(DifficultyLevel.EASY, 0);
    distribution.set(DifficultyLevel.MEDIUM, 0);
    distribution.set(DifficultyLevel.HARD, 0);
    distribution.set(DifficultyLevel.EXPERT, 0);
    distribution.set(DifficultyLevel.MASTER, 0);

    filtered.forEach(mcq => {
        const difficulty = estimateDifficulty(mcq);
        distribution.set(difficulty, (distribution.get(difficulty) || 0) + 1);
    });

    return distribution;
};

/**
 * Get difficulty label for display
 */
export const getDifficultyLabel = (difficulty: DifficultyLevel): string => {
    switch (difficulty) {
        case DifficultyLevel.EASY: return '🟢 Easy';
        case DifficultyLevel.MEDIUM: return '🟡 Medium';
        case DifficultyLevel.HARD: return '🟠 Hard';
        case DifficultyLevel.EXPERT: return '🔴 Expert';
        case DifficultyLevel.MASTER: return '⚫ Master';
        default: return '🟡 Medium';
    }
};
