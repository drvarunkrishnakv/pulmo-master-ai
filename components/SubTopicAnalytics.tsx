import React, { useState, useMemo, useEffect } from 'react';
import { Book } from '../types';
import { getMCQsByBook, getAllMCQs, getUniqueBooksFromMCQs } from '../services/mcqBankService';
import RioMascot from './RioMascot';
import SkillRadarChart from './SkillRadarChart';
import { AnalyticsSkeleton } from './Skeleton';
import { analyticsCache } from '../services/analyticsCache';
import SubTopicDetails from './SubTopicDetails';
import AnalyticsInsights from './AnalyticsInsights';
import { useTheme } from '../contexts/ThemeContext';

interface SubTopicAnalyticsProps {
    books?: Book[]; // Now optional - will derive from MCQs if not provided
    onStartQuiz?: (bookId: string) => void;
}

const SubTopicAnalytics: React.FC<SubTopicAnalyticsProps> = ({ books: booksProp, onStartQuiz }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [expandedBook, setExpandedBook] = useState<string | null>(null);
    // Check cache immediately on init
    const hasCache = analyticsCache.hasValidCache();
    console.log('📊 Analytics Cache Status:', hasCache ? 'HIT' : 'MISS');

    const [isLoading, setIsLoading] = useState(!hasCache);

    // Derive books from MCQ data if not provided
    const books = useMemo(() => {
        if (booksProp && booksProp.length > 0) return booksProp;
        return getUniqueBooksFromMCQs();
    }, [booksProp]);

    // Calculate overall stats (with caching)
    const overallStats = useMemo(() => {
        const cached = analyticsCache.get();
        if (cached.overallStats) {
            return cached.overallStats;
        }

        const allMCQs = getAllMCQs();
        const attempted = allMCQs.filter(m => m.timesAttempted > 0);
        const totalAttempts = attempted.reduce((sum, m) => sum + m.timesAttempted, 0);
        const totalCorrect = attempted.reduce((sum, m) => sum + m.correctAttempts, 0);
        const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

        const result = {
            total: allMCQs.length,
            attempted: attempted.length,
            accuracy
        };

        // Store in cache (preserve existing bookStats if any)
        const currentCache = analyticsCache.get();
        analyticsCache.set(currentCache.bookStats || [], result);

        return result;
    }, []);

    // Get per-book stats with memory fading detection (with caching)
    const bookStats = useMemo(() => {
        const cached = analyticsCache.get();
        // Only use cache if it has meaningful data (not empty from loading before MCQs were ready)
        const cacheHasData = cached.bookStats && cached.bookStats.length > 0;
        if (cacheHasData) {
            return cached.bookStats;
        }

        const now = Date.now();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

        // Fetch all MCQs once to avoid repeated JSON.parse calls in the loop
        const allMCQs = getAllMCQs();

        const result = books.map(book => {
            // Filter by topic OR bookId (books are derived from topic || bookId)
            const mcqs = allMCQs.filter(m => m.topic === book.id || m.bookId === book.id);

            const attempted = mcqs.filter(m => m.timesAttempted > 0);
            const totalAttempts = attempted.reduce((sum, m) => sum + m.timesAttempted, 0);
            const totalCorrect = attempted.reduce((sum, m) => sum + m.correctAttempts, 0);
            const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : -1;

            // Check last attempt date for memory fading
            const lastAttempted = attempted.length > 0
                ? Math.max(...attempted.map(m => m.lastAttemptedAt || 0))
                : 0;
            const daysSinceLastPractice = lastAttempted > 0
                ? Math.floor((now - lastAttempted) / (24 * 60 * 60 * 1000))
                : -1;
            const memoryFading = daysSinceLastPractice >= 7;

            // Check if due for SRS review
            const dueForReview = mcqs.filter(m =>
                m.srsNextReviewAt && m.srsNextReviewAt <= now
            ).length;

            return {
                id: book.id,
                name: book.name,
                total: mcqs.length,
                attempted: attempted.length,
                accuracy,
                isWeak: accuracy >= 0 && accuracy < 60,
                isStrong: accuracy >= 80,
                memoryFading,
                daysSinceLastPractice,
                dueForReview,
                subTopics: [] // Defer calculation (lazy load)
            };
        }).filter(b => b.total > 0).sort((a, b) => {
            // Prioritize: due for review > weak > memory fading > by accuracy
            if (a.dueForReview > 0 && b.dueForReview === 0) return -1;
            if (a.dueForReview === 0 && b.dueForReview > 0) return 1;
            if (a.isWeak && !b.isWeak) return -1;
            if (!a.isWeak && b.isWeak) return 1;
            if (a.memoryFading && !b.memoryFading) return -1;
            if (!a.memoryFading && b.memoryFading) return 1;
            if (a.accuracy === -1) return 1;
            if (b.accuracy === -1) return -1;
            return a.accuracy - b.accuracy;
        });

        // Store in cache (preserve existing overallStats)
        const currentCache = analyticsCache.get();
        // Use current overallStats if available, otherwise just keep what's in cache (which might be null if order differs, but likely handled)
        // Alternatively, since overallStats is computed before this useMemo, we can just grab it?
        // Actually, let's just use what's in cache. calling get() inside set() logic is safest.
        analyticsCache.set(result, currentCache.overallStats);

        return result;
    }, [books]);

    const weakCount = bookStats.filter(b => b.isWeak).length;
    const fadingCount = bookStats.filter(b => b.memoryFading && !b.isWeak).length;
    const dueCount = bookStats.reduce((sum, b) => sum + b.dueForReview, 0);

    // Rio's insight message
    const getRioInsight = (): { message: string; urgency: 'good' | 'warning' | 'action' } => {
        if (dueCount > 10) {
            return { message: `${dueCount} questions due for review! Let's refresh your memory 🧠`, urgency: 'action' };
        }
        if (weakCount >= 3) {
            return { message: `${weakCount} topics need attention. Start with the weakest! 💪`, urgency: 'action' };
        }
        if (weakCount > 0) {
            const weakest = bookStats.find(b => b.isWeak);
            return { message: `Focus on "${weakest?.name}" - you can improve! 🎯`, urgency: 'warning' };
        }
        if (fadingCount > 0) {
            return { message: `${fadingCount} topic${fadingCount > 1 ? 's' : ''} haven't been touched in a week ⏰`, urgency: 'warning' };
        }
        if (overallStats.accuracy >= 80) {
            return { message: "You're crushing it! Keep up the momentum 🔥", urgency: 'good' };
        }
        if (overallStats.attempted === 0) {
            return { message: "Ready to start your journey? Pick any topic! 📚", urgency: 'good' };
        }
        return { message: "All caught up! Great job staying consistent 🌟", urgency: 'good' };
    };

    const rioInsight = getRioInsight();

    // Set loading to false immediately after first render if cache was hit
    // The skeleton only shows on first load (cache miss)
    useEffect(() => {
        // Cache hit - data is already available
        if (hasCache) {
            setIsLoading(false);
        } else {
            // Cache miss on first mount - show skeleton briefly then load
            requestAnimationFrame(() => setIsLoading(false));
        }
    }, [hasCache]);

    // Show skeleton while loading
    if (isLoading) {
        return <AnalyticsSkeleton />;
    }

    // Get visual indicator classes
    const getIndicatorClasses = (stat: typeof bookStats[0]) => {
        if (stat.dueForReview > 0) return 'ring-2 ring-blue-400 ring-offset-1';
        if (stat.isWeak) return 'border-red-300 bg-gradient-to-r from-red-50 to-white';
        if (stat.memoryFading) return 'border-amber-300 bg-gradient-to-r from-amber-50 to-white';
        if (stat.isStrong) return 'border-green-300 bg-gradient-to-r from-green-50 to-white';
        return '';
    };

    const getStatusDot = (stat: typeof bookStats[0]) => {
        if (stat.accuracy === -1) return 'bg-gray-300';
        if (stat.isStrong) return 'bg-green-500 animate-pulse';
        if (stat.accuracy >= 50) return 'bg-yellow-500';
        return 'bg-red-500 animate-pulse';
    };

    if (books.length === 0) {
        return (
            <div className={`rounded-xl border p-6 md:p-8 text-center ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
                }`}>
                <div className="text-4xl mb-3">📊</div>
                <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>No topics available</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4 md:space-y-6 px-2">
            {/* Header */}
            <header className="text-center py-2 md:py-4">
                <h2 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-800'
                    }`}>Analytics</h2>
                <p className={`text-xs md:text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'
                    }`}>Track your performance and weak areas</p>
            </header>

            {/* Rio's Insight Card */}
            <div className={`flex items-center gap-3 p-3 md:p-4 rounded-xl border ${rioInsight.urgency === 'action' ?
                (isDark ? 'bg-gradient-to-r from-red-900/20 to-orange-900/20 border-red-500/30' : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200') :
                rioInsight.urgency === 'warning' ?
                    (isDark ? 'bg-gradient-to-r from-amber-900/20 to-yellow-900/20 border-amber-500/30' : 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200') :
                    (isDark ? 'bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-500/30' : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200')
                }`}>
                <div className="flex-shrink-0">
                    <RioMascot
                        state={rioInsight.urgency === 'action' ? 'suggesting' : 'celebrating'}
                        size="small"
                        position="inline"
                        variant="inline"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-xs md:text-sm font-medium ${rioInsight.urgency === 'action' ?
                        (isDark ? 'text-red-400' : 'text-red-800') :
                        rioInsight.urgency === 'warning' ?
                            (isDark ? 'text-amber-400' : 'text-amber-800') :
                            (isDark ? 'text-green-400' : 'text-green-800')
                        }`}>
                        {rioInsight.message}
                    </p>
                </div>
                {weakCount > 0 && onStartQuiz && (
                    <button
                        onClick={() => {
                            const weakest = bookStats.find(b => b.isWeak);
                            if (weakest) onStartQuiz(weakest.id);
                        }}
                        className="flex-shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Practice
                    </button>
                )}
            </div>

            {/* Overall Stats - Responsive grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4">
                <div className={`rounded-lg md:rounded-xl border p-2 md:p-4 text-center min-w-0 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
                    }`}>
                    <p className={`text-lg md:text-3xl font-bold truncate ${isDark ? 'text-gray-100' : 'text-gray-800'
                        }`}>{overallStats.total}</p>
                    <p className={`text-[9px] md:text-xs uppercase ${isDark ? 'text-slate-500' : 'text-gray-500'
                        }`}>Total</p>
                </div>
                <div className={`rounded-lg md:rounded-xl border p-2 md:p-4 text-center min-w-0 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
                    }`}>
                    <p className={`text-lg md:text-3xl font-bold truncate ${isDark ? 'text-blue-400' : 'text-blue-600'
                        }`}>{overallStats.attempted}</p>
                    <p className={`text-[9px] md:text-xs uppercase ${isDark ? 'text-slate-500' : 'text-gray-500'
                        }`}>Attempted</p>
                </div>
                <div className={`rounded-lg md:rounded-xl border p-2 md:p-4 text-center min-w-0 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
                    }`}>
                    <p className={`text-lg md:text-3xl font-bold ${overallStats.accuracy >= 70 ?
                        (isDark ? 'text-green-400' : 'text-green-600') :
                        overallStats.accuracy >= 50 ?
                            (isDark ? 'text-yellow-400' : 'text-yellow-600') :
                            (isDark ? 'text-red-400' : 'text-red-600')
                        }`}>
                        {overallStats.accuracy}%
                    </p>
                    <p className={`text-[9px] md:text-xs uppercase ${isDark ? 'text-slate-500' : 'text-gray-500'
                        }`}>Accuracy</p>
                </div>
            </div>

            {/* Skill Radar Chart */}
            <div className="w-full overflow-hidden">
                <SkillRadarChart />
            </div>

            {/* Time Analysis & Mistake Patterns */}
            {/* Time Analysis & Mistake Patterns (Lazy Loaded) */}
            <div className="w-full overflow-hidden">
                <AnalyticsInsights />
            </div>

            {/* Performance by Topic */}
            {bookStats.length > 0 ? (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className={`font-bold text-sm md:text-base ${isDark ? 'text-gray-100' : 'text-gray-800'
                                }`}>Performance by Topic</h3>
                            <p className={`text-[10px] md:text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'
                                }`}>Tap to expand sections</p>
                        </div>
                        {/* Legend */}
                        <div className={`hidden md:flex items-center gap-3 text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'
                            }`}>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Strong</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> OK</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Weak</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {bookStats.map((stat) => (
                            <div key={stat.id}>
                                {/* Book Row */}
                                <div
                                    onClick={() => setExpandedBook(expandedBook === stat.id ? null : stat.id)}
                                    className={`rounded-lg md:rounded-xl border p-2.5 md:p-4 flex items-center gap-2 cursor-pointer transition-all hover:shadow-md ${getIndicatorClasses(stat)} ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
                                        }`}
                                >
                                    {/* Status Indicator */}
                                    <div className={`flex-shrink-0 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${getStatusDot(stat)}`} />

                                    {/* Name & Stats */}
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                        <div className="flex items-center gap-1.5">
                                            <p className={`font-medium text-xs md:text-base truncate ${stat.isWeak ?
                                                (isDark ? 'text-red-400' : 'text-red-800') :
                                                (isDark ? 'text-gray-100' : 'text-gray-800')
                                                }`}>
                                                {stat.name}
                                            </p>
                                            {/* Memory Fading Badge */}
                                            {stat.memoryFading && (
                                                <span className="flex-shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] md:text-[10px] font-medium rounded-full">
                                                    ⏰ {stat.daysSinceLastPractice}d ago
                                                </span>
                                            )}
                                            {/* Due for Review Badge */}
                                            {stat.dueForReview > 0 && (
                                                <span className="flex-shrink-0 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[8px] md:text-[10px] font-medium rounded-full">
                                                    🔄 {stat.dueForReview} due
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-[9px] md:text-xs truncate ${isDark ? 'text-slate-500' : 'text-gray-500'
                                            }`}>
                                            {stat.total} MCQs • {stat.attempted} done
                                        </p>
                                    </div>

                                    {/* Accuracy */}
                                    <div className="text-right flex-shrink-0 min-w-[40px]">
                                        {stat.accuracy >= 0 ? (
                                            <p className={`text-sm md:text-lg font-bold ${stat.isStrong ?
                                                (isDark ? 'text-green-400' : 'text-green-600') :
                                                stat.accuracy >= 50 ?
                                                    (isDark ? 'text-yellow-400' : 'text-yellow-600') :
                                                    (isDark ? 'text-red-400' : 'text-red-600')
                                                }`}>
                                                {stat.accuracy}%
                                            </p>
                                        ) : (
                                            <p className="text-[9px] md:text-xs text-gray-400">—</p>
                                        )}
                                    </div>

                                    {onStartQuiz && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onStartQuiz(stat.id);
                                            }}
                                            className={`hidden md:block flex-shrink-0 px-2.5 py-1 text-[10px] font-medium rounded-lg transition-colors ${isDark ? 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                                }`}
                                        >
                                            Practice
                                        </button>
                                    )}

                                    {/* Expand Arrow */}
                                    <svg
                                        className={`w-4 h-4 transition-transform ${expandedBook === stat.id ? 'rotate-180' : ''} ${isDark ? 'text-slate-500' : 'text-gray-400'
                                            }`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>

                                {/* Expanded Subtopics */}
                                {expandedBook === stat.id && (
                                    <SubTopicDetails bookId={stat.id} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="bg-gray-50 rounded-xl border p-6 md:p-8 text-center">
                    <div className="text-4xl mb-3">🎯</div>
                    <p className="text-gray-600 font-medium">No MCQs generated yet</p>
                    <p className="text-sm text-gray-400 mt-1">Generate quizzes from the Dashboard to see analytics</p>
                </div>
            )}

            {/* Tips */}
            <div className="text-center text-xs md:text-sm text-gray-400 py-2">
                📚 {books.length} topics available • {bookStats.reduce((sum, b) => sum + b.total, 0)} MCQs
            </div>
        </div >
    );
};

export default SubTopicAnalytics;
