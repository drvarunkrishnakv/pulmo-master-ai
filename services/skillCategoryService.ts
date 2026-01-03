/**
 * Skill Category Analysis Service
 * 
 * Maps MCQ content to high-level skill categories for radar chart visualization.
 * Uses keyword detection since conceptTags isn't consistently available.
 * 
 * PERFORMANCE: Uses in-memory caching to prevent expensive recomputations
 * on every Analytics tab visit. Cache invalidates after 5 minutes.
 */

import { SavedMCQ } from '../types';
import { getAllMCQs } from './mcqBankService';

// ============================================
// CACHING LAYER - Prevents 3-second delays
// ============================================
interface SkillCategoryCache {
    stats: ReturnType<typeof _computeSkillCategoryStats> | null;
    flashcardStats: ReturnType<typeof _computeFlashcardCategoryStats> | null;
    timestamp: number;
}

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const skillCache: SkillCategoryCache = {
    stats: null,
    flashcardStats: null,
    timestamp: 0
};

function isCacheValid(): boolean {
    return Date.now() - skillCache.timestamp < CACHE_DURATION_MS;
}

export function clearSkillCategoryCache(): void {
    skillCache.stats = null;
    skillCache.flashcardStats = null;
    skillCache.timestamp = 0;
}

// Define skill categories with their detecting keywords
export const SKILL_CATEGORIES = {
    imaging: {
        name: 'Imaging',
        keywords: ['hrct', 'ct scan', 'x-ray', 'radiograph', 'cxr', 'chest x', 'imaging',
            'ground glass', 'honeycombing', 'consolidation', 'opacity', 'nodule',
            'hilar', 'mediastinal', 'pattern', 'pet scan', 'ultrasound'],
        color: '#8884d8'
    },
    management: {
        name: 'Mgmt',
        keywords: ['treatment', 'therapy', 'regimen', 'drug', 'dose', 'management',
            'medication', 'first-line', 'second-line', 'prophylaxis', 'biologic',
            'steroid', 'antifibrotic', 'bronchodilator', 'antibiotic'],
        color: '#82ca9d'
    },
    diagnostics: {
        name: 'Dx',
        keywords: ['criteria', 'diagnosis', 'staging', 'classification', 'score',
            'grading', 'biopsy', 'bronchoscopy', 'bal', 'histopathology',
            'gold stage', 'curb-65', 'psi', 'wells', 'geneva'],
        color: '#ffc658'
    },
    physiology: {
        name: 'Physio',
        keywords: ['pft', 'spirometry', 'fev1', 'fvc', 'dlco', 'ventilation',
            'perfusion', 'gas exchange', 'compliance', 'resistance',
            'lung volume', 'flow-volume', 'tlc', 'rv/tlc'],
        color: '#ff7300'
    },
    infections: {
        name: 'Infxn',
        keywords: ['tuberculosis', 'tb', 'pneumonia', 'infection', 'bacterial',
            'viral', 'fungal', 'aspergillus', 'abpa', 'ntm', 'mycobacterium',
            'covid', 'pneumocystis', 'empyema', 'abscess'],
        color: '#00C49F'
    },
    critical_care: {
        name: 'ICU',
        keywords: ['ards', 'ventilator', 'mechanical ventilation', 'intubation',
            'peep', 'fio2', 'icu', 'respiratory failure', 'sepsis',
            'shock', 'hypoxia', 'niv', 'bipap', 'cpap', 'weaning'],
        color: '#FF8042'
    },
    ild: {
        name: 'ILD',
        keywords: ['interstitial', 'ipf', 'fibrosis', 'uip', 'nsip', 'sarcoidosis',
            'hypersensitivity pneumonitis', 'ctd-ild', 'connective tissue',
            'rheumatoid', 'scleroderma', 'pulmonary fibrosis'],
        color: '#FFBB28'
    },
    obstructive: {
        name: 'Obstruct',
        keywords: ['copd', 'asthma', 'bronchiectasis', 'emphysema', 'chronic bronchitis',
            'airflow obstruction', 'gold', 'gina', 'exacerbation',
            'inhaler', 'bronchospasm', 'wheezing'],
        color: '#0088FE'
    }
};

export type SkillCategory = keyof typeof SKILL_CATEGORIES;

/**
 * Detect which category an MCQ belongs to based on question content
 */
export function detectCategory(mcq: SavedMCQ): SkillCategory | null {
    const text = `${mcq.question} ${mcq.deepDiveExplanation || ''} ${mcq.highYieldPearl || ''}`.toLowerCase();

    const scores: Record<SkillCategory, number> = {
        imaging: 0, management: 0, diagnostics: 0, physiology: 0,
        infections: 0, critical_care: 0, ild: 0, obstructive: 0
    };

    // Count keyword matches for each category
    for (const [category, config] of Object.entries(SKILL_CATEGORIES)) {
        for (const keyword of config.keywords) {
            if (text.includes(keyword.toLowerCase())) {
                scores[category as SkillCategory]++;
            }
        }
    }

    // Return the category with the highest score, or null if no matches
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return null;

    return Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] as SkillCategory;
}

/**
 * Internal: Compute accuracy stats for each skill category (expensive)
 */
function _computeSkillCategoryStats(): {
    category: SkillCategory;
    name: string;
    accuracy: number;
    attempted: number;
    total: number;
    color: string;
}[] {
    console.time('⏱️ _computeSkillCategoryStats');
    const allMCQs = getAllMCQs();

    // Group MCQs by category
    const categoryMCQs: Record<SkillCategory, SavedMCQ[]> = {
        imaging: [], management: [], diagnostics: [], physiology: [],
        infections: [], critical_care: [], ild: [], obstructive: []
    };

    for (const mcq of allMCQs) {
        const category = detectCategory(mcq);
        if (category) {
            categoryMCQs[category].push(mcq);
        }
    }

    // Calculate stats for each category
    const result = Object.entries(SKILL_CATEGORIES).map(([key, config]) => {
        const mcqs = categoryMCQs[key as SkillCategory];
        const attempted = mcqs.filter(m => m.timesAttempted > 0);
        const totalAttempts = attempted.reduce((sum, m) => sum + m.timesAttempted, 0);
        const totalCorrect = attempted.reduce((sum, m) => sum + m.correctAttempts, 0);
        const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : -1;

        return {
            category: key as SkillCategory,
            name: config.name,
            accuracy: accuracy >= 0 ? accuracy : 0, // Default to 0 for chart display
            attempted: attempted.length,
            total: mcqs.length,
            color: config.color
        };
    });
    console.timeEnd('⏱️ _computeSkillCategoryStats');
    return result;
}

/**
 * Get accuracy stats for each skill category (CACHED)
 * Returns cached result if available, otherwise computes and caches.
 */
export function getSkillCategoryStats(): ReturnType<typeof _computeSkillCategoryStats> {
    if (isCacheValid() && skillCache.stats) {
        console.log('📊 Skill stats: CACHE HIT');
        return skillCache.stats;
    }
    console.log('📊 Skill stats: CACHE MISS - computing...');
    const stats = _computeSkillCategoryStats();
    skillCache.stats = stats;
    skillCache.timestamp = Date.now();
    return stats;
}

/**
 * Get the three weakest categories for actionable insights
 */
export function getWeakestCategories(): { name: string; accuracy: number }[] {
    const stats = getSkillCategoryStats()
        .filter(s => s.attempted > 0) // Only include categories with attempts
        .sort((a, b) => a.accuracy - b.accuracy);

    return stats.slice(0, 3).map(s => ({ name: s.name, accuracy: s.accuracy }));
}

/**
 * Get the three strongest categories
 */
export function getStrongestCategories(): { name: string; accuracy: number }[] {
    const stats = getSkillCategoryStats()
        .filter(s => s.attempted > 0)
        .sort((a, b) => b.accuracy - a.accuracy);

    return stats.slice(0, 3).map(s => ({ name: s.name, accuracy: s.accuracy }));
}

/**
 * Internal: Compute flashcard mastery stats by skill category (expensive)
 */
function _computeFlashcardCategoryStats(): {
    category: SkillCategory;
    name: string;
    masteryPercent: number;
    reviewed: number;
    total: number;
}[] {
    // Get flashcard SRS data from localStorage
    let srsData: Record<string, { srsInterval: number; timesReviewed: number }> = {};
    try {
        const stored = localStorage.getItem('pulmo_flashcard_srs');
        if (stored) srsData = JSON.parse(stored);
    } catch (e) {
        console.error('Error reading flashcard SRS:', e);
    }

    // Category keywords to detect from flashcard IDs
    const categoryFromId: Record<SkillCategory, string[]> = {
        imaging: ['hrct', 'ct-', 'x-ray', 'radiology', 'imaging'],
        management: ['treatment', 'therapy', 'drug', 'management', 'regimen'],
        diagnostics: ['diagnosis', 'criteria', 'staging', 'classification'],
        physiology: ['pft', 'spirometry', 'physiology', 'ventilation'],
        infections: ['tb-', 'tuberculosis', 'pneumonia', 'infection', 'ntm'],
        critical_care: ['ards', 'icu', 'ventilator', 'critical'],
        ild: ['ild', 'ipf', 'fibrosis', 'interstitial', 'sarcoid'],
        obstructive: ['copd', 'asthma', 'bronchiectasis', 'emphysema']
    };

    // Group flashcards by category based on their IDs
    const categoryFlashcards: Record<SkillCategory, { mastered: number; reviewed: number; total: number }> = {
        imaging: { mastered: 0, reviewed: 0, total: 0 },
        management: { mastered: 0, reviewed: 0, total: 0 },
        diagnostics: { mastered: 0, reviewed: 0, total: 0 },
        physiology: { mastered: 0, reviewed: 0, total: 0 },
        infections: { mastered: 0, reviewed: 0, total: 0 },
        critical_care: { mastered: 0, reviewed: 0, total: 0 },
        ild: { mastered: 0, reviewed: 0, total: 0 },
        obstructive: { mastered: 0, reviewed: 0, total: 0 }
    };

    // Analyze each flashcard in SRS data
    for (const [cardId, data] of Object.entries(srsData)) {
        const idLower = cardId.toLowerCase();

        // Detect category from ID
        let detectedCategory: SkillCategory | null = null;
        for (const [cat, keywords] of Object.entries(categoryFromId)) {
            if (keywords.some(kw => idLower.includes(kw))) {
                detectedCategory = cat as SkillCategory;
                break;
            }
        }

        if (!detectedCategory) continue;

        categoryFlashcards[detectedCategory].total++;
        if (data.timesReviewed > 0) {
            categoryFlashcards[detectedCategory].reviewed++;
        }
        // Consider "mastered" if interval >= 7 days
        if (data.srsInterval >= 7) {
            categoryFlashcards[detectedCategory].mastered++;
        }
    }

    // Calculate mastery percentage for each category
    return Object.entries(SKILL_CATEGORIES).map(([key, config]) => {
        const stats = categoryFlashcards[key as SkillCategory];
        const masteryPercent = stats.reviewed > 0
            ? Math.round((stats.mastered / stats.reviewed) * 100)
            : 0;

        return {
            category: key as SkillCategory,
            name: config.name,
            masteryPercent,
            reviewed: stats.reviewed,
            total: stats.total
        };
    });
}

/**
 * Get flashcard mastery stats by skill category (CACHED)
 */
export function getFlashcardCategoryStats(): ReturnType<typeof _computeFlashcardCategoryStats> {
    if (isCacheValid() && skillCache.flashcardStats) {
        return skillCache.flashcardStats;
    }
    const stats = _computeFlashcardCategoryStats();
    skillCache.flashcardStats = stats;
    // Don't update timestamp here - let skill stats control it
    return stats;
}
