/**
 * Weak Spot Detection Service
 * 
 * Analyzes user performance to identify topics that need more practice.
 * Uses accuracy thresholds to detect and prioritize weak areas.
 */

import { getAllMCQs } from './mcqBankService';

const WEAK_SPOT_THRESHOLD = 0.6; // Topics below 60% accuracy are "weak"
const MIN_ATTEMPTS_FOR_DETECTION = 3; // Need at least 3 attempts to classify

export interface WeakSpot {
    topic: string;
    subTopic?: string;
    accuracy: number;
    totalAttempts: number;
    correctAttempts: number;
    priority: number; // Higher = more urgent to address
    lastAttemptedAt: number;
}

export interface TopicPerformance {
    topic: string;
    subTopics: Map<string, { correct: number; total: number; lastAttemptedAt: number }>;
    overallAccuracy: number;
    totalAttempts: number;
}

/**
 * Get performance data by topic and subtopic
 */
export const getPerformanceByTopic = (): Map<string, TopicPerformance> => {
    const allMCQs = getAllMCQs();
    const performanceMap = new Map<string, TopicPerformance>();

    allMCQs.forEach(mcq => {
        if (mcq.timesAttempted === 0) return;

        const topic = mcq.topic;
        const subTopic = mcq.subTopicName || 'General';

        // Get or create topic entry
        let topicPerf = performanceMap.get(topic);
        if (!topicPerf) {
            topicPerf = {
                topic,
                subTopics: new Map(),
                overallAccuracy: 0,
                totalAttempts: 0
            };
            performanceMap.set(topic, topicPerf);
        }

        // Update topic totals
        topicPerf.totalAttempts += mcq.timesAttempted;

        // Get or create subtopic entry
        let subTopicData = topicPerf.subTopics.get(subTopic);
        if (!subTopicData) {
            subTopicData = { correct: 0, total: 0, lastAttemptedAt: 0 };
            topicPerf.subTopics.set(subTopic, subTopicData);
        }

        subTopicData.correct += mcq.correctAttempts;
        subTopicData.total += mcq.timesAttempted;
        subTopicData.lastAttemptedAt = Math.max(subTopicData.lastAttemptedAt, mcq.lastAttemptedAt || 0);
    });

    // Calculate overall accuracy for each topic
    performanceMap.forEach(topicPerf => {
        let totalCorrect = 0;
        let totalAttempts = 0;

        topicPerf.subTopics.forEach(subData => {
            totalCorrect += subData.correct;
            totalAttempts += subData.total;
        });

        topicPerf.overallAccuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
    });

    return performanceMap;
};

/**
 * Detect weak spots - topics or subtopics with low accuracy
 */
export const detectWeakSpots = (): WeakSpot[] => {
    const performanceMap = getPerformanceByTopic();
    const weakSpots: WeakSpot[] = [];

    performanceMap.forEach(topicPerf => {
        // Check each subtopic
        topicPerf.subTopics.forEach((subData, subTopic) => {
            if (subData.total < MIN_ATTEMPTS_FOR_DETECTION) return;

            const accuracy = subData.correct / subData.total;

            if (accuracy < WEAK_SPOT_THRESHOLD) {
                // Calculate priority: lower accuracy + more recent = higher priority
                const recencyBonus = (Date.now() - subData.lastAttemptedAt) < 7 * 24 * 60 * 60 * 1000 ? 0.2 : 0;
                const priority = (1 - accuracy) + recencyBonus;

                weakSpots.push({
                    topic: topicPerf.topic,
                    subTopic: subTopic !== 'General' ? subTopic : undefined,
                    accuracy,
                    totalAttempts: subData.total,
                    correctAttempts: subData.correct,
                    priority,
                    lastAttemptedAt: subData.lastAttemptedAt
                });
            }
        });
    });

    // Sort by priority (highest first)
    weakSpots.sort((a, b) => b.priority - a.priority);

    return weakSpots;
};

/**
 * Get top N weak spots
 */
export const getTopWeakSpots = (n: number = 3): WeakSpot[] => {
    return detectWeakSpots().slice(0, n);
};

/**
 * Check if a specific topic is a weak spot
 */
export const isWeakSpot = (topic: string, subTopic?: string): boolean => {
    const weakSpots = detectWeakSpots();
    return weakSpots.some(ws =>
        ws.topic === topic &&
        (subTopic ? ws.subTopic === subTopic : true)
    );
};

/**
 * Get weak spot weight for question selection
 * Returns multiplier (2x for weak spots, 1x for normal)
 */
export const getWeakSpotWeight = (topic: string, subTopic?: string): number => {
    const weakSpots = detectWeakSpots();
    const match = weakSpots.find(ws =>
        ws.topic === topic &&
        (subTopic ? ws.subTopic === subTopic : true)
    );

    if (!match) return 1;

    // Higher priority weak spots get higher weight
    return 1 + match.priority;
};

/**
 * Get summary of user's weak areas for display
 */
export const getWeakSpotSummary = (): {
    totalWeakSpots: number;
    topicsList: string[];
    worstAccuracy: number;
    message: string;
} => {
    const weakSpots = detectWeakSpots();

    if (weakSpots.length === 0) {
        return {
            totalWeakSpots: 0,
            topicsList: [],
            worstAccuracy: 1,
            message: "No weak spots detected! Keep up the great work! 🎯"
        };
    }

    const topicsList = [...new Set(weakSpots.map(ws => ws.topic))];
    const worstAccuracy = Math.min(...weakSpots.map(ws => ws.accuracy));

    const topWeakSpot = weakSpots[0];
    const message = `Focus on ${topWeakSpot.subTopic || topWeakSpot.topic} (${Math.round(topWeakSpot.accuracy * 100)}% accuracy)`;

    return {
        totalWeakSpots: weakSpots.length,
        topicsList,
        worstAccuracy,
        message
    };
};
