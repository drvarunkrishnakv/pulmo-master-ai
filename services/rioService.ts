/**
 * Rio Service - Centralized Mascot Personality
 * 
 * Generates context-aware messages for Rio across the app.
 * Rio is a friendly mentor who guides users to success.
 * All intelligence is invisible - user just sees a helpful companion.
 */

import { getStreakData, getDaysUntilExam, getExamSettings } from './streakService';
import { getSRSStats } from './srsService';
import { getAllMCQs } from './mcqBankService';
import { getFlashcardStats } from './flashcardService';
import { MascotState } from '../components/RioMascot';

// Context types for message generation
export type RioContext =
    | 'daily_greeting'
    | 'quiz_start'
    | 'quiz_correct'
    | 'quiz_wrong'
    | 'quiz_complete'
    | 'sprint_start'
    | 'sprint_complete'
    | 'flashcard_start'
    | 'flashcard_knew'
    | 'flashcard_didnt_know'
    | 'streak_milestone'
    | 'streak_broken'
    | 'comeback'
    | 'exam_approaching'
    | 'empty_state'
    | 'topic_intro'
    // Gamification contexts
    | 'level_up'
    | 'coin_drop'
    | 'xp_bonus'
    | 'streak_multiplier'
    | 'streak_freeze_used';

// Performance level for tailored messages
type PerformanceLevel = 'struggling' | 'improving' | 'strong' | 'crushing';

/**
 * Get user's current performance level
 */
const getPerformanceLevel = (): PerformanceLevel => {
    const allMCQs = getAllMCQs();
    const attempted = allMCQs.filter(m => m.timesAttempted > 0);

    if (attempted.length === 0) return 'improving';

    const totalCorrect = attempted.reduce((sum, m) => sum + m.correctAttempts, 0);
    const totalAttempts = attempted.reduce((sum, m) => sum + m.timesAttempted, 0);
    const accuracy = totalCorrect / totalAttempts;

    if (accuracy >= 0.8) return 'crushing';
    if (accuracy >= 0.65) return 'strong';
    if (accuracy >= 0.45) return 'improving';
    return 'struggling';
};

/**
 * Get time of day for greeting
 */
const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' | 'night' => {
    const hour = new Date().getHours();
    if (hour < 5) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
};

// Message pools for each context
const MESSAGES = {
    daily_greeting: {
        morning: [
            "Good morning, Doc! ☀️ Ready to crush some MCQs?",
            "Rise and shine! 🌅 Let's make today count!",
            "Morning! Early bird gets the NEET-SS! 🐦",
            "Good morning! Your brain is fresh — perfect for learning! 🧠"
        ],
        afternoon: [
            "Good afternoon! 🌤️ Time for a quick practice?",
            "Afternoon check-in! How about a sprint? ⚡",
            "Hey there! Perfect time for some revision! 📚"
        ],
        evening: [
            "Good evening! 🌆 Let's end the day strong!",
            "Evening! Quick review before you rest? 🌙",
            "Hey! Great time to reinforce today's learning! 💡"
        ],
        night: [
            "Burning the midnight oil? 🦉 Keep it brief!",
            "Late night study? You're dedicated! 🌟",
            "Night owl mode! 🌙 Just a few questions!"
        ]
    },

    quiz_correct: {
        struggling: [
            "Yes! That's the spirit! 💪",
            "You got it! Keep building! 🧱",
            "Correct! One step at a time! 🚶"
        ],
        improving: [
            "Right on! You're improving! 📈",
            "Nicely done! Keep it up! ✨",
            "Correct! You're getting stronger! 💪"
        ],
        strong: [
            "Knew you'd get it! 🎯",
            "Easy peasy! 🙌",
            "That's what I'm talking about! 🔥"
        ],
        crushing: [
            "Flawless! 🏆",
            "You make it look easy! 🌟",
            "Champion level! 👑"
        ]
    },

    quiz_wrong: {
        struggling: [
            "It's okay! This is how we learn! 📖",
            "Don't worry — you'll get it next time! 💪",
            "Every wrong is a step forward! 🚀",
            "Keep going! You're building knowledge! 🧠"
        ],
        improving: [
            "Oops! But you're improving overall! 📈",
            "Tricky one! Read the explanation! 💡",
            "Happens to the best! Learn and move on! 🎯"
        ],
        strong: [
            "Rare miss! You've got this! 💪",
            "Good to review this one! 📝",
            "Edge case! Now you know! 🧠"
        ],
        crushing: [
            "Even champions slip! Onward! 👑",
            "Keeping you humble! 😉",
            "Now you definitely won't forget this! 🔒"
        ]
    },

    quiz_complete: {
        low: [ // < 50%
            "Tough one! But now you know what to focus on! 🎯",
            "These questions just got added to your review! 📚",
            "Great for identifying gaps! Let's fill them! 💪"
        ],
        medium: [ // 50-75%
            "Solid effort! Room to improve! 📈",
            "Good work! Practice makes perfect! 💪",
            "Keep at it! You're getting there! 🚀"
        ],
        high: [ // 75-90%
            "Great job! You're in good shape! 🌟",
            "Strong performance! Keep it up! 🔥",
            "Impressive! Almost there! 🎯"
        ],
        perfect: [ // 90%+
            "Incredible! You nailed it! 🏆",
            "Absolutely crushed it! 👑",
            "Perfect score feeling! 🌟"
        ]
    },

    flashcard_knew: [
        "You've got it! 🌟",
        "Locked in! 🔐",
        "Quick recall! Nice! ⚡",
        "That one's sticking! 💪"
    ],

    flashcard_didnt_know: [
        "Now you know! 📖",
        "Added to review! See you soon! 🔄",
        "You'll get it next time! 💪",
        "Good to refresh this one! 🧠"
    ],

    sprint_start: [
        "Let's go! Race the clock! ⚡",
        "Sprint mode! Speed + accuracy! 🏃",
        "60 seconds of pure focus! 🎯",
        "Show me what you've got! 💪"
    ],

    sprint_complete: {
        low: [
            "Speed comes with practice! Keep sprinting! 🏃",
            "Every sprint makes you faster! ⚡"
        ],
        high: [
            "Lightning fast! 🌟",
            "Speed demon! You're ready for exam pressure! ⚡"
        ]
    },

    streak_milestone: {
        3: "3-day streak! On a roll! 🔥",
        7: "One week! You're building a habit! 💪",
        14: "Two weeks strong! Incredible discipline! 🌟",
        30: "ONE MONTH! You're unstoppable! 🏆",
        60: "60 days! True dedication! 👑",
        100: "100 DAYS! Legend status! 🚀"
    },

    streak_broken: [
        "Hey, welcome back! Let's rebuild! 💪",
        "Missed you! Ready to start again? 🌅",
        "Every champion has setbacks! Let's go! 🏃"
    ],

    exam_approaching: {
        final_week: [
            "Final week! Trust your preparation! 💪",
            "You've put in the work. Believe in yourself! 🌟",
            "Last week! Review, don't cram! 🧠"
        ],
        one_month: [
            "One month to go! Focus on weak spots! 🎯",
            "30 days! Time to peak! 📈",
            "Final stretch! You've got this! 💪"
        ],
        closing_in: [
            "Exam's getting close! Stay consistent! 📚",
            "Every session counts now! 🔥"
        ]
    },

    topic_intro: [
        "Let's dive into this topic! 📖",
        "Time to master this! 🧠",
        "This one's important — let's go! 🎯"
    ],

    // Topic-aware quiz intro messages (use {topic} as placeholder)
    quiz_intro: [
        "Let's test your {topic} knowledge! 🎯",
        "Time to see how you do on {topic}! 💪",
        "{topic} questions incoming! Ready? 🧠",
        "I know you've studied {topic}. Show me! 📚",
        "Let's crush some {topic} MCQs! 🔥"
    ],

    // Quick inline reactions (shorter for quiz flow)
    quick_correct: [
        "✓",
        "Nice!",
        "Yes!",
        "Got it!",
        "💪"
    ],

    quick_wrong: [
        "Nope",
        "Almost!",
        "Close!",
        "Tricky!",
        "Review this"
    ],

    empty_state: [
        "Start a quiz to build your question bank! 📚",
        "No questions yet! Let's generate some! 🚀",
        "Pick a topic and let's begin! 🎯"
    ],

    comeback: [
        "Welcome back! Missed having you here! 🌟",
        "Great to see you again! Let's pick up! 💪",
        "Back in action! Your progress is saved! 📚"
    ],

    // Session timeout messages
    break_reminder: [
        "You've been studying a while. Stretch break? 🧘",
        "45 min session! Great focus! Maybe hydrate? 💧",
        "Impressive dedication! Rest is part of learning too 😴"
    ],

    // Goal-related messages
    goal_progress: {
        half: [
            "Halfway to your goal! Keep going! 🎯",
            "50% done! You're on track! 📈"
        ],
        almost: [
            "Almost there! Just a few more! 💪",
            "So close to your daily goal! 🔥"
        ],
        complete: [
            "Daily goal crushed! You're amazing! 🏆",
            "Goal complete! Champion status! 👑"
        ]
    },

    // Gamification messages
    level_up: [
        "LEVEL UP! You're getting stronger! 🎉",
        "NEW LEVEL UNLOCKED! Amazing progress! 🚀",
        "Level up! Keep climbing! 📈",
        "You leveled up! So proud of you! 🌟"
    ],

    coin_drop: [
        "Ooh, gems! Lucky! 💎",
        "Bonus gems incoming! 💎",
        "Nice! You found some gems! ✨",
        "Gem drop! You're on a roll! 💰"
    ],

    xp_bonus: [
        "Bonus XP! Nice streak! ⚡",
        "XP multiplied! Keep going! 🔥",
        "Extra XP earned! 💪",
        "Streak bonus activated! ✨"
    ],

    streak_multiplier: {
        1.2: "1.2x XP multiplier active! Keep the streak! 🔥",
        1.5: "1.5x XP bonus! You're on fire! 🔥🔥",
        1.75: "1.75x XP! Two weeks strong! 💪",
        2.0: "DOUBLE XP! Monthly master status! 🏆"
    },

    streak_freeze_used: [
        "Streak freeze activated! Your streak is safe! 🧊",
        "Phew! Streak freeze saved you! 😮‍💨",
        "Streak protected! Back at it tomorrow! 💪"
    ]
};


/**
 * Get a random message from an array
 */
const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Get Rio message for a given context
 */
export const getRioMessage = (
    context: RioContext,
    data?: {
        score?: number;
        maxScore?: number;
        topic?: string;
        streak?: number;
    }
): string => {
    const performance = getPerformanceLevel();
    const timeOfDay = getTimeOfDay();
    const streakData = getStreakData();
    const daysToExam = getDaysUntilExam();

    switch (context) {
        case 'daily_greeting': {
            const srsStats = getSRSStats(getAllMCQs());
            let base = pickRandom(MESSAGES.daily_greeting[timeOfDay]);

            // Try to add time-of-day insight (10% chance if we have data)
            try {
                const { getTimeInsight } = require('./timeOptimizationService');
                const insight = getTimeInsight();
                if (insight.hasInsight && Math.random() < 0.1) {
                    return insight.message!;
                }
            } catch (e) {
                // Service not available
            }

            // Append due count
            if (srsStats.dueToday > 0) {
                return `${base.slice(0, -1)} — ${srsStats.dueToday} due today!`;
            }
            return base;
        }

        case 'quiz_correct':
            return pickRandom(MESSAGES.quiz_correct[performance]);

        case 'quiz_wrong':
            return pickRandom(MESSAGES.quiz_wrong[performance]);

        case 'quiz_complete': {
            const score = data?.score ?? 0;
            const max = data?.maxScore ?? 1;
            const percentage = (score / max) * 100;

            if (percentage >= 90) return pickRandom(MESSAGES.quiz_complete.perfect);
            if (percentage >= 75) return pickRandom(MESSAGES.quiz_complete.high);
            if (percentage >= 50) return pickRandom(MESSAGES.quiz_complete.medium);
            return pickRandom(MESSAGES.quiz_complete.low);
        }

        case 'flashcard_knew':
            return pickRandom(MESSAGES.flashcard_knew);

        case 'flashcard_didnt_know':
            return pickRandom(MESSAGES.flashcard_didnt_know);

        case 'sprint_start':
            return pickRandom(MESSAGES.sprint_start);

        case 'sprint_complete': {
            const score = data?.score ?? 0;
            return pickRandom(score >= 10 ? MESSAGES.sprint_complete.high : MESSAGES.sprint_complete.low);
        }

        case 'streak_milestone': {
            const streak = data?.streak ?? streakData.currentStreak;
            const milestones = [100, 60, 30, 14, 7, 3];
            for (const m of milestones) {
                if (streak >= m) {
                    return MESSAGES.streak_milestone[m as keyof typeof MESSAGES.streak_milestone];
                }
            }
            return `${streak}-day streak! 🔥`;
        }

        case 'streak_broken':
            return pickRandom(MESSAGES.streak_broken);

        case 'comeback':
            return pickRandom(MESSAGES.comeback);

        case 'exam_approaching': {
            if (daysToExam !== null) {
                if (daysToExam <= 7) return pickRandom(MESSAGES.exam_approaching.final_week);
                if (daysToExam <= 30) return pickRandom(MESSAGES.exam_approaching.one_month);
                if (daysToExam <= 60) return pickRandom(MESSAGES.exam_approaching.closing_in);
            }
            return "Keep practicing! You're building strength! 💪";
        }

        case 'topic_intro':
            return pickRandom(MESSAGES.topic_intro);

        case 'empty_state':
            return pickRandom(MESSAGES.empty_state);

        default:
            return "Let's go! 🚀";
    }
};

/**
 * Get appropriate Rio mascot state for a context
 */
export const getRioState = (context: RioContext): MascotState => {
    switch (context) {
        case 'daily_greeting':
        case 'comeback':
            return 'greeting';

        case 'quiz_correct':
        case 'flashcard_knew':
            return 'celebrating';

        case 'quiz_wrong':
        case 'flashcard_didnt_know':
            return 'encouraging';

        case 'quiz_complete':
        case 'sprint_complete':
        case 'streak_milestone':
            return 'cheering';

        case 'streak_broken':
            return 'sad';

        case 'sprint_start':
        case 'quiz_start':
            return 'presenting';

        case 'topic_intro':
        case 'empty_state':
            return 'suggesting';

        case 'exam_approaching':
            return 'presenting';

        default:
            return 'idle';
    }
};

/**
 * Get whether Rio should show a bubble for this context
 */
export const shouldShowRioBubble = (context: RioContext): boolean => {
    // Always show bubble for these contexts
    const alwaysShow: RioContext[] = [
        'daily_greeting',
        'quiz_complete',
        'streak_milestone',
        'streak_broken',
        'comeback',
        'exam_approaching',
        'empty_state'
    ];
    return alwaysShow.includes(context);
};

/**
 * Determine if user needs a comeback message
 * (hasn't practiced in 3+ days)
 */
export const needsComebackMessage = (): boolean => {
    const streakData = getStreakData();
    if (!streakData.lastPracticeDate) return false;

    const lastPractice = new Date(streakData.lastPracticeDate);
    const daysSince = Math.floor(
        (Date.now() - lastPractice.getTime()) / (24 * 60 * 60 * 1000)
    );

    return daysSince >= 3;
};

/**
 * Get the most relevant Rio context for current app state
 */
export const getCurrentRioContext = (): RioContext => {
    const streakData = getStreakData();
    const daysToExam = getDaysUntilExam();

    // Check for comeback
    if (needsComebackMessage()) {
        return 'comeback';
    }

    // Check for exam approaching
    if (daysToExam !== null && daysToExam <= 7) {
        return 'exam_approaching';
    }

    // Check for streak milestone
    const milestones = [100, 60, 30, 14, 7, 3];
    for (const m of milestones) {
        if (streakData.currentStreak === m) {
            return 'streak_milestone';
        }
    }

    // Default to daily greeting
    return 'daily_greeting';
};

/**
 * Get topic-aware quiz intro message
 */
export const getQuizIntroMessage = (topic: string): string => {
    const template = pickRandom(MESSAGES.quiz_intro);
    return template.replace('{topic}', topic);
};

/**
 * Get quick reaction for correct answer (for inline display)
 */
export const getQuickCorrectReaction = (): string => {
    return pickRandom(MESSAGES.quick_correct);
};

/**
 * Get quick reaction for wrong answer (for inline display)
 */
export const getQuickWrongReaction = (): string => {
    return pickRandom(MESSAGES.quick_wrong);
};

/**
 * Get break reminder message
 */
export const getBreakReminderMessage = (): string => {
    return pickRandom(MESSAGES.break_reminder);
};

/**
 * Get goal progress message based on completion percentage
 */
export const getGoalProgressMessage = (completionPercent: number): string | null => {
    if (completionPercent >= 100) {
        return pickRandom(MESSAGES.goal_progress.complete);
    }
    if (completionPercent >= 85) {
        return pickRandom(MESSAGES.goal_progress.almost);
    }
    if (completionPercent >= 45 && completionPercent <= 55) {
        return pickRandom(MESSAGES.goal_progress.half);
    }
    return null; // No message for this percentage
};

/**
 * Get Rio personality - consistent phrases for her character
 */
export const getRioPersonality = () => ({
    name: 'Rio',
    emoji: '👋',
    traits: ['encouraging', 'curious', 'playful', 'knowledgeable'],
    catchPhrases: [
        "You've got this!",
        "Let's learn together!",
        "One step at a time!",
        "Every question makes you stronger!"
    ]
});

