/**
 * Fatigue Detection Service
 * 
 * Invisible monitoring of user performance to detect fatigue:
 * - Tracks rolling accuracy over recent questions
 * - Detects accuracy decline patterns
 * - Suggests breaks when performance drops
 * 
 * All detection is invisible - only Rio's gentle nudges are visible.
 */

// Session tracking
interface SessionStats {
    questionCount: number;
    recentResults: boolean[];  // Last N results (true = correct)
    sessionStartTime: number;
    lastActivityTime: number;
    breakSuggested: boolean;
}

const SESSION_KEY = 'pulmo_current_session';
const ROLLING_WINDOW = 5;  // Check last 5 questions
const FATIGUE_THRESHOLD = 0.4;  // Below 40% in rolling window = fatigue
const MIN_QUESTIONS_BEFORE_CHECK = 10;  // Don't check too early
const BREAK_COOLDOWN_MS = 15 * 60 * 1000;  // Don't suggest breaks more than every 15 min

// Debug logging
const DEBUG = () => localStorage.getItem('debug_intelligence') === 'true';
const log = (msg: string, ...args: any[]) => {
    if (DEBUG()) console.log(`😴 [FatigueDetector] ${msg}`, ...args);
};

/**
 * Get current session stats
 */
function getSessionStats(): SessionStats {
    try {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) { }

    return {
        questionCount: 0,
        recentResults: [],
        sessionStartTime: Date.now(),
        lastActivityTime: Date.now(),
        breakSuggested: false
    };
}

/**
 * Save session stats
 */
function saveSessionStats(stats: SessionStats): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stats));
}

/**
 * Record a question result and check for fatigue
 * Returns fatigue status
 */
export function recordQuestionResult(correct: boolean): {
    isFatigued: boolean;
    rollingAccuracy: number;
    sessionLength: number;
    shouldSuggestBreak: boolean;
    message?: string;
} {
    const stats = getSessionStats();

    // Update stats
    stats.questionCount++;
    stats.recentResults.push(correct);
    stats.lastActivityTime = Date.now();

    // Keep only rolling window
    if (stats.recentResults.length > ROLLING_WINDOW) {
        stats.recentResults.shift();
    }

    // Calculate rolling accuracy
    const rollingCorrect = stats.recentResults.filter(r => r).length;
    const rollingAccuracy = stats.recentResults.length > 0
        ? rollingCorrect / stats.recentResults.length
        : 1;

    // Session length in minutes
    const sessionLength = Math.floor((Date.now() - stats.sessionStartTime) / 60000);

    // Check for fatigue
    const isFatigued =
        stats.questionCount >= MIN_QUESTIONS_BEFORE_CHECK &&
        stats.recentResults.length >= ROLLING_WINDOW &&
        rollingAccuracy < FATIGUE_THRESHOLD;

    // Should we suggest a break?
    const timeSinceLastBreakSuggestion = stats.breakSuggested
        ? Date.now() - stats.lastActivityTime
        : Infinity;

    const shouldSuggestBreak =
        isFatigued &&
        !stats.breakSuggested &&
        timeSinceLastBreakSuggestion > BREAK_COOLDOWN_MS;

    let message: string | undefined;

    if (shouldSuggestBreak) {
        stats.breakSuggested = true;

        // Choose a gentle message
        const messages = [
            "Noticing a dip? A 5-minute break works wonders! 🧘",
            "You've been at it for a while. Quick stretch? 💪",
            "Even champions rest! Take 5? ☕",
            "Your brain needs a breather! Back in 5? 🌟"
        ];
        message = messages[Math.floor(Math.random() * messages.length)];

        log(`Fatigue detected! Rolling: ${Math.round(rollingAccuracy * 100)}%, Session: ${sessionLength}min`);
    }

    saveSessionStats(stats);

    log(`Q${stats.questionCount}: ${correct ? '✓' : '✗'} | Rolling: ${Math.round(rollingAccuracy * 100)}% | Fatigued: ${isFatigued}`);

    return {
        isFatigued,
        rollingAccuracy,
        sessionLength,
        shouldSuggestBreak,
        message
    };
}

/**
 * Reset break suggestion (after user takes suggested break or ignores)
 */
export function resetBreakSuggestion(): void {
    const stats = getSessionStats();
    stats.breakSuggested = false;
    saveSessionStats(stats);
    log('Break suggestion reset');
}

/**
 * Start a new session (e.g., when starting a quiz)
 */
export function startNewSession(): void {
    sessionStorage.removeItem(SESSION_KEY);
    log('New session started');
}

/**
 * Get session summary
 */
export function getSessionSummary(): {
    totalQuestions: number;
    sessionMinutes: number;
    overallAccuracy: number;
} {
    const stats = getSessionStats();
    const correctCount = stats.recentResults.filter(r => r).length;

    return {
        totalQuestions: stats.questionCount,
        sessionMinutes: Math.floor((Date.now() - stats.sessionStartTime) / 60000),
        overallAccuracy: stats.recentResults.length > 0
            ? correctCount / stats.recentResults.length
            : 0
    };
}

/**
 * Check if currently fatigued (without recording a result)
 */
export function checkFatigueStatus(): {
    isFatigued: boolean;
    questionsUntilCheck: number;
} {
    const stats = getSessionStats();

    const questionsUntilCheck = Math.max(0, MIN_QUESTIONS_BEFORE_CHECK - stats.questionCount);

    if (questionsUntilCheck > 0 || stats.recentResults.length < ROLLING_WINDOW) {
        return { isFatigued: false, questionsUntilCheck };
    }

    const rollingCorrect = stats.recentResults.filter(r => r).length;
    const rollingAccuracy = rollingCorrect / stats.recentResults.length;

    return {
        isFatigued: rollingAccuracy < FATIGUE_THRESHOLD,
        questionsUntilCheck: 0
    };
}
