/**
 * Mistake Pattern Analysis Service
 * 
 * Analyzes user's wrong answer patterns to identify:
 * - Which wrong options they frequently pick
 * - Common confusion pairs (e.g., "picks B when A is correct")
 * - Time-based performance insights
 * 
 * PERFORMANCE: Uses in-memory caching to prevent expensive recomputations.
 */

import { SavedMCQ } from '../types';
import { getAllMCQs } from './mcqBankService';

// ============================================
// CACHING LAYER - Prevents performance delays
// ============================================
interface InsightsCache {
    mistakePatterns: MistakePatternStats | null;
    timeAnalysis: TimeAnalysisStats | null;
    timestamp: number;
}

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const insightsCache: InsightsCache = {
    mistakePatterns: null,
    timeAnalysis: null,
    timestamp: 0
};

function isInsightsCacheValid(): boolean {
    return Date.now() - insightsCache.timestamp < CACHE_DURATION_MS;
}

export function clearInsightsCache(): void {
    insightsCache.mistakePatterns = null;
    insightsCache.timeAnalysis = null;
    insightsCache.timestamp = 0;
}

export interface ConfusionPattern {
    correctOption: 'A' | 'B' | 'C' | 'D';
    wrongOption: 'A' | 'B' | 'C' | 'D';
    count: number;
    percentage: number;
    examples: { topic: string; question: string }[];
}

export interface TopicTimeStats {
    topic: string;
    avgTimeMs: number;
    avgTimeSeconds: number;
    totalAttempts: number;
    isSlowTopic: boolean; // > 30 seconds average
}

export interface MistakePatternStats {
    totalWrongAnswers: number;
    mostConfusedPairs: ConfusionPattern[];
    optionBias: { option: 'A' | 'B' | 'C' | 'D'; percentage: number }[];
}

export interface TimeAnalysisStats {
    overallAvgTimeMs: number;
    overallAvgTimeSeconds: number;
    slowestTopics: TopicTimeStats[];
    fastestTopics: TopicTimeStats[];
    totalQuestionsWithTime: number;
}

/**
 * Internal: Compute confusion patterns (expensive)
 */
function _computeMistakePatterns(): MistakePatternStats {
    const allMCQs = getAllMCQs();

    // Count confusion pairs: correctAnswer -> wrongOption
    const confusionCounts: Record<string, { count: number; examples: { topic: string; question: string }[] }> = {};
    const optionCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    let totalWrongAnswers = 0;

    for (const mcq of allMCQs) {
        if (!mcq.wrongOptionHistory || mcq.wrongOptionHistory.length === 0) continue;

        for (const wrongOption of mcq.wrongOptionHistory) {
            totalWrongAnswers++;
            optionCounts[wrongOption]++;

            const pairKey = `${mcq.correctAnswer}->${wrongOption}`;
            if (!confusionCounts[pairKey]) {
                confusionCounts[pairKey] = { count: 0, examples: [] };
            }
            confusionCounts[pairKey].count++;
            if (confusionCounts[pairKey].examples.length < 3) {
                confusionCounts[pairKey].examples.push({
                    topic: mcq.topic || mcq.sourceSection || 'Unknown',
                    question: mcq.question.slice(0, 80) + '...'
                });
            }
        }
    }

    // Convert to sorted array
    const mostConfusedPairs: ConfusionPattern[] = Object.entries(confusionCounts)
        .map(([key, data]) => {
            const [correct, wrong] = key.split('->') as ['A' | 'B' | 'C' | 'D', 'A' | 'B' | 'C' | 'D'];
            return {
                correctOption: correct,
                wrongOption: wrong,
                count: data.count,
                percentage: totalWrongAnswers > 0 ? Math.round((data.count / totalWrongAnswers) * 100) : 0,
                examples: data.examples
            };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5 patterns

    // Option bias
    const optionBias = (['A', 'B', 'C', 'D'] as const).map(opt => ({
        option: opt,
        percentage: totalWrongAnswers > 0 ? Math.round((optionCounts[opt] / totalWrongAnswers) * 100) : 0
    })).sort((a, b) => b.percentage - a.percentage);

    return {
        totalWrongAnswers,
        mostConfusedPairs,
        optionBias
    };
}

/**
 * Get common confusion patterns (CACHED)
 */
export function getMistakePatterns(): MistakePatternStats {
    if (isInsightsCacheValid() && insightsCache.mistakePatterns) {
        return insightsCache.mistakePatterns;
    }
    const patterns = _computeMistakePatterns();
    insightsCache.mistakePatterns = patterns;
    insightsCache.timestamp = Date.now();
    return patterns;
}

/**
 * Internal: Compute time analysis (expensive)
 */
function _computeTimeAnalysis(): TimeAnalysisStats {
    const allMCQs = getAllMCQs();

    // Aggregate by topic
    const topicTimes: Record<string, { totalMs: number; count: number }> = {};
    let overallTotalMs = 0;
    let overallCount = 0;

    for (const mcq of allMCQs) {
        if (!mcq.avgAnswerTimeMs || mcq.avgAnswerTimeMs <= 0) continue;

        const topic = mcq.topic || mcq.sourceSection || 'General';

        if (!topicTimes[topic]) {
            topicTimes[topic] = { totalMs: 0, count: 0 };
        }
        topicTimes[topic].totalMs += mcq.avgAnswerTimeMs;
        topicTimes[topic].count++;

        overallTotalMs += mcq.avgAnswerTimeMs;
        overallCount++;
    }

    // Convert to array with stats
    const topicStats: TopicTimeStats[] = Object.entries(topicTimes)
        .filter(([_, data]) => data.count >= 2) // At least 2 questions for meaningful average
        .map(([topic, data]) => {
            const avgTimeMs = data.totalMs / data.count;
            return {
                topic,
                avgTimeMs,
                avgTimeSeconds: Math.round(avgTimeMs / 1000),
                totalAttempts: data.count,
                isSlowTopic: avgTimeMs > 30000 // > 30 seconds
            };
        });

    // Sort for slowest/fastest
    const sorted = [...topicStats].sort((a, b) => b.avgTimeMs - a.avgTimeMs);

    return {
        overallAvgTimeMs: overallCount > 0 ? overallTotalMs / overallCount : 0,
        overallAvgTimeSeconds: overallCount > 0 ? Math.round((overallTotalMs / overallCount) / 1000) : 0,
        slowestTopics: sorted.slice(0, 5),
        fastestTopics: sorted.slice(-5).reverse(),
        totalQuestionsWithTime: overallCount
    };
}

/**
 * Get time-based analysis by topic (CACHED)
 */
export function getTimeAnalysis(): TimeAnalysisStats {
    if (isInsightsCacheValid() && insightsCache.timeAnalysis) {
        return insightsCache.timeAnalysis;
    }
    const stats = _computeTimeAnalysis();
    insightsCache.timeAnalysis = stats;
    // Don't update timestamp - let mistakePatterns control it
    return stats;
}

/**
 * Get a summary insight message for the user
 */
export function getInsightMessage(): string {
    const patterns = getMistakePatterns();
    const timeStats = getTimeAnalysis();

    const insights: string[] = [];

    // Confusion insight
    if (patterns.mostConfusedPairs.length > 0) {
        const top = patterns.mostConfusedPairs[0];
        insights.push(`You often pick "${top.wrongOption}" when the answer is "${top.correctOption}" (${top.count} times)`);
    }

    // Time insight
    if (timeStats.slowestTopics.length > 0) {
        const slowest = timeStats.slowestTopics[0];
        insights.push(`${slowest.topic} takes you ~${slowest.avgTimeSeconds}s per question`);
    }

    // Option bias insight
    if (patterns.optionBias.length > 0 && patterns.optionBias[0].percentage > 35) {
        insights.push(`You tend to pick "${patterns.optionBias[0].option}" when wrong (${patterns.optionBias[0].percentage}%)`);
    }

    return insights.length > 0 ? insights[0] : 'Keep practicing to reveal patterns!';
}

/**
 * Format time for display
 */
export function formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}
