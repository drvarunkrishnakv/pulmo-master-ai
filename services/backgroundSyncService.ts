/**
 * Background Sync Service
 * 
 * Invisibly syncs user progress data to Firestore:
 * - Debounced sync after quiz completion
 * - Merges cloud + local data on app load
 * - Conflict resolution (latest timestamp wins)
 * 
 * All sync is invisible - no loading indicators or user prompts.
 * Enable debug: localStorage.setItem('debug_intelligence', 'true')
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Debug logging
const DEBUG = () => localStorage.getItem('debug_intelligence') === 'true';
const log = (msg: string, ...args: any[]) => {
    if (DEBUG()) console.log(`☁️ [BackgroundSync] ${msg}`, ...args);
};

// Keys for localStorage data we sync
const SYNC_KEYS = {
    MCQ_STATS: 'pulmo_mcq_stats',           // MCQ attempt stats
    MEMORY_STATS: 'pulmo_memory_stats',     // Memory strength data
    STREAK_DATA: 'pulmo_streak_data',       // Streak tracking
    DAILY_GOAL: 'pulmo_daily_goal',         // Daily goal progress
    FLASHCARD_SRS: 'pulmo_flashcard_srs',   // Flashcard SRS data
};

// Firestore collection for user data
const USER_DATA_COLLECTION = 'userProgress';

// Debounce tracking
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 10000; // 10 seconds after last activity

// Device ID for conflict resolution
const getDeviceId = (): string => {
    let deviceId = localStorage.getItem('pulmo_device_id');
    if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('pulmo_device_id', deviceId);
    }
    return deviceId;
};

// User ID (for now, anonymous - can be replaced with auth)
const getUserId = (): string => {
    let userId = localStorage.getItem('pulmo_user_id');
    if (!userId) {
        userId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('pulmo_user_id', userId);
    }
    return userId;
};

/**
 * Collect all syncable data from localStorage
 */
function collectLocalData(): Record<string, any> {
    const data: Record<string, any> = {};

    for (const [key, storageKey] of Object.entries(SYNC_KEYS)) {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                data[key] = JSON.parse(stored);
            }
        } catch (e) {
            log(`Failed to read ${key}:`, e);
        }
    }

    return data;
}

/**
 * Apply synced data to localStorage
 */
function applyCloudData(cloudData: Record<string, any>): void {
    for (const [key, storageKey] of Object.entries(SYNC_KEYS)) {
        if (cloudData[key]) {
            try {
                localStorage.setItem(storageKey, JSON.stringify(cloudData[key]));
            } catch (e) {
                log(`Failed to apply ${key}:`, e);
            }
        }
    }
}

/**
 * Merge local and cloud MCQ stats (latest timestamp wins per MCQ)
 */
function mergeMCQStats(local: Record<string, any>, cloud: Record<string, any>): Record<string, any> {
    const merged = { ...cloud };

    for (const [mcqId, localStats] of Object.entries(local)) {
        const cloudStats = cloud[mcqId];

        if (!cloudStats) {
            // Only in local - use local
            merged[mcqId] = localStats;
        } else if ((localStats as any).lastAttemptedAt > (cloudStats as any).lastAttemptedAt) {
            // Local is newer - use local
            merged[mcqId] = localStats;
        }
        // Otherwise cloud is newer, already in merged
    }

    return merged;
}

/**
 * Merge local and cloud data with conflict resolution
 */
function mergeData(local: Record<string, any>, cloud: Record<string, any>): Record<string, any> {
    const merged: Record<string, any> = {};

    // MCQ Stats - per-item merge
    if (local.MCQ_STATS || cloud.MCQ_STATS) {
        merged.MCQ_STATS = mergeMCQStats(local.MCQ_STATS || {}, cloud.MCQ_STATS || {});
    }

    // Memory Stats - per-item merge (same logic)
    if (local.MEMORY_STATS || cloud.MEMORY_STATS) {
        merged.MEMORY_STATS = mergeMCQStats(local.MEMORY_STATS || {}, cloud.MEMORY_STATS || {});
    }

    // Streak Data - use the one with higher streak or most recent
    if (local.STREAK_DATA || cloud.STREAK_DATA) {
        const localStreak = local.STREAK_DATA || {};
        const cloudStreak = cloud.STREAK_DATA || {};

        // Use whichever has the higher current streak, or more recent activity
        if ((localStreak.currentStreak || 0) > (cloudStreak.currentStreak || 0)) {
            merged.STREAK_DATA = localStreak;
        } else if ((cloudStreak.currentStreak || 0) > (localStreak.currentStreak || 0)) {
            merged.STREAK_DATA = cloudStreak;
        } else {
            // Same streak - use most recent
            merged.STREAK_DATA = (localStreak.lastPracticeDate || '') > (cloudStreak.lastPracticeDate || '')
                ? localStreak : cloudStreak;
        }
    }

    // Daily Goal - use most recent date's data
    if (local.DAILY_GOAL || cloud.DAILY_GOAL) {
        const localGoal = local.DAILY_GOAL || {};
        const cloudGoal = cloud.DAILY_GOAL || {};
        merged.DAILY_GOAL = (localGoal.date || '') > (cloudGoal.date || '') ? localGoal : cloudGoal;
    }

    // Flashcard SRS - per-item merge
    if (local.FLASHCARD_SRS || cloud.FLASHCARD_SRS) {
        merged.FLASHCARD_SRS = mergeMCQStats(local.FLASHCARD_SRS || {}, cloud.FLASHCARD_SRS || {});
    }

    return merged;
}

/**
 * Sync local data to Firestore (debounced)
 */
export function scheduleSyncToCloud(): void {
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }

    syncTimeout = setTimeout(async () => {
        await syncToCloud();
    }, SYNC_DEBOUNCE_MS);

    log('Sync scheduled in 10 seconds...');
}

/**
 * Immediately sync to cloud (used internally or for forced sync)
 */
async function syncToCloud(): Promise<void> {
    const userId = getUserId();
    const deviceId = getDeviceId();

    try {
        const localData = collectLocalData();

        if (Object.keys(localData).length === 0) {
            log('No data to sync');
            return;
        }

        const docRef = doc(db, USER_DATA_COLLECTION, userId);

        await setDoc(docRef, {
            ...localData,
            lastSyncedAt: serverTimestamp(),
            lastSyncedFrom: deviceId,
            syncVersion: Date.now()
        }, { merge: true });

        log('Synced to cloud successfully');
    } catch (e) {
        log('Sync failed (will retry later):', e);
    }
}

/**
 * Load and merge cloud data on app startup
 */
export async function loadFromCloud(): Promise<boolean> {
    const userId = getUserId();

    try {
        const docRef = doc(db, USER_DATA_COLLECTION, userId);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            log('No cloud data found, using local');
            return false;
        }

        const cloudData = snapshot.data();
        const localData = collectLocalData();

        // Merge with conflict resolution
        const merged = mergeData(localData, cloudData);

        // Apply merged data
        applyCloudData(merged);

        log('Cloud data merged successfully');
        return true;
    } catch (e) {
        log('Failed to load from cloud:', e);
        return false;
    }
}

/**
 * Force immediate sync (for critical moments like quiz complete)
 */
export async function forceSyncNow(): Promise<void> {
    if (syncTimeout) {
        clearTimeout(syncTimeout);
        syncTimeout = null;
    }
    await syncToCloud();
}

/**
 * Initialize background sync
 * Call this after app loads
 */
export async function initBackgroundSync(): Promise<void> {
    log('Initializing background sync...');

    // Load cloud data and merge
    await loadFromCloud();

    // Schedule periodic sync every 5 minutes
    setInterval(() => {
        scheduleSyncToCloud();
    }, 5 * 60 * 1000);

    // Sync before page unload
    window.addEventListener('beforeunload', () => {
        // Use sendBeacon for reliable delivery
        const data = JSON.stringify(collectLocalData());
        navigator.sendBeacon?.(`/api/sync?userId=${getUserId()}`, data);
    });

    log('Background sync initialized');
}

/**
 * Get sync status for debugging
 */
export function getSyncStatus(): {
    userId: string;
    deviceId: string;
    dataKeys: string[];
    lastScheduledSync: number | null;
} {
    return {
        userId: getUserId(),
        deviceId: getDeviceId(),
        dataKeys: Object.keys(collectLocalData()),
        lastScheduledSync: syncTimeout ? Date.now() : null
    };
}
