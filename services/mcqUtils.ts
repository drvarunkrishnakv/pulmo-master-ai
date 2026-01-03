import { SavedMCQ } from '../types';

/**
 * Helper: Get a balanced set of MCQs (mix of one-liners and standard)
 * Default ratio: 30% one-liners (breather questions)
 */
export const getBalancedMCQSet = (
    pool: SavedMCQ[],
    count: number,
    oneLinerRatio: number = 0.3
): SavedMCQ[] => {
    if (pool.length === 0) return [];
    if (pool.length <= count) return pool;

    const oneLiners = pool.filter(m => m.isOneLiner);
    const standard = pool.filter(m => !m.isOneLiner);

    // Calculate targets
    let targetOneLiners = Math.round(count * oneLinerRatio);
    let targetStandard = count - targetOneLiners;

    // Adjust if insufficient pool
    if (oneLiners.length < targetOneLiners) {
        targetOneLiners = oneLiners.length;
        targetStandard = count - targetOneLiners;
    }
    // If we can't fill standard spots, fill with one-liners (and vice versa)
    if (standard.length < targetStandard) {
        targetStandard = standard.length;
        targetOneLiners = Math.min(count - targetStandard, oneLiners.length);
    }

    // Slice (assuming pool is already shuffled or we shuffle here)
    const shuffle = <T>(arr: T[]): T[] => {
        const shuffled = [...arr].sort(() => Math.random() - 0.5);
        return shuffled;
    };

    const selectedOneLiners = shuffle(oneLiners).slice(0, targetOneLiners);
    const selectedStandard = shuffle(standard).slice(0, targetStandard);

    // Final combine and shuffle
    return shuffle([...selectedOneLiners, ...selectedStandard]);
};
