/**
 * Concept Linking Service
 * 
 * Maps topics to their prerequisite concepts:
 * - When user fails a question, identifies underlying concepts to reinforce
 * - Silently queues prerequisite questions for future sessions
 * - Builds a knowledge graph for smarter remediation
 * 
 * All linking is invisible - user just sees better question selection.
 * Enable debug: localStorage.setItem('debug_intelligence', 'true')
 */

import { getAllMCQs } from './mcqBankService';
import { SavedMCQ } from '../types';

// Debug logging
const DEBUG = () => localStorage.getItem('debug_intelligence') === 'true';
const log = (msg: string, ...args: any[]) => {
    if (DEBUG()) console.log(`🔗 [ConceptLink] ${msg}`, ...args);
};

// Storage for queued concepts
const CONCEPT_QUEUE_KEY = 'pulmo_concept_queue';

/**
 * Topic prerequisite mapping
 * Key = topic that user struggles with
 * Value = array of prerequisite topics that should be reinforced
 */
const TOPIC_PREREQUISITES: Record<string, string[]> = {
    // TB treatment requires understanding diagnosis
    'tb_treatment': ['tb_diagnosis', 'tb_pathogenesis'],
    'tb_drtb': ['tb_treatment', 'tb_diagnosis'],
    'tb_special_pops': ['tb_treatment', 'tb_diagnosis'],
    'tb_ntm': ['tb_diagnosis'],

    // COPD management requires diagnosis understanding
    'copd_management': ['copd_diagnosis', 'spirometry'],

    // Asthma hierarchy
    'asthma_management': ['asthma_diagnosis', 'asthma_pathophys'],
    'asthma_severe': ['asthma_management', 'asthma_pathophys'],
    'asthma_diagnosis': ['spirometry', 'bronchoprovocation'],

    // Pneumonia cascade
    'hap_vap': ['cap'],
    'pneumonia_immunocomp': ['cap', 'ipa'],

    // ILD requires understanding of specific types
    'ipf': ['hrct_ild', 'dlco'],
    'nsip_iip': ['ipf', 'hrct_ild'],
    'ctd_ild': ['nsip_iip', 'ipf'],
    'hp': ['hrct_ild'],

    // PH cascade
    'ph_diagnosis': ['ph_classification'],
    'ph_treatment': ['ph_diagnosis', 'ph_classification'],
    'ph_group3': ['ph_classification', 'copd_diagnosis'],

    // PE cascade
    'pe_treatment': ['pe_diagnosis'],
    'cteph': ['pe_diagnosis', 'pe_treatment', 'ph_classification'],

    // Pleural cascade
    'parapneumonic': ['pleural_effusion', 'lights_criteria'],
    'malignant_effusion': ['pleural_effusion', 'lights_criteria'],

    // Lung cancer cascade
    'lung_cancer_staging': ['lung_cancer_histo', 'lung_cancer_epi'],
    'lung_cancer_chemo': ['lung_cancer_staging', 'lung_cancer_mutations'],
    'lung_cancer_immuno': ['lung_cancer_staging', 'lung_cancer_mutations'],
    'lung_cancer_surgery': ['lung_cancer_staging'],

    // ARDS cascade
    'ards_ventilation': ['ards_definition', 'ards_pathophys', 'mv_modes'],
    'ards_prone': ['ards_ventilation', 'ards_pathophys'],

    // Ventilation cascade
    'mv_asthma_copd': ['mv_modes', 'copd_management', 'asthma_management'],
    'niv': ['mv_modes', 'respiratory_failure'],
    'weaning': ['mv_modes', 'niv'],

    // Sleep cascade
    'osa_treatment': ['osa_diagnosis', 'psg'],
    'ohs': ['osa_diagnosis', 'respiratory_failure'],
    'sleep_copd': ['osa_diagnosis', 'copd_diagnosis'],

    // PFT cascade
    'dlco': ['spirometry', 'lung_volumes'],
    'bronchoprovocation': ['spirometry'],
    'exercise_testing': ['spirometry', 'abg'],

    // ABG and respiratory failure
    'respiratory_failure': ['abg'],

    // Bronchoscopy cascade
    'ebus': ['bronchoscopy_basic'],
    'interventional_bronch': ['bronchoscopy_basic', 'ebus'],
    'bal': ['bronchoscopy_basic'],

    // Radiology cascade
    'hrct_ild': ['thoracic_ct'],
    'thoracic_ct': ['cxr'],
};

/**
 * Related concepts (bidirectional or sibling topics)
 * These aren't prerequisites but are often confused together
 */
const RELATED_CONCEPTS: Record<string, string[]> = {
    'tb_diagnosis': ['tb_ntm', 'sarcoidosis'],
    'ipf': ['nsip_iip', 'hp'],
    'asthma_pathophys': ['copd_diagnosis'],  // Often confused
    'ph_classification': ['pe_diagnosis'],
    'cap': ['tb_diagnosis'],
    'lights_criteria': ['pleural_effusion'],
    'abpa': ['asthma_severe', 'bronchiectasis'],
};

/**
 * Get prerequisite topics for a given topic
 */
export function getPrerequisites(topic: string): string[] {
    return TOPIC_PREREQUISITES[topic] || [];
}

/**
 * Get related (sibling) topics
 */
export function getRelatedConcepts(topic: string): string[] {
    return RELATED_CONCEPTS[topic] || [];
}

/**
 * Get queued prerequisite concepts
 */
function getConceptQueue(): { topic: string; priority: number; addedAt: number }[] {
    try {
        const stored = localStorage.getItem(CONCEPT_QUEUE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

/**
 * Save concept queue
 */
function saveConceptQueue(queue: { topic: string; priority: number; addedAt: number }[]): void {
    localStorage.setItem(CONCEPT_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Queue a prerequisite topic for reinforcement
 * Called when user fails a question
 */
export function queuePrerequisites(failedTopic: string): string[] {
    const prerequisites = getPrerequisites(failedTopic);

    if (prerequisites.length === 0) {
        log(`No prerequisites for ${failedTopic}`);
        return [];
    }

    const queue = getConceptQueue();
    const now = Date.now();
    const queuedTopics: string[] = [];

    for (const prereq of prerequisites) {
        // Check if already in queue (within last 24 hours)
        const existing = queue.find(q => q.topic === prereq);

        if (existing) {
            // Boost priority
            existing.priority = Math.min(existing.priority + 1, 5);
            log(`Boosted priority for ${prereq} to ${existing.priority}`);
        } else {
            // Add new
            queue.push({
                topic: prereq,
                priority: 1,
                addedAt: now
            });
            queuedTopics.push(prereq);
            log(`Queued prerequisite: ${prereq} for failed topic: ${failedTopic}`);
        }
    }

    // Clean up old entries (> 7 days)
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const cleaned = queue.filter(q => q.addedAt > weekAgo);

    saveConceptQueue(cleaned);

    return queuedTopics;
}

/**
 * Get MCQs from queued prerequisite topics
 * Used by smart selection to mix in prerequisite questions
 */
export function getPrerequisiteMCQs(count: number = 3): SavedMCQ[] {
    const queue = getConceptQueue();

    if (queue.length === 0) {
        return [];
    }

    // Sort by priority (highest first)
    queue.sort((a, b) => b.priority - a.priority);

    // Get topics to pull from
    const topicsToInclude = queue.slice(0, 3).map(q => q.topic);

    const allMCQs = getAllMCQs();
    const prerequisiteMCQs = allMCQs.filter(mcq =>
        topicsToInclude.includes(mcq.topic) &&
        mcq.timesAttempted < 3  // Focus on less-practiced questions
    );

    // Shuffle and take requested count
    const shuffled = prerequisiteMCQs.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    log(`Selected ${selected.length} prerequisite MCQs from topics: ${topicsToInclude.join(', ')}`);

    return selected;
}

/**
 * Clear a topic from the queue (after it's been adequately reinforced)
 */
export function clearQueuedTopic(topic: string): void {
    const queue = getConceptQueue();
    const filtered = queue.filter(q => q.topic !== topic);
    saveConceptQueue(filtered);
    log(`Cleared ${topic} from prerequisite queue`);
}

/**
 * Check if user has mastered prerequisite (>70% accuracy, 5+ attempts)
 * If so, remove from queue
 */
export function checkAndClearMasteredPrerequisites(): string[] {
    const queue = getConceptQueue();
    const allMCQs = getAllMCQs();
    const clearedTopics: string[] = [];

    for (const item of queue) {
        const topicMCQs = allMCQs.filter(mcq => mcq.topic === item.topic && mcq.timesAttempted > 0);

        if (topicMCQs.length >= 5) {
            const totalCorrect = topicMCQs.reduce((sum, m) => sum + m.correctAttempts, 0);
            const totalAttempts = topicMCQs.reduce((sum, m) => sum + m.timesAttempted, 0);
            const accuracy = totalCorrect / totalAttempts;

            if (accuracy >= 0.7) {
                clearedTopics.push(item.topic);
                log(`${item.topic} mastered (${Math.round(accuracy * 100)}%), clearing from queue`);
            }
        }
    }

    // Remove mastered topics
    const remaining = queue.filter(q => !clearedTopics.includes(q.topic));
    saveConceptQueue(remaining);

    return clearedTopics;
}

/**
 * Get queue status for debugging
 */
export function getConceptQueueStatus(): {
    queuedTopics: string[];
    totalPriority: number;
    oldestEntry: number | null;
} {
    const queue = getConceptQueue();

    return {
        queuedTopics: queue.map(q => q.topic),
        totalPriority: queue.reduce((sum, q) => sum + q.priority, 0),
        oldestEntry: queue.length > 0 ? Math.min(...queue.map(q => q.addedAt)) : null
    };
}

/**
 * Process a wrong answer - queue prerequisites and return insight
 */
export function processWrongAnswer(topic: string): {
    queuedPrerequisites: string[];
    relatedConcepts: string[];
    message?: string;
} {
    const queued = queuePrerequisites(topic);
    const related = getRelatedConcepts(topic);

    // Check and clear mastered topics
    checkAndClearMasteredPrerequisites();

    let message: string | undefined;
    if (queued.length > 0) {
        message = `Building foundation: ${queued.join(', ')}`;
    }

    return {
        queuedPrerequisites: queued,
        relatedConcepts: related,
        message
    };
}
