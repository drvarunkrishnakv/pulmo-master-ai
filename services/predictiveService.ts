/**
 * Predictive Pre-loading Service
 * 
 * Analyzes user's study patterns to predict next likely session:
 * - Tracks topic progression patterns
 * - Identifies frequently studied topics by day/time
 * - Pre-loads likely next session content
 * 
 * All predictions are invisible - just faster app experience.
 * Enable debug: localStorage.setItem('debug_intelligence', 'true')
 */

import { getAllMCQs } from './mcqBankService';
import { SavedMCQ } from '../types';

// Debug logging
const DEBUG = () => localStorage.getItem('debug_intelligence') === 'true';
const log = (msg: string, ...args: any[]) => {
    if (DEBUG()) console.log(`🔮 [Predictor] ${msg}`, ...args);
};

// Storage key
const PATTERN_KEY = 'pulmo_study_patterns';

interface TopicSession {
    topic: string;
    timestamp: number;
    dayOfWeek: number;  // 0-6 (Sunday-Saturday)
    hourOfDay: number;  // 0-23
    questionCount: number;
}

interface StudyPatterns {
    recentSessions: TopicSession[];  // Last 50 sessions
    topicFrequency: Record<string, number>;  // Topic -> count
    dayPreferences: Record<number, string[]>;  // Day -> top topics
    lastUpdated: number;
}

/**
 * Get study patterns
 */
function getStudyPatterns(): StudyPatterns {
    try {
        const stored = localStorage.getItem(PATTERN_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) { }

    return {
        recentSessions: [],
        topicFrequency: {},
        dayPreferences: {},
        lastUpdated: Date.now()
    };
}

/**
 * Save study patterns
 */
function saveStudyPatterns(patterns: StudyPatterns): void {
    localStorage.setItem(PATTERN_KEY, JSON.stringify(patterns));
}

/**
 * Record a study session for pattern analysis
 */
export function recordStudySession(topic: string, questionCount: number): void {
    const now = new Date();
    const patterns = getStudyPatterns();

    // Add new session
    const session: TopicSession = {
        topic,
        timestamp: now.getTime(),
        dayOfWeek: now.getDay(),
        hourOfDay: now.getHours(),
        questionCount
    };

    patterns.recentSessions.push(session);

    // Keep only last 50 sessions
    if (patterns.recentSessions.length > 50) {
        patterns.recentSessions.shift();
    }

    // Update topic frequency
    patterns.topicFrequency[topic] = (patterns.topicFrequency[topic] || 0) + 1;

    // Update day preferences
    const day = now.getDay();
    if (!patterns.dayPreferences[day]) {
        patterns.dayPreferences[day] = [];
    }
    if (!patterns.dayPreferences[day].includes(topic)) {
        patterns.dayPreferences[day].push(topic);
    }

    patterns.lastUpdated = Date.now();
    saveStudyPatterns(patterns);

    log(`Recorded session: ${topic} (${questionCount} questions) on day ${day} at hour ${now.getHours()}`);
}

/**
 * Predict next likely topic based on patterns
 */
export function predictNextTopic(): {
    topic: string | null;
    confidence: number;  // 0-1
    reason: string;
} {
    const patterns = getStudyPatterns();

    if (patterns.recentSessions.length < 5) {
        return { topic: null, confidence: 0, reason: 'Not enough data' };
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    // Strategy 1: Check day-of-week preference
    const dayTopics = patterns.dayPreferences[currentDay] || [];

    // Strategy 2: Check recent topic sequence
    const recentTopics = patterns.recentSessions
        .slice(-5)
        .map(s => s.topic);

    // Strategy 3: Most frequently studied topics
    const frequencyRanked = Object.entries(patterns.topicFrequency)
        .sort(([, a], [, b]) => b - a)
        .map(([topic]) => topic);

    // Combine strategies with weights
    const topicScores: Record<string, number> = {};

    // Day preference (weight: 0.3)
    dayTopics.forEach((topic, idx) => {
        topicScores[topic] = (topicScores[topic] || 0) + (1 - idx * 0.1) * 0.3;
    });

    // Recent sequence continuation (weight: 0.4)
    // If user recently did TB Diagnosis, likely to do TB Treatment next
    const lastTopic = recentTopics[recentTopics.length - 1];
    const nextInSequence = getNextInSequence(lastTopic);
    if (nextInSequence) {
        topicScores[nextInSequence] = (topicScores[nextInSequence] || 0) + 0.4;
    }

    // Frequency (weight: 0.3) - but penalize if just studied
    frequencyRanked.slice(0, 5).forEach((topic, idx) => {
        if (!recentTopics.includes(topic)) {  // Not just studied
            topicScores[topic] = (topicScores[topic] || 0) + (1 - idx * 0.15) * 0.3;
        }
    });

    // Find top scoring topic
    const sorted = Object.entries(topicScores)
        .sort(([, a], [, b]) => b - a);

    if (sorted.length === 0) {
        return { topic: null, confidence: 0, reason: 'No patterns detected' };
    }

    const [predictedTopic, score] = sorted[0];
    const confidence = Math.min(score, 1);

    let reason = 'Based on your study patterns';
    if (nextInSequence === predictedTopic) {
        reason = `Continuing from ${lastTopic}`;
    } else if (dayTopics.includes(predictedTopic)) {
        reason = `You often study this on ${getDayName(currentDay)}s`;
    }

    log(`Predicted: ${predictedTopic} (confidence: ${Math.round(confidence * 100)}%, reason: ${reason})`);

    return { topic: predictedTopic, confidence, reason };
}

/**
 * Get next topic in typical study sequence
 */
function getNextInSequence(currentTopic: string): string | null {
    // Common study progressions
    const sequences: Record<string, string> = {
        // TB sequence
        'tb_pathogenesis': 'tb_diagnosis',
        'tb_diagnosis': 'tb_treatment',
        'tb_treatment': 'tb_drtb',

        // COPD sequence
        'copd_diagnosis': 'copd_management',

        // Asthma sequence
        'asthma_pathophys': 'asthma_diagnosis',
        'asthma_diagnosis': 'asthma_management',
        'asthma_management': 'asthma_severe',

        // PH sequence
        'ph_classification': 'ph_diagnosis',
        'ph_diagnosis': 'ph_treatment',

        // Lung cancer sequence
        'lung_cancer_epi': 'lung_cancer_histo',
        'lung_cancer_histo': 'lung_cancer_staging',
        'lung_cancer_staging': 'lung_cancer_mutations',
        'lung_cancer_mutations': 'lung_cancer_chemo',

        // ARDS sequence
        'ards_definition': 'ards_pathophys',
        'ards_pathophys': 'ards_ventilation',
        'ards_ventilation': 'ards_prone',

        // Sleep sequence
        'osa_diagnosis': 'osa_treatment',

        // PE sequence
        'pe_diagnosis': 'pe_treatment',

        // PFT sequence
        'spirometry': 'lung_volumes',
        'lung_volumes': 'dlco',
    };

    return sequences[currentTopic] || null;
}

/**
 * Get day name
 */
function getDayName(day: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day];
}

/**
 * Get MCQs for predicted topic
 */
export function getPredictedTopicMCQs(count: number = 15): {
    mcqs: SavedMCQ[];
    topic: string | null;
    reason: string;
} {
    const prediction = predictNextTopic();

    if (!prediction.topic || prediction.confidence < 0.3) {
        return { mcqs: [], topic: null, reason: 'Low confidence prediction' };
    }

    const allMCQs = getAllMCQs();
    const topicMCQs = allMCQs.filter(m => m.topic === prediction.topic);

    // Prioritize: unattempted > wrong > due
    const prioritized = topicMCQs.sort((a, b) => {
        // Unattempted first
        if (a.timesAttempted === 0 && b.timesAttempted > 0) return -1;
        if (b.timesAttempted === 0 && a.timesAttempted > 0) return 1;

        // Wrong answers next
        const aWrong = a.correctAttempts < a.timesAttempted;
        const bWrong = b.correctAttempts < b.timesAttempted;
        if (aWrong && !bWrong) return -1;
        if (bWrong && !aWrong) return 1;

        // Due for review
        const now = Date.now();
        const aDue = a.srsNextReviewAt && a.srsNextReviewAt <= now;
        const bDue = b.srsNextReviewAt && b.srsNextReviewAt <= now;
        if (aDue && !bDue) return -1;
        if (bDue && !aDue) return 1;

        return 0;
    });

    const selected = prioritized.slice(0, count);

    log(`Prepared ${selected.length} MCQs for predicted topic: ${prediction.topic}`);

    return {
        mcqs: selected,
        topic: prediction.topic,
        reason: prediction.reason
    };
}

/**
 * Get study pattern insights for display
 */
export function getPatternInsights(): {
    favoriteTopics: string[];
    studyDays: string[];
    sessionsThisWeek: number;
    averageSessionLength: number;
} {
    const patterns = getStudyPatterns();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Sessions this week
    const weekSessions = patterns.recentSessions.filter(s => s.timestamp > weekAgo);

    // Favorite topics
    const favoriteTopics = Object.entries(patterns.topicFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([topic]) => topic);

    // Study days
    const studyDays = Object.entries(patterns.dayPreferences)
        .filter(([, topics]) => topics.length > 0)
        .map(([day]) => getDayName(parseInt(day)));

    // Average session length
    const avgLength = weekSessions.length > 0
        ? Math.round(weekSessions.reduce((sum, s) => sum + s.questionCount, 0) / weekSessions.length)
        : 0;

    return {
        favoriteTopics,
        studyDays,
        sessionsThisWeek: weekSessions.length,
        averageSessionLength: avgLength
    };
}

/**
 * Get prediction status for debugging
 */
export function getPredictionStatus(): {
    totalSessions: number;
    prediction: { topic: string | null; confidence: number; reason: string };
    recentTopics: string[];
    hasEnoughData: boolean;
} {
    const patterns = getStudyPatterns();
    const prediction = predictNextTopic();

    return {
        totalSessions: patterns.recentSessions.length,
        prediction,
        recentTopics: patterns.recentSessions.slice(-5).map(s => s.topic),
        hasEnoughData: patterns.recentSessions.length >= 5
    };
}
