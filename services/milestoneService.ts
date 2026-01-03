/**
 * Milestone Service
 * Tracks user achievements and triggers celebrations
 */

const MILESTONE_KEY = 'pulmo_milestones';

export interface MilestoneData {
    totalQuestionsAnswered: number;
    totalQuizzesCompleted: number;
    perfectScores: number;
    longestStreak: number;
    firstQuizDate: string | null;
    unlockedMilestones: string[];
}

export interface Milestone {
    id: string;
    name: string;
    description: string;
    icon: string;
    check: (data: MilestoneData) => boolean;
}

// Define all milestones
export const MILESTONES: Milestone[] = [
    {
        id: 'first_quiz',
        name: 'First Steps',
        description: 'Complete your first quiz',
        icon: '🎯',
        check: (data) => data.totalQuizzesCompleted >= 1
    },
    {
        id: 'questions_50',
        name: 'Getting Warmed Up',
        description: 'Answer 50 questions',
        icon: '🔥',
        check: (data) => data.totalQuestionsAnswered >= 50
    },
    {
        id: 'questions_100',
        name: 'Century Club',
        description: 'Answer 100 questions',
        icon: '💯',
        check: (data) => data.totalQuestionsAnswered >= 100
    },
    {
        id: 'questions_500',
        name: 'Knowledge Seeker',
        description: 'Answer 500 questions',
        icon: '📚',
        check: (data) => data.totalQuestionsAnswered >= 500
    },
    {
        id: 'questions_1000',
        name: 'Master Scholar',
        description: 'Answer 1000 questions',
        icon: '🎓',
        check: (data) => data.totalQuestionsAnswered >= 1000
    },
    {
        id: 'first_perfect',
        name: 'Perfect Score!',
        description: 'Get 100% on a quiz',
        icon: '⭐',
        check: (data) => data.perfectScores >= 1
    },
    {
        id: 'perfect_5',
        name: 'Perfectionist',
        description: 'Get 5 perfect scores',
        icon: '🌟',
        check: (data) => data.perfectScores >= 5
    },
    {
        id: 'streak_3',
        name: 'On a Roll',
        description: 'Reach a 3-day streak',
        icon: '🔥',
        check: (data) => data.longestStreak >= 3
    },
    {
        id: 'streak_7',
        name: 'Week Warrior',
        description: 'Reach a 7-day streak',
        icon: '💪',
        check: (data) => data.longestStreak >= 7
    },
    {
        id: 'streak_30',
        name: 'Monthly Master',
        description: 'Reach a 30-day streak',
        icon: '🏆',
        check: (data) => data.longestStreak >= 30
    },
    {
        id: 'quizzes_10',
        name: 'Quiz Enthusiast',
        description: 'Complete 10 quizzes',
        icon: '📝',
        check: (data) => data.totalQuizzesCompleted >= 10
    },
    {
        id: 'quizzes_50',
        name: 'Quiz Champion',
        description: 'Complete 50 quizzes',
        icon: '🏅',
        check: (data) => data.totalQuizzesCompleted >= 50
    }
];

/**
 * Get milestone data from localStorage
 */
export function getMilestoneData(): MilestoneData {
    try {
        const stored = localStorage.getItem(MILESTONE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Error reading milestone data:', e);
    }
    return {
        totalQuestionsAnswered: 0,
        totalQuizzesCompleted: 0,
        perfectScores: 0,
        longestStreak: 0,
        firstQuizDate: null,
        unlockedMilestones: []
    };
}

/**
 * Save milestone data to localStorage
 */
function saveMilestoneData(data: MilestoneData): void {
    try {
        localStorage.setItem(MILESTONE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving milestone data:', e);
    }
}

/**
 * Record quiz completion and check for new milestones
 * Returns array of newly unlocked milestones
 */
export function recordQuizCompletion(
    questionsAnswered: number,
    correctAnswers: number,
    currentStreak: number
): Milestone[] {
    const data = getMilestoneData();

    // Update counts
    data.totalQuestionsAnswered += questionsAnswered;
    data.totalQuizzesCompleted += 1;

    // Check for perfect score
    if (questionsAnswered > 0 && correctAnswers === questionsAnswered) {
        data.perfectScores += 1;
    }

    // Update longest streak
    if (currentStreak > data.longestStreak) {
        data.longestStreak = currentStreak;
    }

    // Set first quiz date if not set
    if (!data.firstQuizDate) {
        data.firstQuizDate = new Date().toISOString();
    }

    // Check for newly unlocked milestones
    const newlyUnlocked: Milestone[] = [];

    for (const milestone of MILESTONES) {
        if (!data.unlockedMilestones.includes(milestone.id) && milestone.check(data)) {
            data.unlockedMilestones.push(milestone.id);
            newlyUnlocked.push(milestone);
        }
    }

    // Save updated data
    saveMilestoneData(data);

    return newlyUnlocked;
}

/**
 * Get all unlocked milestones
 */
export function getUnlockedMilestones(): Milestone[] {
    const data = getMilestoneData();
    return MILESTONES.filter(m => data.unlockedMilestones.includes(m.id));
}

/**
 * Get next milestone to unlock
 */
export function getNextMilestone(): Milestone | null {
    const data = getMilestoneData();
    return MILESTONES.find(m => !data.unlockedMilestones.includes(m.id)) || null;
}

/**
 * Get milestone progress percentage
 */
export function getMilestoneProgress(): { unlocked: number; total: number; percentage: number } {
    const data = getMilestoneData();
    const unlocked = data.unlockedMilestones.length;
    const total = MILESTONES.length;
    return {
        unlocked,
        total,
        percentage: Math.round((unlocked / total) * 100)
    };
}
