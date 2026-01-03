/**
 * Habit Awareness Service
 * Provides contextual messages for Rio mascot based on habit progress
 */

import {
    getHabits,
    getHabitLogs,
    getTodayProgress,
    getStreakForHabit,
    isHabitCompletedForDate,
    formatDate,
    Habit,
} from './habitService';

export interface AwarenessMessage {
    message: string;
    state: 'greeting' | 'encouraging' | 'celebrating' | 'thinking' | 'idle';
    priority: number; // Higher = more important
    type: string; // For tracking which message types have been shown
}

// Track shown messages to avoid spam (reset each hour)
const shownMessages = new Map<string, number>();
const MESSAGE_COOLDOWN = 30 * 60 * 1000; // 30 minutes cooldown per message type

function canShowMessage(type: string): boolean {
    const lastShown = shownMessages.get(type);
    if (!lastShown) return true;
    return Date.now() - lastShown > MESSAGE_COOLDOWN;
}

function markMessageShown(type: string): void {
    shownMessages.set(type, Date.now());
}

// ===== MAIN FUNCTION =====

export function getHabitAwarenessMessage(): AwarenessMessage | null {
    const messages: AwarenessMessage[] = [];

    // Collect all potential messages
    const timeMsg = checkTimeBasedTriggers();
    const progressMsg = checkProgressTriggers();
    const streakMsg = checkStreakTriggers();
    const motivationalMsg = checkMotivationalTriggers();
    const patternMsg = checkPatternTriggers();

    if (timeMsg && canShowMessage(timeMsg.type)) messages.push(timeMsg);
    if (progressMsg && canShowMessage(progressMsg.type)) messages.push(progressMsg);
    if (streakMsg && canShowMessage(streakMsg.type)) messages.push(streakMsg);
    if (motivationalMsg && canShowMessage(motivationalMsg.type)) messages.push(motivationalMsg);
    if (patternMsg && canShowMessage(patternMsg.type)) messages.push(patternMsg);

    if (messages.length === 0) return null;

    // Sort by priority and pick highest
    messages.sort((a, b) => b.priority - a.priority);
    const selected = messages[0];

    markMessageShown(selected.type);
    return selected;
}

// ===== TIME-BASED TRIGGERS =====

function checkTimeBasedTriggers(): AwarenessMessage | null {
    const hour = new Date().getHours();
    const { completed, total, habits } = getTodayProgress();

    if (total === 0) return null;

    // Morning greeting (6am - 10am)
    if (hour >= 6 && hour < 10 && completed === 0) {
        const firstHabit = habits[0];
        return {
            message: `☀️ Good morning! Ready to start with ${firstHabit.emoji} ${firstHabit.name}?`,
            state: 'greeting',
            priority: 8,
            type: 'morning_greeting',
        };
    }

    // Evening reminder (6pm - 10pm)
    if (hour >= 18 && hour < 22 && completed < total) {
        const remaining = total - completed;
        if (remaining === 1) {
            const unfinished = habits.find(h => !h.completed);
            return {
                message: `🌙 Just ${unfinished?.emoji} ${unfinished?.name} left for today! You got this!`,
                state: 'encouraging',
                priority: 9,
                type: 'evening_one_left',
            };
        }
        return {
            message: `🌙 End of day approaching! ${remaining} habits still waiting...`,
            state: 'thinking',
            priority: 7,
            type: 'evening_reminder',
        };
    }

    // Streak protection (after 8pm - check for endangered streaks)
    if (hour >= 20) {
        const allHabits = getHabits();
        for (const habit of allHabits) {
            const streak = getStreakForHabit(habit.id);
            const doneToday = isHabitCompletedForDate(habit.id, formatDate(new Date()));
            if (streak >= 7 && !doneToday) {
                return {
                    message: `🔥 Don't break your ${streak}-day streak on ${habit.emoji} ${habit.name}!`,
                    state: 'encouraging',
                    priority: 10,
                    type: `streak_protection_${habit.id}`,
                };
            }
        }
    }

    return null;
}

// ===== PROGRESS-BASED TRIGGERS =====

function checkProgressTriggers(): AwarenessMessage | null {
    const { completed, total } = getTodayProgress();
    const hour = new Date().getHours();

    if (total === 0) return null;

    // First habit done!
    if (completed === 1 && total > 1) {
        return {
            message: `Great start! 💪 ${total - 1} more to go!`,
            state: 'celebrating',
            priority: 6,
            type: 'first_done',
        };
    }

    // Halfway there
    if (total >= 4 && completed === Math.floor(total / 2)) {
        return {
            message: `You're halfway through! Keep the momentum! 🚀`,
            state: 'celebrating',
            priority: 6,
            type: 'halfway',
        };
    }

    // One left
    if (completed === total - 1 && total > 1) {
        return {
            message: `Just ONE more habit! Almost there! 🎯`,
            state: 'encouraging',
            priority: 7,
            type: 'one_left',
        };
    }

    // Nothing done yet (afternoon)
    if (completed === 0 && hour >= 14) {
        return {
            message: `Hey, haven't started habits today? It's okay, start small! 🌱`,
            state: 'thinking',
            priority: 5,
            type: 'nothing_done_afternoon',
        };
    }

    return null;
}

// ===== STREAK TRIGGERS =====

function checkStreakTriggers(): AwarenessMessage | null {
    const habits = getHabits();
    const today = formatDate(new Date());
    const yesterday = formatDate(new Date(Date.now() - 86400000));

    // Check for milestone streaks
    for (const habit of habits) {
        const streak = getStreakForHabit(habit.id);
        const milestones = [7, 14, 21, 30, 50, 100];

        for (const milestone of milestones) {
            if (streak === milestone) {
                return {
                    message: `🔥 WOW! ${milestone}-day streak on ${habit.emoji} ${habit.name}! That's legendary!`,
                    state: 'celebrating',
                    priority: 9,
                    type: `streak_milestone_${habit.id}_${milestone}`,
                };
            }
        }
    }

    // Check for streak broken (was 7+ days, now reset)
    const logs = getHabitLogs();
    for (const habit of habits) {
        const currentStreak = getStreakForHabit(habit.id);
        if (currentStreak === 0) {
            // Check if there was a long streak that just broke
            const completedDates = logs
                .filter(l => l.habitId === habit.id && l.completed)
                .map(l => l.date)
                .sort()
                .reverse();

            // If completed 2-3 days ago but not yesterday/today
            if (completedDates.length > 0 && completedDates[0] < yesterday) {
                const lastComplete = completedDates[0];
                const daysSince = Math.floor((Date.now() - new Date(lastComplete).getTime()) / 86400000);
                if (daysSince >= 2 && daysSince <= 4) {
                    return {
                        message: `${habit.emoji} ${habit.name} misses you! Streaks break, but you can start again today! 💙`,
                        state: 'encouraging',
                        priority: 4,
                        type: `streak_broken_${habit.id}`,
                    };
                }
            }
        }
    }

    // Multiple 7+ day streaks
    const hotStreaks = habits.filter(h => getStreakForHabit(h.id) >= 7);
    if (hotStreaks.length >= 3) {
        return {
            message: `🏆 You have ${hotStreaks.length} habits with 7+ day streaks! On fire!`,
            state: 'celebrating',
            priority: 8,
            type: 'multiple_streaks',
        };
    }

    return null;
}

// ===== MOTIVATIONAL TRIGGERS =====

function checkMotivationalTriggers(): AwarenessMessage | null {
    const habits = getHabits();
    const today = formatDate(new Date());
    const dayOfWeek = new Date().getDay();

    // Check for stuck habits (not done in 3+ days)
    for (const habit of habits) {
        const logs = getHabitLogs()
            .filter(l => l.habitId === habit.id && l.completed)
            .map(l => l.date)
            .sort()
            .reverse();

        if (logs.length > 0) {
            const lastComplete = logs[0];
            const daysSince = Math.floor((Date.now() - new Date(lastComplete).getTime()) / 86400000);

            if (daysSince >= 3 && daysSince <= 7) {
                return {
                    message: `I noticed ${habit.emoji} ${habit.name} has been quiet... how about just starting today?`,
                    state: 'thinking',
                    priority: 3,
                    type: `stuck_habit_${habit.id}`,
                };
            }
        }
    }

    // New habit encouragement (first 7 days)
    for (const habit of habits) {
        const createdDaysAgo = Math.floor((Date.now() - habit.createdAt) / 86400000);
        if (createdDaysAgo >= 1 && createdDaysAgo <= 7) {
            const streak = getStreakForHabit(habit.id);
            if (streak > 0 && streak <= 5) {
                return {
                    message: `Day ${streak + 1} of ${habit.emoji} ${habit.name}! You're building a habit! 📝`,
                    state: 'encouraging',
                    priority: 4,
                    type: `new_habit_${habit.id}_day${createdDaysAgo}`,
                };
            }
        }
    }

    // Weekend catch-up (Saturday or Sunday)
    if ((dayOfWeek === 0 || dayOfWeek === 6) && habits.length > 0) {
        const { completed, total } = getTodayProgress();
        if (completed === 0 && total > 0) {
            return {
                message: `It's the weekend! 🎉 A perfect time to focus on your habits!`,
                state: 'greeting',
                priority: 2,
                type: 'weekend_reminder',
            };
        }
    }

    return null;
}

// ===== PATTERN/OBSERVATION TRIGGERS =====

function checkPatternTriggers(): AwarenessMessage | null {
    const habits = getHabits();
    const logs = getHabitLogs();
    const dayOfWeek = new Date().getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (habits.length === 0 || logs.length < 14) return null; // Need at least 2 weeks of data

    // Find best completion day of week
    const dayCompletions = [0, 0, 0, 0, 0, 0, 0];
    for (const log of logs.filter(l => l.completed)) {
        const logDay = new Date(log.date).getDay();
        dayCompletions[logDay]++;
    }

    const maxCompletions = Math.max(...dayCompletions);
    const bestDay = dayCompletions.indexOf(maxCompletions);

    if (dayOfWeek === bestDay && maxCompletions >= 3) {
        return {
            message: `${dayNames[bestDay]}s are your best habit day! Keep that trend going! 📈`,
            state: 'thinking',
            priority: 2,
            type: `best_day_${bestDay}`,
        };
    }

    // Check for full completion streak (all habits done X days in a row)
    const last7Days: string[] = [];
    for (let i = 0; i < 7; i++) {
        last7Days.push(formatDate(new Date(Date.now() - i * 86400000)));
    }

    let fullCompletionStreak = 0;
    for (const date of last7Days) {
        const habitsForDate = habits.filter(h => {
            // Check if habit was active on that date
            const createdDate = formatDate(new Date(h.createdAt));
            return createdDate <= date;
        });

        if (habitsForDate.length === 0) break;

        const allDone = habitsForDate.every(h =>
            logs.some(l => l.habitId === h.id && l.date === date && l.completed)
        );

        if (allDone) {
            fullCompletionStreak++;
        } else {
            break;
        }
    }

    if (fullCompletionStreak >= 3) {
        return {
            message: `${fullCompletionStreak} days completing ALL habits! You're on a roll! 🌟`,
            state: 'celebrating',
            priority: 7,
            type: `full_completion_streak_${fullCompletionStreak}`,
        };
    }

    return null;
}

// ===== UTILITY: Reset cooldowns (for testing) =====

export function resetAwarenessCooldowns(): void {
    shownMessages.clear();
}
