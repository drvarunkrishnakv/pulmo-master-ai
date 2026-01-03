/**
 * Streak and Exam Countdown Service
 * Tracks daily practice streaks and exam countdown
 */

const STREAK_KEY = 'pulmo_streak_data';
const EXAM_KEY = 'pulmo_exam_settings';

export interface StreakData {
    currentStreak: number;
    longestStreak: number;
    lastPracticeDate: string; // YYYY-MM-DD format
    totalDaysPracticed: number;
}

export interface ExamSettings {
    examDate: string; // YYYY-MM-DD format
    examType: 'NEET-SS' | 'INI-SS';
}

/**
 * Get streak data from localStorage
 */
export const getStreakData = (): StreakData => {
    try {
        const stored = localStorage.getItem(STREAK_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) { }
    return {
        currentStreak: 0,
        longestStreak: 0,
        lastPracticeDate: '',
        totalDaysPracticed: 0
    };
};

/**
 * Save streak data to localStorage
 */
const saveStreakData = (data: StreakData): void => {
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
};

/**
 * Get today's date in YYYY-MM-DD format
 */
const getTodayString = (): string => {
    return new Date().toISOString().split('T')[0];
};

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
const getYesterdayString = (): string => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
};

/**
 * Record that the user practiced today
 * Updates streak accordingly
 */
export const recordPractice = (): StreakData => {
    const data = getStreakData();
    const today = getTodayString();
    const yesterday = getYesterdayString();

    // Already practiced today
    if (data.lastPracticeDate === today) {
        return data;
    }

    // Practiced yesterday - continue streak
    if (data.lastPracticeDate === yesterday) {
        data.currentStreak += 1;
    }
    // Missed a day - reset streak
    else if (data.lastPracticeDate !== today) {
        data.currentStreak = 1;
    }

    // Update longest streak
    if (data.currentStreak > data.longestStreak) {
        data.longestStreak = data.currentStreak;
    }

    data.lastPracticeDate = today;
    data.totalDaysPracticed += 1;

    saveStreakData(data);
    return data;
};

/**
 * Check if user practiced today
 */
export const hasPracticedToday = (): boolean => {
    const data = getStreakData();
    return data.lastPracticeDate === getTodayString();
};

/**
 * Check streak status and return current streak
 * Updates streak if it's broken (missed days)
 */
export const checkStreakStatus = (): StreakData => {
    const data = getStreakData();
    const today = getTodayString();
    const yesterday = getYesterdayString();

    // If last practice was before yesterday, streak is broken
    if (data.lastPracticeDate &&
        data.lastPracticeDate !== today &&
        data.lastPracticeDate !== yesterday) {
        data.currentStreak = 0;
        saveStreakData(data);
    }

    return data;
};

// ===== Exam Countdown =====

/**
 * Get exam settings from localStorage
 */
export const getExamSettings = (): ExamSettings | null => {
    try {
        const stored = localStorage.getItem(EXAM_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) { }
    return null;
};

/**
 * Save exam settings to localStorage
 */
export const saveExamSettings = (settings: ExamSettings): void => {
    localStorage.setItem(EXAM_KEY, JSON.stringify(settings));
};

/**
 * Calculate days until exam
 */
export const getDaysUntilExam = (): number | null => {
    const settings = getExamSettings();
    if (!settings) return null;

    const examDate = new Date(settings.examDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    examDate.setHours(0, 0, 0, 0);

    const diffTime = examDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
};

/**
 * Get exam countdown message
 */
export const getExamCountdownMessage = (): string | null => {
    const settings = getExamSettings();
    const days = getDaysUntilExam();

    if (!settings || days === null) return null;

    if (days < 0) return "Exam date has passed";
    if (days === 0) return "🚨 Exam is TODAY!";
    if (days === 1) return "⚡ Exam is TOMORROW!";
    if (days <= 7) return `🔥 ${days} days to ${settings.examType}!`;
    if (days <= 30) return `${days} days to ${settings.examType}`;
    if (days <= 90) return `${Math.round(days / 7)} weeks to ${settings.examType}`;
    return `${Math.round(days / 30)} months to ${settings.examType}`;
};

/**
 * Request notification permission
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;

    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
};

/**
 * Show a reminder notification
 */
export const showStreakReminder = (): void => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const data = getStreakData();

    if (!hasPracticedToday() && data.currentStreak > 0) {
        new Notification('🔥 Keep Your Streak Alive!', {
            body: `You have a ${data.currentStreak}-day streak. Don't break it!`,
            icon: '🎯',
            tag: 'streak-reminder'
        });
    }
};
