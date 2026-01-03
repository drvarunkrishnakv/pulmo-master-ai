/**
 * Daily Goal Service
 * 
 * Tracks daily question goals and progress.
 * Data persists in localStorage.
 */

const DAILY_GOAL_KEY = 'pulmo_daily_goal';
const DAILY_PROGRESS_KEY = 'pulmo_daily_progress';

export interface DailyGoal {
    questionsTarget: number;  // e.g., 50 questions/day
    createdAt: number;
    isActive: boolean;
}

export interface DailyProgress {
    date: string;  // YYYY-MM-DD format
    questionsCompleted: number;
    correctAnswers: number;
    timeSpentMinutes: number;
    goalBonusClaimed?: boolean;  // Track if daily goal XP was awarded
}

/**
 * Get current daily goal
 */
export const getDailyGoal = (): DailyGoal => {
    try {
        const stored = localStorage.getItem(DAILY_GOAL_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('Error reading daily goal:', e);
    }
    // Default goal
    return {
        questionsTarget: 30,
        createdAt: Date.now(),
        isActive: true
    };
};

/**
 * Set daily goal
 */
export const setDailyGoal = (questionsTarget: number): void => {
    const goal: DailyGoal = {
        questionsTarget,
        createdAt: Date.now(),
        isActive: true
    };
    localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(goal));
};

/**
 * Get today's date string
 */
const getTodayString = (): string => {
    return new Date().toISOString().split('T')[0];
};

/**
 * Get today's progress
 */
export const getTodayProgress = (): DailyProgress => {
    try {
        const stored = localStorage.getItem(DAILY_PROGRESS_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            // Check if it's today's data
            if (data.date === getTodayString()) {
                return data;
            }
        }
    } catch (e) {
        console.error('Error reading daily progress:', e);
    }
    // Fresh day
    return {
        date: getTodayString(),
        questionsCompleted: 0,
        correctAnswers: 0,
        timeSpentMinutes: 0,
        goalBonusClaimed: false
    };
};

/**
 * Mark daily goal bonus as claimed
 */
export const markGoalBonusClaimed = (): void => {
    const progress = getTodayProgress();
    progress.goalBonusClaimed = true;
    localStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify(progress));
};

/**
 * Check if daily goal bonus was already claimed today
 */
export const wasGoalBonusClaimed = (): boolean => {
    const progress = getTodayProgress();
    return progress.goalBonusClaimed === true;
};

/**
 * Record a question attempt
 */
export const recordQuestionAttempt = (wasCorrect: boolean): DailyProgress => {
    const progress = getTodayProgress();

    // If it's a new day, reset
    if (progress.date !== getTodayString()) {
        progress.date = getTodayString();
        progress.questionsCompleted = 0;
        progress.correctAnswers = 0;
        progress.timeSpentMinutes = 0;
    }

    progress.questionsCompleted += 1;
    if (wasCorrect) {
        progress.correctAnswers += 1;
    }

    localStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify(progress));
    return progress;
};

/**
 * Get goal completion percentage
 */
export const getGoalCompletionPercent = (): number => {
    const goal = getDailyGoal();
    const progress = getTodayProgress();

    if (goal.questionsTarget <= 0) return 100;

    const percent = Math.round((progress.questionsCompleted / goal.questionsTarget) * 100);
    return Math.min(percent, 100);
};

/**
 * Check if daily goal is completed
 */
export const isGoalCompleted = (): boolean => {
    return getGoalCompletionPercent() >= 100;
};

/**
 * Get remaining questions to hit goal
 */
export const getRemainingQuestions = (): number => {
    const goal = getDailyGoal();
    const progress = getTodayProgress();

    return Math.max(0, goal.questionsTarget - progress.questionsCompleted);
};

/**
 * Get motivational message based on progress
 */
export const getGoalMessage = (): string => {
    const percent = getGoalCompletionPercent();
    const remaining = getRemainingQuestions();

    if (percent >= 100) {
        return "🎉 Daily goal crushed! You're on fire!";
    }
    if (percent >= 75) {
        return `Almost there! Just ${remaining} more to go! 💪`;
    }
    if (percent >= 50) {
        return `Halfway done! ${remaining} questions left 🎯`;
    }
    if (percent >= 25) {
        return `Good start! ${remaining} more to hit your goal`;
    }
    if (percent > 0) {
        return `Keep going! ${remaining} questions to reach your goal`;
    }
    return `Today's goal: ${getDailyGoal().questionsTarget} questions. Let's go! 🚀`;
};

/**
 * Get weekly stats
 */
export const getWeeklyStats = (): Array<{ date: string; completed: number }> => {
    // This would need a more sophisticated storage to track historical data
    // For now, just return today's progress
    const today = getTodayProgress();
    return [{ date: today.date, completed: today.questionsCompleted }];
};
