/**
 * Habit Tracker Service
 * Manages habits and completion logs in localStorage
 */

export interface Habit {
    id: string;
    name: string;
    emoji: string;
    color: string;
    frequency: 'daily' | 'weekdays' | 'weekends' | 'custom';
    customDays?: number[]; // 0 = Sunday, 6 = Saturday
    createdAt: number;
    archived?: boolean;
    order?: number;
}

export interface HabitLog {
    habitId: string;
    date: string; // YYYY-MM-DD
    completed: boolean;
}

const HABITS_KEY = 'pulmo_habits';
const LOGS_KEY = 'pulmo_habit_logs';

// ===== HABITS CRUD =====

export function getHabits(): Habit[] {
    try {
        const stored = localStorage.getItem(HABITS_KEY);
        const habits: Habit[] = stored ? JSON.parse(stored) : [];
        // Sort by order if present, otherwise creation time
        return habits.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
            }
            return a.createdAt - b.createdAt;
        });
    } catch {
        return [];
    }
}

export function saveHabits(habits: Habit[]): void {
    localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
}

export function addHabit(habit: Omit<Habit, 'id' | 'createdAt'>): Habit {
    const habits = getHabits();
    const newHabit: Habit = {
        ...habit,
        id: `habit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        createdAt: Date.now(),
        order: habits.length, // Add to end
    };
    habits.push(newHabit);
    saveHabits(habits);
    return newHabit;
}

export function updateHabit(id: string, updates: Partial<Omit<Habit, 'id' | 'createdAt'>>): void {
    const habits = getHabits();
    const index = habits.findIndex(h => h.id === id);
    if (index !== -1) {
        habits[index] = { ...habits[index], ...updates };
        saveHabits(habits);
    }
}

export function archiveHabit(id: string): void {
    const habits = getHabits();
    const index = habits.findIndex(h => h.id === id);
    if (index !== -1) {
        habits[index].archived = true;
        saveHabits(habits);
    }
}

export function unarchiveHabit(id: string): void {
    const habits = getHabits();
    const index = habits.findIndex(h => h.id === id);
    if (index !== -1) {
        habits[index].archived = false;
        saveHabits(habits);
    }
}

export function deleteHabit(id: string): void {
    const habits = getHabits().filter(h => h.id !== id);
    saveHabits(habits);
    // Also clean up logs for this habit
    const logs = getHabitLogs().filter(l => l.habitId !== id);
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

export function reorderHabits(startId: string, endId: string): void {
    const habits = getHabits();
    const startIndex = habits.findIndex(h => h.id === startId);
    const endIndex = habits.findIndex(h => h.id === endId);

    if (startIndex !== -1 && endIndex !== -1) {
        const [moved] = habits.splice(startIndex, 1);
        habits.splice(endIndex, 0, moved);

        // Update all orders
        const updated = habits.map((h, i) => ({ ...h, order: i }));
        saveHabits(updated);
    }
}

// ===== HABIT LOGS =====

export function getHabitLogs(): HabitLog[] {
    try {
        const stored = localStorage.getItem(LOGS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function getLogForDate(habitId: string, date: string): HabitLog | undefined {
    return getHabitLogs().find(l => l.habitId === habitId && l.date === date);
}

export function toggleHabitLog(habitId: string, date: string): boolean {
    const logs = getHabitLogs();
    const existingIndex = logs.findIndex(l => l.habitId === habitId && l.date === date);

    let isNowCompleted: boolean;

    if (existingIndex !== -1) {
        // Toggle existing
        logs[existingIndex].completed = !logs[existingIndex].completed;
        isNowCompleted = logs[existingIndex].completed;
    } else {
        // Create new completed log
        logs.push({ habitId, date, completed: true });
        isNowCompleted = true;
    }

    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    return isNowCompleted;
}

export function isHabitCompletedForDate(habitId: string, date: string): boolean {
    const log = getLogForDate(habitId, date);
    return log?.completed ?? false;
}

// ===== STREAKS =====

export function getStreakForHabit(habitId: string): number {
    const logs = getHabitLogs()
        .filter(l => l.habitId === habitId && l.completed)
        .map(l => l.date)
        .sort()
        .reverse();

    if (logs.length === 0) return 0;

    const today = formatDate(new Date());
    const yesterday = formatDate(new Date(Date.now() - 86400000));

    // Streak must start from today or yesterday
    if (logs[0] !== today && logs[0] !== yesterday) {
        return 0;
    }

    let streak = 1;
    let currentDate = new Date(logs[0]);

    for (let i = 1; i < logs.length; i++) {
        const prevDate = new Date(currentDate.getTime() - 86400000);
        const prevDateStr = formatDate(prevDate);

        if (logs[i] === prevDateStr) {
            streak++;
            currentDate = prevDate;
        } else {
            break;
        }
    }

    return streak;
}

// ===== HEATMAP DATA =====

export interface HeatmapData {
    date: string;
    completed: boolean;
    weekIndex: number;
    dayIndex: number;
}

export function getHeatmapData(habitId: string, weeks: number = 12): HeatmapData[] {
    const logs = getHabitLogs().filter(l => l.habitId === habitId);
    const completedDates = new Set(logs.filter(l => l.completed).map(l => l.date));

    const data: HeatmapData[] = [];
    const today = new Date();
    const totalDays = weeks * 7;

    // Start from (weeks * 7 - 1) days ago
    for (let i = totalDays - 1; i >= 0; i--) {
        const date = new Date(today.getTime() - i * 86400000);
        const dateStr = formatDate(date);
        const daysSinceStart = totalDays - 1 - i;

        data.push({
            date: dateStr,
            completed: completedDates.has(dateStr),
            weekIndex: Math.floor(daysSinceStart / 7),
            dayIndex: date.getDay(),
        });
    }

    return data;
}

// ===== TODAY'S PROGRESS =====

export function getTodayProgress(): { completed: number; total: number; habits: Array<Habit & { completed: boolean }> } {
    const today = formatDate(new Date());
    const habits = getHabits();
    const dayOfWeek = new Date().getDay();

    // Filter habits that are due today based on frequency
    const dueToday = habits.filter(h => {
        if (h.frequency === 'daily') return true;
        if (h.frequency === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
        if (h.frequency === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6;
        if (h.frequency === 'custom' && h.customDays) return h.customDays.includes(dayOfWeek);
        return true;
    });

    const habitsWithStatus = dueToday.map(h => ({
        ...h,
        completed: isHabitCompletedForDate(h.id, today),
    }));

    return {
        completed: habitsWithStatus.filter(h => h.completed).length,
        total: habitsWithStatus.length,
        habits: habitsWithStatus,
    };
}

// ===== WEEKLY STATS (for 7-day bar chart) =====

export interface WeeklyStats {
    days: { date: string; dayName: string; completed: number; total: number; pct: number }[];
    avgCompletion: number;
    bestDay: string;
    totalCompleted: number;
    totalPossible: number;
}

export function getWeeklyStats(): WeeklyStats {
    const habits = getHabits();
    const logs = getHabitLogs();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const days: WeeklyStats['days'] = [];
    let totalCompleted = 0;
    let totalPossible = 0;
    let bestPct = 0;
    let bestDay = '';

    // Last 7 days (today + 6 previous days)
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = formatDate(date);
        const dayOfWeek = date.getDay();

        // Count habits due on this day
        const habitsDue = habits.filter(h => {
            // Check if habit existed on this date
            if (new Date(h.createdAt) > date) return false;

            if (h.frequency === 'daily') return true;
            if (h.frequency === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
            if (h.frequency === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6;
            if (h.frequency === 'custom' && h.customDays) return h.customDays.includes(dayOfWeek);
            return true;
        });

        const completed = habitsDue.filter(h =>
            logs.some(l => l.habitId === h.id && l.date === dateStr && l.completed)
        ).length;

        const total = habitsDue.length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        days.push({
            date: dateStr,
            dayName: dayNames[dayOfWeek],
            completed,
            total,
            pct
        });

        totalCompleted += completed;
        totalPossible += total;

        if (pct > bestPct && total > 0) {
            bestPct = pct;
            bestDay = dayNames[dayOfWeek];
        }
    }

    return {
        days,
        avgCompletion: totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0,
        bestDay: bestDay || 'N/A',
        totalCompleted,
        totalPossible
    };
}

// ===== TREND DATA (for 30-day sparkline) =====

export interface TrendData {
    points: { date: string; pct: number }[];
    currentWeekAvg: number;
    lastWeekAvg: number;
    trend: 'up' | 'down' | 'stable';
    trendDiff: number;
}

export function getTrendData(): TrendData {
    const habits = getHabits();
    const logs = getHabitLogs();

    const points: TrendData['points'] = [];

    // Last 30 days
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = formatDate(date);
        const dayOfWeek = date.getDay();

        // Count habits due on this day
        const habitsDue = habits.filter(h => {
            if (new Date(h.createdAt) > date) return false;
            if (h.frequency === 'daily') return true;
            if (h.frequency === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
            if (h.frequency === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6;
            if (h.frequency === 'custom' && h.customDays) return h.customDays.includes(dayOfWeek);
            return true;
        });

        const completed = habitsDue.filter(h =>
            logs.some(l => l.habitId === h.id && l.date === dateStr && l.completed)
        ).length;

        const total = habitsDue.length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        points.push({ date: dateStr, pct });
    }

    // Calculate weekly averages
    const currentWeek = points.slice(-7);
    const lastWeek = points.slice(-14, -7);

    const currentWeekAvg = currentWeek.length > 0
        ? Math.round(currentWeek.reduce((sum, p) => sum + p.pct, 0) / currentWeek.length)
        : 0;
    const lastWeekAvg = lastWeek.length > 0
        ? Math.round(lastWeek.reduce((sum, p) => sum + p.pct, 0) / lastWeek.length)
        : 0;

    const trendDiff = currentWeekAvg - lastWeekAvg;
    const trend: TrendData['trend'] = trendDiff > 5 ? 'up' : trendDiff < -5 ? 'down' : 'stable';

    return { points, currentWeekAvg, lastWeekAvg, trend, trendDiff };
}

// ===== UTILITIES =====

export function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Predefined habit suggestions
export const HABIT_SUGGESTIONS = [
    { name: 'Daily MCQs', emoji: '📚', color: '#3b82f6' },
    { name: 'Read Guidelines', emoji: '📖', color: '#10b981' },
    { name: 'Sprint Challenge', emoji: '⚡', color: '#f59e0b' },
    { name: 'Meditation', emoji: '🧘', color: '#8b5cf6' },
    { name: 'Exercise', emoji: '🏃', color: '#ef4444' },
    { name: 'Review Mistakes', emoji: '🔄', color: '#06b6d4' },
    { name: 'Sleep 8 Hours', emoji: '😴', color: '#6366f1' },
    { name: 'Drink Water', emoji: '💧', color: '#0ea5e9' },
];

export const HABIT_COLORS = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ef4444', // red
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
];
