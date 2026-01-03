/**
 * Time-of-Day Optimization Service
 * 
 * Tracks user performance by hour to identify optimal study times:
 * - Records accuracy and speed by hour of day
 * - Identifies peak performance windows
 * - Provides gentle Rio nudges for optimal study times
 * 
 * All tracking is invisible - only Rio's suggestions are visible.
 * Enable debug: localStorage.setItem('debug_intelligence', 'true')
 */

// Debug logging
const DEBUG = () => localStorage.getItem('debug_intelligence') === 'true';
const log = (msg: string, ...args: any[]) => {
    if (DEBUG()) console.log(`⏰ [TimeOptimizer] ${msg}`, ...args);
};

// Storage key
const TIME_STATS_KEY = 'pulmo_time_of_day_stats';

interface HourlyStats {
    hour: number;  // 0-23
    totalAttempts: number;
    correctAttempts: number;
    totalTimeMs: number;
    avgAccuracy: number;
    avgTimeMs: number;
}

interface TimeOfDayData {
    hourlyStats: Record<number, HourlyStats>;
    lastUpdated: number;
    peakHours: number[];  // Top 3 performing hours
    lowHours: number[];   // Bottom 3 performing hours
}

/**
 * Get current time-of-day stats
 */
function getTimeOfDayStats(): TimeOfDayData {
    try {
        const stored = localStorage.getItem(TIME_STATS_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) { }

    // Initialize with empty stats for all hours
    const hourlyStats: Record<number, HourlyStats> = {};
    for (let h = 0; h < 24; h++) {
        hourlyStats[h] = {
            hour: h,
            totalAttempts: 0,
            correctAttempts: 0,
            totalTimeMs: 0,
            avgAccuracy: 0,
            avgTimeMs: 0
        };
    }

    return {
        hourlyStats,
        lastUpdated: Date.now(),
        peakHours: [],
        lowHours: []
    };
}

/**
 * Save time-of-day stats
 */
function saveTimeOfDayStats(data: TimeOfDayData): void {
    localStorage.setItem(TIME_STATS_KEY, JSON.stringify(data));
}

/**
 * Record a question attempt with timestamp
 */
export function recordAttemptTime(correct: boolean, responseTimeMs: number): void {
    const hour = new Date().getHours();
    const data = getTimeOfDayStats();

    const stats = data.hourlyStats[hour];
    stats.totalAttempts++;
    if (correct) stats.correctAttempts++;
    stats.totalTimeMs += responseTimeMs;

    // Recalculate averages
    stats.avgAccuracy = stats.totalAttempts > 0
        ? stats.correctAttempts / stats.totalAttempts
        : 0;
    stats.avgTimeMs = stats.totalAttempts > 0
        ? stats.totalTimeMs / stats.totalAttempts
        : 0;

    data.lastUpdated = Date.now();

    // Recalculate peak/low hours if we have enough data
    recalculatePeakHours(data);

    saveTimeOfDayStats(data);

    log(`Recorded attempt at hour ${hour}: ${correct ? '✓' : '✗'} (${responseTimeMs}ms)`);
}

/**
 * Recalculate peak and low performance hours
 * Only considers hours with 5+ attempts for statistical significance
 */
function recalculatePeakHours(data: TimeOfDayData): void {
    const validHours = Object.values(data.hourlyStats)
        .filter(s => s.totalAttempts >= 5)
        .sort((a, b) => {
            // Score = accuracy * 0.7 + speed_score * 0.3
            // Speed score: faster = better (normalized to 0-1)
            const maxTime = 60000; // 60 seconds max
            const speedScoreA = 1 - Math.min(a.avgTimeMs / maxTime, 1);
            const speedScoreB = 1 - Math.min(b.avgTimeMs / maxTime, 1);

            const scoreA = a.avgAccuracy * 0.7 + speedScoreA * 0.3;
            const scoreB = b.avgAccuracy * 0.7 + speedScoreB * 0.3;

            return scoreB - scoreA;  // Highest first
        });

    if (validHours.length >= 3) {
        data.peakHours = validHours.slice(0, 3).map(s => s.hour);
        data.lowHours = validHours.slice(-3).reverse().map(s => s.hour);
        log(`Peak hours: ${data.peakHours.join(', ')}, Low hours: ${data.lowHours.join(', ')}`);
    }
}

/**
 * Get the user's peak performance hours
 */
export function getPeakHours(): number[] {
    return getTimeOfDayStats().peakHours;
}

/**
 * Check if current hour is a peak performance hour
 */
export function isCurrentlyPeakHour(): boolean {
    const currentHour = new Date().getHours();
    return getPeakHours().includes(currentHour);
}

/**
 * Check if current hour is a low performance hour
 */
export function isCurrentlyLowHour(): boolean {
    const currentHour = new Date().getHours();
    return getTimeOfDayStats().lowHours.includes(currentHour);
}

/**
 * Get performance insight message for Rio
 */
export function getTimeInsight(): {
    hasInsight: boolean;
    message?: string;
    isPositive: boolean;
} {
    const data = getTimeOfDayStats();
    const currentHour = new Date().getHours();

    // Need enough data for insights
    const totalAttempts = Object.values(data.hourlyStats)
        .reduce((sum, s) => sum + s.totalAttempts, 0);

    if (totalAttempts < 50) {
        return { hasInsight: false, isPositive: true };
    }

    // Check if currently in peak hour
    if (data.peakHours.includes(currentHour)) {
        const messages = [
            `This is your power hour! 🔥 You perform best around ${formatHour(currentHour)}.`,
            `Perfect timing! You're sharpest at this hour. ⚡`,
            `You're in your zone! ${formatHour(currentHour)} is your peak. 🎯`
        ];
        return {
            hasInsight: true,
            message: messages[Math.floor(Math.random() * messages.length)],
            isPositive: true
        };
    }

    // Check if currently in low hour
    if (data.lowHours.includes(currentHour)) {
        const peakHoursFormatted = data.peakHours.map(formatHour).join(' or ');
        const messages = [
            `You usually do better around ${peakHoursFormatted}. But hey, practice is practice! 💪`,
            `Not your typical peak time, but every session counts! 📚`,
            `You shine brighter at ${peakHoursFormatted}. Maybe keep this session light? 🌙`
        ];
        return {
            hasInsight: true,
            message: messages[Math.floor(Math.random() * messages.length)],
            isPositive: false
        };
    }

    return { hasInsight: false, isPositive: true };
}

/**
 * Format hour for display
 */
function formatHour(hour: number): string {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
}

/**
 * Get hourly performance chart data
 */
export function getHourlyPerformanceData(): {
    hour: number;
    label: string;
    accuracy: number;
    attempts: number;
    isPeak: boolean;
    isLow: boolean;
}[] {
    const data = getTimeOfDayStats();

    return Object.values(data.hourlyStats).map(stats => ({
        hour: stats.hour,
        label: formatHour(stats.hour),
        accuracy: Math.round(stats.avgAccuracy * 100),
        attempts: stats.totalAttempts,
        isPeak: data.peakHours.includes(stats.hour),
        isLow: data.lowHours.includes(stats.hour)
    }));
}

/**
 * Get summary stats for debugging
 */
export function getTimeOptimizationStatus(): {
    totalTrackedAttempts: number;
    peakHours: string[];
    lowHours: string[];
    currentHourStats: HourlyStats | null;
    hasEnoughData: boolean;
} {
    const data = getTimeOfDayStats();
    const currentHour = new Date().getHours();
    const totalAttempts = Object.values(data.hourlyStats)
        .reduce((sum, s) => sum + s.totalAttempts, 0);

    return {
        totalTrackedAttempts: totalAttempts,
        peakHours: data.peakHours.map(formatHour),
        lowHours: data.lowHours.map(formatHour),
        currentHourStats: data.hourlyStats[currentHour],
        hasEnoughData: totalAttempts >= 50
    };
}

/**
 * Get suggested study time (next peak hour)
 */
export function getNextPeakHour(): {
    hour: number;
    formatted: string;
    hoursUntil: number;
} | null {
    const data = getTimeOfDayStats();

    if (data.peakHours.length === 0) return null;

    const currentHour = new Date().getHours();

    // Find next peak hour (today or tomorrow)
    for (let offset = 0; offset < 24; offset++) {
        const checkHour = (currentHour + offset) % 24;
        if (data.peakHours.includes(checkHour) && offset > 0) {
            return {
                hour: checkHour,
                formatted: formatHour(checkHour),
                hoursUntil: offset
            };
        }
    }

    return null;
}
