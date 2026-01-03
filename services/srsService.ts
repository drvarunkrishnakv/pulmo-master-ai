/**
 * Invisible Spaced Repetition System (SRS) Service
 * 
 * Based on SM-2 algorithm but simplified and invisible to users.
 * Intervals scale from 1 day to 6+ months for long-term retention.
 */

import { SavedMCQ } from '../types';
import { getBalancedMCQSet } from './mcqUtils';

// SRS Constants
const DEFAULT_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0;
const EASE_BONUS = 0.1;  // Added on correct
const EASE_PENALTY = 0.2; // Subtracted on wrong
const MAX_INTERVAL_DAYS = 180; // 6 months max interval

// Initial intervals for learning phase (in days)
const LEARNING_INTERVALS = [1, 3, 7]; // Day 1, Day 3, Day 7

/**
 * Calculate the next review date and interval based on answer result
 */
export const calculateNextReview = (
    mcq: SavedMCQ,
    wasCorrect: boolean
): {
    nextReviewAt: number;
    newInterval: number;
    newEaseFactor: number;
    newLevel: number;
    friendlyMessage: string;
} => {
    const now = Date.now();
    const currentLevel = mcq.srsLevel ?? 0;
    const currentInterval = mcq.srsInterval ?? 1;
    const currentEase = mcq.srsEaseFactor ?? DEFAULT_EASE_FACTOR;

    let newInterval: number;
    let newEaseFactor: number;
    let newLevel: number;
    let friendlyMessage: string;

    if (wasCorrect) {
        // Correct answer - advance through levels
        newEaseFactor = Math.min(currentEase + EASE_BONUS, MAX_EASE_FACTOR);

        if (currentLevel < LEARNING_INTERVALS.length) {
            // Still in learning phase - use fixed intervals
            newLevel = currentLevel + 1;
            newInterval = LEARNING_INTERVALS[Math.min(currentLevel, LEARNING_INTERVALS.length - 1)];
        } else {
            // Review phase - multiply by ease factor
            newLevel = currentLevel + 1;
            newInterval = Math.round(currentInterval * newEaseFactor);
        }

        // Cap at max interval
        newInterval = Math.min(newInterval, MAX_INTERVAL_DAYS);

        // Generate friendly message
        friendlyMessage = getFriendlyDuration(newInterval);

    } else {
        // Wrong answer - reset to beginning
        newLevel = 0;
        newInterval = 1; // Review again tomorrow
        newEaseFactor = Math.max(currentEase - EASE_PENALTY, MIN_EASE_FACTOR);
        friendlyMessage = "See you tomorrow 👋";
    }

    const nextReviewAt = now + (newInterval * 24 * 60 * 60 * 1000);

    return {
        nextReviewAt,
        newInterval,
        newEaseFactor,
        newLevel,
        friendlyMessage
    };
};

/**
 * Get a friendly human-readable duration message
 */
const getFriendlyDuration = (days: number): string => {
    if (days === 1) return "See you tomorrow! 👋";
    if (days <= 3) return `Great! See you in ${days} days`;
    if (days <= 7) return "Nice! See you next week 📅";
    if (days <= 14) return "Solid! See you in 2 weeks 🎯";
    if (days <= 30) return "You got this! See you in a month 💪";
    if (days <= 60) return "Mastered! See you in 2 months 🏆";
    if (days <= 90) return "Locked in! See you in 3 months 🔒";
    return "Crushed it! See you in a few months 🚀";
};

/**
 * Get all MCQs due for review today (SRS scheduling)
 */
export const getDueMCQs = (allMCQs: SavedMCQ[]): SavedMCQ[] => {
    const now = Date.now();

    return allMCQs.filter(mcq => {
        // If never attempted, it's "new" - include in due
        if (!mcq.lastAttemptedAt) return true;

        // If has nextReviewAt, check if it's due
        if (mcq.srsNextReviewAt) {
            return mcq.srsNextReviewAt <= now;
        }

        // Fallback for legacy MCQs without SRS data: 
        // Consider due if attempted more than 1 day ago
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        return mcq.lastAttemptedAt < oneDayAgo;
    });
};

/**
 * Helper: Get questions from the user's weakest TOPIC (not just individual weak questions)
 * This ensures topic-level remediation, not just question-level.
 */
const getWeakestTopicQuestions = (
    allMCQs: SavedMCQ[],
    exclude: Set<string>,
    count: number
): { mcqs: SavedMCQ[]; weakestTopic: string | null } => {
    // 1. Group MCQs by topic and calculate accuracy
    const topicStats = new Map<string, { total: number; correct: number; mcqs: SavedMCQ[] }>();

    allMCQs.forEach(mcq => {
        const topic = mcq.topic || 'Unknown';
        if (!topicStats.has(topic)) {
            topicStats.set(topic, { total: 0, correct: 0, mcqs: [] });
        }
        const stats = topicStats.get(topic)!;
        stats.mcqs.push(mcq);
        if (mcq.timesAttempted > 0) {
            stats.total += mcq.timesAttempted;
            stats.correct += mcq.correctAttempts;
        }
    });

    // 2. Find topic with lowest accuracy (min 5 attempts to be statistically significant)
    let weakestTopic: string | null = null;
    let lowestAccuracy = 1;

    topicStats.forEach((stats, topic) => {
        if (stats.total >= 5) {
            const accuracy = stats.correct / stats.total;
            if (accuracy < lowestAccuracy && accuracy < 0.6) { // Only consider if <60%
                lowestAccuracy = accuracy;
                weakestTopic = topic;
            }
        }
    });

    if (!weakestTopic) return { mcqs: [], weakestTopic: null };

    // 3. Get questions from this topic not already selected
    const topicMCQs = topicStats.get(weakestTopic)?.mcqs || [];
    const available = topicMCQs.filter(m => !exclude.has(m.id));

    // Shuffle and return up to `count`
    const selected = available.sort(() => Math.random() - 0.5).slice(0, count);
    return { mcqs: selected, weakestTopic };
};

/**
 * Get MCQs for "Today's Practice" - the core SRS quiz
 * Combines: due items + weak items + topic-weak items + some new items
 */
export const getTodaysPractice = (
    allMCQs: SavedMCQ[],
    maxCount: number = 15
): { mcqs: SavedMCQ[]; dueCount: number; weakCount: number; topicWeakCount: number; newCount: number; weakestTopic: string | null } => {
    const now = Date.now();

    // 1. Get due MCQs (scheduled by SRS)
    const dueMCQs = allMCQs.filter(mcq => {
        if (mcq.srsNextReviewAt) {
            return mcq.srsNextReviewAt <= now;
        }
        // Legacy: attempted more than 1 day ago
        if (mcq.lastAttemptedAt) {
            const oneDayAgo = now - (24 * 60 * 60 * 1000);
            return mcq.lastAttemptedAt < oneDayAgo;
        }
        return false;
    });

    // 2. Get weak MCQs (low accuracy, regardless of schedule)
    const weakMCQs = allMCQs.filter(mcq => {
        if (mcq.timesAttempted < 2) return false;
        const accuracy = mcq.correctAttempts / mcq.timesAttempted;
        return accuracy < 0.5;
    }).filter(mcq => !dueMCQs.find(d => d.id === mcq.id)); // Exclude already due

    // 3. Get new MCQs (never attempted)
    const newMCQs = allMCQs.filter(mcq => !mcq.lastAttemptedAt);

    // Combine with priority: due first, then weak, then topic-weak, then new
    const combined: SavedMCQ[] = [];
    const seen = new Set<string>();

    // Add due (most important)
    dueMCQs.forEach(mcq => {
        if (!seen.has(mcq.id) && combined.length < maxCount) {
            combined.push(mcq);
            seen.add(mcq.id);
        }
    });

    const dueCount = combined.length;

    // Add weak (important for remediation)
    const shuffledWeak = [...weakMCQs].sort(() => Math.random() - 0.5);
    shuffledWeak.forEach(mcq => {
        if (!seen.has(mcq.id) && combined.length < maxCount) {
            combined.push(mcq);
            seen.add(mcq.id);
        }
    });

    const weakCount = combined.length - dueCount;

    // 4. Add questions from weakest TOPIC (topic-level drilling) - THE NEW PART
    const { mcqs: topicWeakMCQs, weakestTopic } = getWeakestTopicQuestions(allMCQs, seen, 3);
    topicWeakMCQs.forEach(mcq => {
        if (!seen.has(mcq.id) && combined.length < maxCount) {
            combined.push(mcq);
            seen.add(mcq.id);
        }
    });

    const topicWeakCount = combined.length - dueCount - weakCount;

    // Fill remaining with new questions
    const shuffledNew = [...newMCQs].sort(() => Math.random() - 0.5);
    shuffledNew.forEach(mcq => {
        if (!seen.has(mcq.id) && combined.length < maxCount) {
            combined.push(mcq);
            seen.add(mcq.id);
        }
    });

    const newCount = combined.length - dueCount - weakCount - topicWeakCount;

    const shuffled = getBalancedMCQSet(combined, maxCount, 0.3);

    return {
        mcqs: shuffled,
        dueCount,
        weakCount,
        topicWeakCount,
        newCount,
        weakestTopic
    };
};

/**
 * Get summary stats for dashboard display
 */
export const getSRSStats = (allMCQs: SavedMCQ[]): {
    dueToday: number;
    weakTopics: number;
    newQuestions: number;
    masteredQuestions: number;
} => {
    const now = Date.now();

    const dueToday = allMCQs.filter(mcq => {
        if (mcq.srsNextReviewAt) return mcq.srsNextReviewAt <= now;
        if (mcq.lastAttemptedAt) {
            const oneDayAgo = now - (24 * 60 * 60 * 1000);
            return mcq.lastAttemptedAt < oneDayAgo;
        }
        return false;
    }).length;

    const weakTopics = allMCQs.filter(mcq => {
        if (mcq.timesAttempted < 2) return false;
        return (mcq.correctAttempts / mcq.timesAttempted) < 0.5;
    }).length;

    const newQuestions = allMCQs.filter(mcq => !mcq.lastAttemptedAt).length;

    // Mastered = interval > 30 days
    const masteredQuestions = allMCQs.filter(mcq =>
        (mcq.srsInterval ?? 0) >= 30
    ).length;

    return { dueToday, weakTopics, newQuestions, masteredQuestions };
};

/**
 * Adjust SRS based on confidence rating
 * If user "guessed" and got it correct, treat it as wrong for SRS purposes
 * Returns updated SRS values to store
 */
export const adjustForConfidence = (
    wasCorrect: boolean,
    confidence: 'guessed' | 'somewhat' | 'certain',
    currentSRS: { interval: number; easeFactor: number; level: number; nextReviewAt: number }
): {
    shouldPenalize: boolean;
    newInterval: number;
    newEaseFactor: number;
    newLevel: number;
    newNextReviewAt: number;
    message: string;
} => {
    const now = Date.now();

    // If correct but guessed → treat as wrong (they don't really know it)
    if (wasCorrect && confidence === 'guessed') {
        return {
            shouldPenalize: true,
            newInterval: 1,
            newEaseFactor: Math.max(currentSRS.easeFactor - EASE_PENALTY, MIN_EASE_FACTOR),
            newLevel: 0,
            newNextReviewAt: now + (1 * 24 * 60 * 60 * 1000),
            message: "Lucky guess! Let's review tomorrow 🍀"
        };
    }

    // If correct but somewhat sure → slightly shorter interval
    if (wasCorrect && confidence === 'somewhat') {
        const adjustedInterval = Math.max(1, Math.round(currentSRS.interval * 0.7));
        return {
            shouldPenalize: false,
            newInterval: adjustedInterval,
            newEaseFactor: currentSRS.easeFactor, // No change
            newLevel: currentSRS.level,
            newNextReviewAt: now + (adjustedInterval * 24 * 60 * 60 * 1000),
            message: getFriendlyDuration(adjustedInterval)
        };
    }

    // Certain or wrong → no adjustment needed (already handled by main SRS)
    return {
        shouldPenalize: false,
        newInterval: currentSRS.interval,
        newEaseFactor: currentSRS.easeFactor,
        newLevel: currentSRS.level,
        newNextReviewAt: currentSRS.nextReviewAt,
        message: ''
    };
};

/**
 * Ghost Intelligence: Adjust SRS based on response hesitation time
 * 
 * If user takes too long to answer (even if correct), it indicates uncertainty.
 * We silently shorten the review interval to reinforce the learning.
 * 
 * Thresholds (invisible to user):
 * - < 5s: Quick recall, confident → no adjustment
 * - 5-15s: Some hesitation → slight interval reduction (85%)
 * - 15-30s: Significant hesitation → moderate reduction (70%)
 * - > 30s: Major uncertainty → aggressive reduction (50%)
 * 
 * This only applies to correct answers. Wrong answers already reset the SRS.
 */
export const adjustForHesitation = (
    wasCorrect: boolean,
    responseTimeMs: number,
    currentInterval: number
): {
    adjustedInterval: number;
    hesitationLevel: 'quick' | 'normal' | 'hesitant' | 'slow';
} => {
    // Only adjust for correct answers (wrong answers already penalized)
    if (!wasCorrect) {
        return {
            adjustedInterval: currentInterval,
            hesitationLevel: 'normal'
        };
    }

    const responseSeconds = responseTimeMs / 1000;

    // Quick recall (< 5s) - no adjustment needed
    if (responseSeconds < 5) {
        return {
            adjustedInterval: currentInterval,
            hesitationLevel: 'quick'
        };
    }

    // Normal thinking time (5-15s) - slight reduction
    if (responseSeconds < 15) {
        return {
            adjustedInterval: Math.max(1, Math.round(currentInterval * 0.85)),
            hesitationLevel: 'normal'
        };
    }

    // Significant hesitation (15-30s) - moderate reduction
    if (responseSeconds < 30) {
        return {
            adjustedInterval: Math.max(1, Math.round(currentInterval * 0.70)),
            hesitationLevel: 'hesitant'
        };
    }

    // Slow response (> 30s) - aggressive reduction
    return {
        adjustedInterval: Math.max(1, Math.round(currentInterval * 0.50)),
        hesitationLevel: 'slow'
    };
};
