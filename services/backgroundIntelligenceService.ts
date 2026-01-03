/**
 * Background Intelligence Service
 * 
 * Invisible optimizations that run during idle time:
 * - Pre-caches upcoming quiz sessions
 * - Pre-warms analytics data
 * - Refreshes stale caches
 * 
 * All operations are completely invisible to the user.
 * Enable debug mode: localStorage.setItem('debug_intelligence', 'true')
 */

import { getSmartMCQSelection, getOptimalStudySession } from './smartSelectionService';
import { getSkillCategoryStats, getFlashcardCategoryStats, clearSkillCategoryCache } from './skillCategoryService';
import { getMistakePatterns, getTimeAnalysis, clearInsightsCache } from './mistakePatternService';
import { analyticsCache } from './analyticsCache';

// Debug logging
const DEBUG = () => localStorage.getItem('debug_intelligence') === 'true';
const log = (msg: string, ...args: any[]) => {
    if (DEBUG()) console.log(`🧠 [BackgroundIntel] ${msg}`, ...args);
};

// ============================================
// PREEMPTIVE CACHING
// ============================================

interface PreloadedSession {
    mcqs: any[];
    generatedAt: number;
    reason: string;
}

let preloadedSession: PreloadedSession | null = null;
const PRELOAD_STALE_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Get preloaded session if available and fresh
 */
export function getPreloadedSession(): PreloadedSession | null {
    if (!preloadedSession) return null;

    const age = Date.now() - preloadedSession.generatedAt;
    if (age > PRELOAD_STALE_MS) {
        log('Preloaded session expired, discarding');
        preloadedSession = null;
        return null;
    }

    log(`Returning preloaded session (${preloadedSession.mcqs.length} MCQs, ${preloadedSession.reason})`);
    const session = preloadedSession;
    preloadedSession = null; // Consume it
    return session;
}

/**
 * Preload next likely study session during idle time
 */
function preloadNextSession(): void {
    try {
        const session = getOptimalStudySession(15);

        if (session.mcqs.length > 0) {
            preloadedSession = {
                mcqs: session.mcqs,
                generatedAt: Date.now(),
                reason: `${session.breakdown.dueForReview} due, ${session.breakdown.weakSpots} weak, ${session.breakdown.newContent} new`
            };
            log(`Pre-cached session: ${session.mcqs.length} MCQs`, session.breakdown);
        }
    } catch (e) {
        log('Failed to preload session:', e);
    }
}

// ============================================
// ANALYTICS PRE-WARMING
// ============================================

let analyticsPreWarmed = false;

/**
 * Pre-warm analytics caches during idle time
 * This ensures the Analytics tab opens instantly
 */
function preWarmAnalytics(): void {
    if (analyticsPreWarmed && analyticsCache.hasValidCache()) {
        log('Analytics already pre-warmed, skipping');
        return;
    }

    try {
        log('Pre-warming analytics caches...');
        const startTime = performance.now();

        // Trigger cache population
        getSkillCategoryStats();
        getFlashcardCategoryStats();
        getMistakePatterns();
        getTimeAnalysis();

        const elapsed = Math.round(performance.now() - startTime);
        log(`Analytics pre-warmed in ${elapsed}ms`);
        analyticsPreWarmed = true;
    } catch (e) {
        log('Failed to pre-warm analytics:', e);
    }
}

// ============================================
// STALE DATA REFRESH
// ============================================

let lastRefreshTime = 0;
const REFRESH_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Refresh stale caches in background
 * Called when user is idle (e.g., reading explanation)
 */
export function refreshStaleCaches(): void {
    const now = Date.now();
    if (now - lastRefreshTime < REFRESH_INTERVAL_MS) {
        return; // Too soon
    }

    log('Refreshing stale caches...');
    lastRefreshTime = now;

    // Clear and rebuild caches
    clearSkillCategoryCache();
    clearInsightsCache();
    analyticsCache.clear();

    // Schedule rebuild during idle
    scheduleIdleWork(() => {
        preWarmAnalytics();
    });
}

// ============================================
// IDLE SCHEDULER
// ============================================

type IdleTask = () => void;
const idleQueue: IdleTask[] = [];
let idleScheduled = false;

function scheduleIdleWork(task: IdleTask): void {
    idleQueue.push(task);

    if (!idleScheduled) {
        idleScheduled = true;

        const runIdle = () => {
            const task = idleQueue.shift();
            if (task) {
                try {
                    task();
                } catch (e) {
                    log('Idle task failed:', e);
                }
            }

            if (idleQueue.length > 0) {
                requestIdleCallback(runIdle);
            } else {
                idleScheduled = false;
            }
        };

        // Use requestIdleCallback if available, otherwise setTimeout
        if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(runIdle, { timeout: 5000 });
        } else {
            setTimeout(runIdle, 100);
        }
    }
}

// ============================================
// INITIALIZATION
// ============================================

let initialized = false;

/**
 * Initialize background intelligence
 * Call this once from App.tsx after initial render
 */
export function initBackgroundIntelligence(): void {
    if (initialized) return;
    initialized = true;

    log('Initializing background intelligence...');

    // Initialize cloud sync after 2 seconds
    setTimeout(async () => {
        try {
            const { initBackgroundSync } = await import('./backgroundSyncService');
            await initBackgroundSync();
            log('Cloud sync initialized');
        } catch (e) {
            log('Cloud sync init failed (may be offline):', e);
        }
    }, 2000);

    // Pre-warm analytics after 3 seconds (let UI settle first)
    setTimeout(() => {
        scheduleIdleWork(preWarmAnalytics);
    }, 3000);

    // Pre-load next session after 5 seconds
    setTimeout(() => {
        scheduleIdleWork(preloadNextSession);
    }, 5000);

    // Set up periodic refresh every 3 minutes
    setInterval(() => {
        scheduleIdleWork(() => {
            if (!analyticsCache.hasValidCache()) {
                preWarmAnalytics();
            }
            if (!preloadedSession) {
                preloadNextSession();
            }
        });
    }, REFRESH_INTERVAL_MS);

    log('Background intelligence initialized');
}

// ============================================
// HOOKS FOR COMPONENTS TO TRIGGER REFRESH
// ============================================

/**
 * Call when user is reading (idle opportunity)
 * e.g., reading quiz explanation for 5+ seconds
 */
export function onUserIdle(): void {
    log('User idle detected, scheduling background work');
    scheduleIdleWork(preWarmAnalytics);
    scheduleIdleWork(preloadNextSession);
}

/**
 * Call after quiz completion to refresh stats and sync to cloud
 */
export function onQuizComplete(): void {
    log('Quiz complete, scheduling cache refresh and cloud sync');

    // Refresh caches
    setTimeout(() => {
        scheduleIdleWork(refreshStaleCaches);
    }, 1000);

    // Trigger cloud sync
    import('./backgroundSyncService').then(({ scheduleSyncToCloud }) => {
        scheduleSyncToCloud();
    }).catch(() => { });
}

/**
 * Call when switching to Analytics tab
 * If cache is cold, this triggers immediate warm-up
 */
export function onAnalyticsTabOpen(): void {
    if (!analyticsCache.hasValidCache()) {
        log('Analytics cold start - warming immediately');
        preWarmAnalytics();
    }
}
