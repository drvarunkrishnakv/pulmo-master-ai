// Sprint Personal Best Tracking Service

const SPRINT_BEST_KEY = 'pulmo_sprint_personal_best';

export interface SprintBestData {
    bestScore: number; // Best correct answers
    bestStreak: number; // Longest consecutive correct
    bestSpeed: number; // Best questions per minute
    totalSprints: number; // Total sprints completed
    lastSprintDate: string; // ISO date
}

export const getSprintBest = (): SprintBestData => {
    try {
        const stored = localStorage.getItem(SPRINT_BEST_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) { /* ignore */ }

    return {
        bestScore: 0,
        bestStreak: 0,
        bestSpeed: 0,
        totalSprints: 0,
        lastSprintDate: ''
    };
};

export const updateSprintBest = (
    score: number,
    streak: number,
    speed: number
): { isNewBestScore: boolean; isNewBestStreak: boolean; isNewBestSpeed: boolean } => {
    const current = getSprintBest();

    const isNewBestScore = score > current.bestScore;
    const isNewBestStreak = streak > current.bestStreak;
    const isNewBestSpeed = speed > current.bestSpeed;

    const updated: SprintBestData = {
        bestScore: Math.max(current.bestScore, score),
        bestStreak: Math.max(current.bestStreak, streak),
        bestSpeed: Math.max(current.bestSpeed, speed),
        totalSprints: current.totalSprints + 1,
        lastSprintDate: new Date().toISOString().split('T')[0]
    };

    try {
        localStorage.setItem(SPRINT_BEST_KEY, JSON.stringify(updated));
    } catch (e) { /* ignore */ }

    return { isNewBestScore, isNewBestStreak, isNewBestSpeed };
};
