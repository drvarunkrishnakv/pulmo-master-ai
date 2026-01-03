/**
 * Gamification Service
 * 
 * Manages XP, Coins, Levels, Streak Multipliers, and Powerups.
 * Data persists in localStorage (offline-first).
 */

import { getStreakData } from './streakService';

const GAMIFICATION_KEY = 'pulmo_gamification';

// ===== Types =====

export interface GamificationData {
    // XP System
    totalXP: number;
    currentLevel: number;

    // Coins
    coins: number;
    totalCoinsEarned: number;

    // Powerups
    streakFreezes: number;
    activeStreakFreeze: boolean;
    streakFreezeUsedDate: string | null;
    hintsRemaining: number;
    xpBoostRemaining: number;

    // Session Stats
    sessionCorrectStreak: number;
    longestSessionStreak: number;

    // Timestamps
    lastXPEarnedAt: number;
    lastCoinDropAt: number;
}

export interface XPGain {
    baseXP: number;
    bonusXP: number;
    multiplier: number;
    totalXP: number;
    reason: string;
}

export interface LevelInfo {
    level: number;
    title: string;
    icon: string;
    xpForCurrentLevel: number;
    xpForNextLevel: number;
    progress: number; // 0-100
}

// ===== Constants =====

const LEVEL_THRESHOLDS = [
    0, 100, 250, 450, 700,           // 1-5: Medical Student
    1000, 1400, 1900, 2500, 3200,    // 6-10: Intern
    4000, 5000, 6200, 7600, 9200,    // 11-15: Resident
    11000, 13000, 15500, 18500, 22000, // 16-20: Resident
    26000, 30500, 35500, 41000, 47000, // 21-25: Pulmonologist
    54000, 62000, 71000, 81000, 92000, // 26-30: Pulmonologist
    104000, 117000, 131000, 146000, 162000, // 31-35: Pulmonologist
    180000, 200000, 222000, 246000, 272000, // 36-40: Professor
    300000, 330000, 362000, 396000, 432000, // 41-45: Professor
    470000, 510000, 552000, 596000, 642000, // 46-50: Professor
];

const LEVEL_TITLES: { [key: number]: { title: string; icon: string } } = {
    1: { title: 'Medical Student', icon: '🩺' },
    6: { title: 'Intern', icon: '👨‍⚕️' },
    11: { title: 'Resident', icon: '🏥' },
    21: { title: 'Pulmonologist', icon: '🔬' },
    36: { title: 'Professor', icon: '🎓' },
};

// XP Values (reduced to account for multiple XP sources)
const XP = {
    CORRECT: 5,              // Was 10
    WRONG_PENALTY: -2,       // Was -3
    FIRST_TRY_BONUS: 2,      // Was 5
    HARD_QUESTION_BONUS: 3,  // Was 10
    STREAK_3_BONUS: 5,       // Was 15
    STREAK_5_BONUS: 10,      // Was 30
    STREAK_10_BONUS: 25,     // Was 75
    DAILY_GOAL_BONUS: 20,    // Was 50
    PERFECT_QUIZ_BONUS: 40,  // Was 100
    // Habit XP
    HABIT_COMPLETE: 3,       // Per habit checked
    ALL_HABITS_BONUS: 10,    // All habits complete for the day
};

// Streak Multipliers
const STREAK_MULTIPLIERS: { [key: number]: number } = {
    0: 1.0,
    1: 1.0,
    2: 1.0,
    3: 1.2,
    7: 1.5,
    14: 1.75,
    30: 2.0,
};

// Gem Values (reduced)
const COINS = {
    DROP_CHANCE: 0.05, // 5%
    DROP_MIN: 3,       // Was 5
    DROP_MAX: 10,      // Was 15
    PERFECT_QUIZ: 15,  // Was 25
    MILESTONE: 30,     // Was 50
    STREAK_7: 50,      // Was 100
    LEVEL_UP: 15,      // Was 20
    HABIT_STREAK_7: 25, // 7-day all habits complete streak
};

// Shop Prices (adjusted for reduced economy)
export const SHOP_PRICES = {
    STREAK_FREEZE: 30,   // Was 50
    HINTS_3: 20,         // Was 30
    XP_BOOST_10: 60,     // Was 100
};

// ===== Data Management =====

export const getGamificationData = (): GamificationData => {
    try {
        const stored = localStorage.getItem(GAMIFICATION_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('Error reading gamification data:', e);
    }
    return {
        totalXP: 0,
        currentLevel: 1,
        coins: 0,
        totalCoinsEarned: 0,
        streakFreezes: 0,
        activeStreakFreeze: false,
        streakFreezeUsedDate: null,
        hintsRemaining: 0,
        xpBoostRemaining: 0,
        sessionCorrectStreak: 0,
        longestSessionStreak: 0,
        lastXPEarnedAt: 0,
        lastCoinDropAt: 0,
    };
};

const saveGamificationData = (data: GamificationData): void => {
    try {
        localStorage.setItem(GAMIFICATION_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving gamification data:', e);
    }
};

// ===== Streak Multiplier =====

export const getStreakMultiplier = (): number => {
    const streakData = getStreakData();
    const streak = streakData.currentStreak;

    let multiplier = 1.0;
    for (const [threshold, mult] of Object.entries(STREAK_MULTIPLIERS)) {
        if (streak >= parseInt(threshold)) {
            multiplier = mult;
        }
    }
    return multiplier;
};

// ===== Level System =====

const calculateLevel = (totalXP: number): number => {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (totalXP >= LEVEL_THRESHOLDS[i]) {
            return i + 1;
        }
    }
    return 1;
};

export const getLevelInfo = (): LevelInfo => {
    const data = getGamificationData();
    const level = calculateLevel(data.totalXP);

    // Find title for this level
    let title = 'Medical Student';
    let icon = '🩺';
    for (const [lvl, info] of Object.entries(LEVEL_TITLES)) {
        if (level >= parseInt(lvl)) {
            title = info.title;
            icon = info.icon;
        }
    }

    const xpForCurrentLevel = LEVEL_THRESHOLDS[level - 1] || 0;
    const xpForNextLevel = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const xpInLevel = data.totalXP - xpForCurrentLevel;
    const xpNeeded = xpForNextLevel - xpForCurrentLevel;
    const progress = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));

    return {
        level,
        title,
        icon,
        xpForCurrentLevel,
        xpForNextLevel,
        progress,
    };
};

// ===== XP System =====

export interface XPResult {
    xpGained: XPGain;
    leveledUp: boolean;
    newLevel: number;
    coinsDrop: number;
    newSessionStreak: number;
}

export const awardXP = (
    isCorrect: boolean,
    isFirstTry: boolean = false,
    isHardQuestion: boolean = false,
    questionCount: number = 1
): XPResult => {
    const data = getGamificationData();
    const oldLevel = calculateLevel(data.totalXP);
    const multiplier = getStreakMultiplier();
    const hasXPBoost = data.xpBoostRemaining > 0;
    const effectiveMultiplier = hasXPBoost ? multiplier * 2 : multiplier;

    let baseXP = 0;
    let bonusXP = 0;
    let reason = '';

    if (isCorrect) {
        baseXP = XP.CORRECT;
        reason = 'Correct answer';

        // First try bonus
        if (isFirstTry) {
            bonusXP += XP.FIRST_TRY_BONUS;
            reason += ' + First try';
        }

        // Hard question bonus
        if (isHardQuestion) {
            bonusXP += XP.HARD_QUESTION_BONUS;
            reason += ' + Hard Q';
        }

        // Update session streak
        data.sessionCorrectStreak += 1;
        if (data.sessionCorrectStreak > data.longestSessionStreak) {
            data.longestSessionStreak = data.sessionCorrectStreak;
        }

        // Streak bonuses
        if (data.sessionCorrectStreak === 3) {
            bonusXP += XP.STREAK_3_BONUS;
            reason += ' + 3-streak🔥';
        } else if (data.sessionCorrectStreak === 5) {
            bonusXP += XP.STREAK_5_BONUS;
            reason += ' + 5-streak⚡';
        } else if (data.sessionCorrectStreak === 10) {
            bonusXP += XP.STREAK_10_BONUS;
            reason += ' + 10-streak🚀';
        }
    } else {
        // Wrong answer: lose XP and reset session streak
        baseXP = XP.WRONG_PENALTY;
        reason = 'Wrong answer';
        data.sessionCorrectStreak = 0;
    }

    // Calculate total XP change
    const rawXP = baseXP + bonusXP;
    const xpChange = Math.round(rawXP * effectiveMultiplier);

    // Level Floor Protection (Ratchet System)
    // Prevent dropping below current level's threshold
    const currentLevelMinXP = LEVEL_THRESHOLDS[oldLevel - 1] || 0;

    // Apply change but clamp to floor
    let newTotalXP = data.totalXP + xpChange;
    if (xpChange < 0 && newTotalXP < currentLevelMinXP) {
        newTotalXP = currentLevelMinXP;
    }

    // Update data
    data.totalXP = newTotalXP;
    data.lastXPEarnedAt = Date.now();

    // Consume XP boost if active
    if (hasXPBoost) {
        data.xpBoostRemaining -= 1;
    }

    // Check for level up
    const newLevel = calculateLevel(data.totalXP);
    const leveledUp = newLevel > oldLevel;

    if (leveledUp) {
        // Award coins for leveling up
        data.coins += COINS.LEVEL_UP;
        data.totalCoinsEarned += COINS.LEVEL_UP;
    }

    // Coin drop chance (only on correct answers)
    let coinsDrop = 0;
    if (isCorrect && Math.random() < COINS.DROP_CHANCE) {
        coinsDrop = Math.floor(Math.random() * (COINS.DROP_MAX - COINS.DROP_MIN + 1)) + COINS.DROP_MIN;
        data.coins += coinsDrop;
        data.totalCoinsEarned += coinsDrop;
        data.lastCoinDropAt = Date.now();
    }

    data.currentLevel = newLevel;
    saveGamificationData(data);

    return {
        xpGained: {
            baseXP,
            bonusXP,
            multiplier: effectiveMultiplier,
            totalXP: xpChange,
            reason,
        },
        leveledUp,
        newLevel,
        coinsDrop,
        newSessionStreak: data.sessionCorrectStreak,
    };
};

// Award bonus XP for completing daily goal
export const awardDailyGoalBonus = (): XPGain => {
    const data = getGamificationData();
    const multiplier = getStreakMultiplier();
    const totalXP = Math.round(XP.DAILY_GOAL_BONUS * multiplier);

    data.totalXP += totalXP;
    data.currentLevel = calculateLevel(data.totalXP);
    saveGamificationData(data);

    return {
        baseXP: XP.DAILY_GOAL_BONUS,
        bonusXP: 0,
        multiplier,
        totalXP,
        reason: 'Daily goal complete! 🎯',
    };
};

// Award bonus XP for perfect quiz
export const awardPerfectQuizBonus = (): { xp: XPGain; coins: number } => {
    const data = getGamificationData();
    const multiplier = getStreakMultiplier();
    const totalXP = Math.round(XP.PERFECT_QUIZ_BONUS * multiplier);

    data.totalXP += totalXP;
    data.coins += COINS.PERFECT_QUIZ;
    data.totalCoinsEarned += COINS.PERFECT_QUIZ;
    data.currentLevel = calculateLevel(data.totalXP);
    saveGamificationData(data);

    return {
        xp: {
            baseXP: XP.PERFECT_QUIZ_BONUS,
            bonusXP: 0,
            multiplier,
            totalXP,
            reason: 'Perfect quiz! 💯',
        },
        coins: COINS.PERFECT_QUIZ,
    };
};

// Reset session streak (call when starting new quiz session)
export const resetSessionStreak = (): void => {
    const data = getGamificationData();
    data.sessionCorrectStreak = 0;
    saveGamificationData(data);
};

// ===== Habit XP System =====

export interface HabitXPResult {
    xpGained: XPGain;
    leveledUp: boolean;
    newLevel: number;
    allHabitsBonus: boolean;
}

// Award XP for completing a single habit
export const awardHabitXP = (isAllHabitsComplete: boolean = false): HabitXPResult => {
    const data = getGamificationData();
    const oldLevel = calculateLevel(data.totalXP);
    const multiplier = getStreakMultiplier();

    let baseXP = XP.HABIT_COMPLETE;
    let bonusXP = 0;
    let reason = 'Habit complete';

    // Add bonus if all habits for the day are complete
    if (isAllHabitsComplete) {
        bonusXP += XP.ALL_HABITS_BONUS;
        reason = 'All habits done! 🎯';
    }

    const totalXP = Math.round((baseXP + bonusXP) * multiplier);

    data.totalXP += totalXP;
    data.lastXPEarnedAt = Date.now();

    const newLevel = calculateLevel(data.totalXP);
    const leveledUp = newLevel > oldLevel;

    if (leveledUp) {
        data.coins += COINS.LEVEL_UP;
        data.totalCoinsEarned += COINS.LEVEL_UP;
    }

    data.currentLevel = newLevel;
    saveGamificationData(data);

    return {
        xpGained: {
            baseXP,
            bonusXP,
            multiplier,
            totalXP,
            reason,
        },
        leveledUp,
        newLevel,
        allHabitsBonus: isAllHabitsComplete,
    };
};

// ===== Coin System =====

export const getCoins = (): number => {
    return getGamificationData().coins;
};

export const addCoins = (amount: number, reason: string = ''): void => {
    const data = getGamificationData();
    data.coins += amount;
    data.totalCoinsEarned += amount;
    saveGamificationData(data);
    console.log(`💎 +${amount} gems: ${reason}`);
};

export const spendCoins = (amount: number): boolean => {
    const data = getGamificationData();
    if (data.coins < amount) return false;

    data.coins -= amount;
    saveGamificationData(data);
    return true;
};

// ===== Powerup Shop =====

export const purchaseStreakFreeze = (): boolean => {
    const data = getGamificationData();
    if (data.coins < SHOP_PRICES.STREAK_FREEZE) return false;

    data.coins -= SHOP_PRICES.STREAK_FREEZE;
    data.streakFreezes += 1;
    saveGamificationData(data);
    return true;
};

export const purchaseHints = (): boolean => {
    const data = getGamificationData();
    if (data.coins < SHOP_PRICES.HINTS_3) return false;

    data.coins -= SHOP_PRICES.HINTS_3;
    data.hintsRemaining += 3;
    saveGamificationData(data);
    return true;
};

export const purchaseXPBoost = (): boolean => {
    const data = getGamificationData();
    if (data.coins < SHOP_PRICES.XP_BOOST_10) return false;

    data.coins -= SHOP_PRICES.XP_BOOST_10;
    data.xpBoostRemaining += 10;
    saveGamificationData(data);
    return true;
};

export const useHint = (): boolean => {
    const data = getGamificationData();
    if (data.hintsRemaining <= 0) return false;

    data.hintsRemaining -= 1;
    saveGamificationData(data);
    return true;
};

export const getHintsRemaining = (): number => {
    return getGamificationData().hintsRemaining;
};

export const getXPBoostRemaining = (): number => {
    return getGamificationData().xpBoostRemaining;
};

// ===== Streak Freeze =====

export const hasStreakFreeze = (): boolean => {
    return getGamificationData().streakFreezes > 0;
};

export const getStreakFreezeCount = (): number => {
    return getGamificationData().streakFreezes;
};

export const useStreakFreeze = (): boolean => {
    const data = getGamificationData();
    if (data.streakFreezes <= 0) return false;

    data.streakFreezes -= 1;
    data.activeStreakFreeze = true;
    data.streakFreezeUsedDate = new Date().toISOString().split('T')[0];
    saveGamificationData(data);
    return true;
};

export const isStreakFreezeActive = (): boolean => {
    const data = getGamificationData();
    if (!data.streakFreezeUsedDate) return false;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Freeze is active if used today or yesterday
    return data.streakFreezeUsedDate === today || data.streakFreezeUsedDate === yesterday;
};

// ===== Stats =====

export const getGamificationStats = () => {
    const data = getGamificationData();
    const levelInfo = getLevelInfo();

    return {
        totalXP: data.totalXP,
        level: levelInfo.level,
        levelTitle: levelInfo.title,
        levelIcon: levelInfo.icon,
        levelProgress: levelInfo.progress,
        xpToNextLevel: levelInfo.xpForNextLevel - data.totalXP,
        coins: data.coins,
        totalCoinsEarned: data.totalCoinsEarned,
        streakMultiplier: getStreakMultiplier(),
        streakFreezes: data.streakFreezes,
        hintsRemaining: data.hintsRemaining,
        xpBoostRemaining: data.xpBoostRemaining,
        longestSessionStreak: data.longestSessionStreak,
    };
};
