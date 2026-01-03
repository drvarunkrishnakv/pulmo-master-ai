
interface AnalyticsCache {
    bookStats: any[] | null;
    overallStats: { total: number; attempted: number; accuracy: number } | null;
    timestamp: number;
}

const cache: AnalyticsCache = {
    bookStats: null,
    overallStats: null,
    timestamp: 0
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const analyticsCache = {
    get: () => {
        const now = Date.now();
        if (now - cache.timestamp < CACHE_DURATION) {
            return {
                bookStats: cache.bookStats,
                overallStats: cache.overallStats
            };
        }
        return { bookStats: null, overallStats: null };
    },

    set: (bookStats: any[], overallStats: any) => {
        cache.bookStats = bookStats;
        cache.overallStats = overallStats;
        cache.timestamp = Date.now();
    },

    hasValidCache: () => {
        return (Date.now() - cache.timestamp < CACHE_DURATION) && !!cache.bookStats;
    },

    clear: () => {
        cache.bookStats = null;
        cache.overallStats = null;
        cache.timestamp = 0;
    }
};
