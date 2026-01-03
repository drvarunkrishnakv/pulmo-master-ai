import React, { useState, useEffect, useMemo } from 'react';
import { getMistakePatterns, getTimeAnalysis, formatTime } from '../services/mistakePatternService';
import { useTheme } from '../contexts/ThemeContext';

const AnalyticsInsights: React.FC = () => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    // Try to get from cache immediately (synchronous)
    const cachedData = useMemo(() => ({
        timeStats: getTimeAnalysis(),
        patterns: getMistakePatterns()
    }), []);

    const [stats, setStats] = useState(cachedData);
    const [isLoading, setIsLoading] = useState(false);

    // If cache was hit, we already have data - no loading needed
    useEffect(() => {
        // Data is already loaded from cache via useMemo
        if (cachedData.timeStats || cachedData.patterns) {
            setStats(cachedData);
            setIsLoading(false);
        }
    }, [cachedData]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
                <div className="bg-gray-100 rounded-xl h-32"></div>
                <div className="bg-gray-100 rounded-xl h-32"></div>
            </div>
        );
    }

    const { timeStats, patterns } = stats;
    const hasTimeStats = timeStats && timeStats.totalQuestionsWithTime > 0;
    const hasPatterns = patterns && patterns.totalWrongAnswers > 0;

    if (!hasTimeStats && !hasPatterns) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-500">
            {/* Time Analysis Section */}
            {hasTimeStats && (
                <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
                    }`}>
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">⏱️</span>
                        <div>
                            <h3 className={`font-bold text-sm ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Time Analysis</h3>
                            <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Avg: {timeStats.overallAvgTimeSeconds}s per question</p>
                        </div>
                    </div>

                    {timeStats.slowestTopics.length > 0 && (
                        <div className="space-y-2">
                            <p className={`text-[10px] uppercase font-medium ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Slowest Topics</p>
                            {timeStats.slowestTopics.slice(0, 3).map((topic: any, idx: number) => (
                                <div key={topic.topic} className="flex items-center gap-2">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${idx === 0 ?
                                        (isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-600') :
                                        (isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-100 text-gray-600')
                                        }`}>
                                        {idx + 1}
                                    </span>
                                    <span className={`flex-1 text-xs truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{topic.topic}</span>
                                    <span className={`text-xs font-bold ${topic.isSlowTopic ?
                                        (isDark ? 'text-red-400' : 'text-red-600') :
                                        (isDark ? 'text-slate-400' : 'text-gray-600')
                                        }`}>
                                        {formatTime(topic.avgTimeMs)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Mistake Patterns Section */}
            {hasPatterns && (
                <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
                    }`}>
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">🔄</span>
                        <div>
                            <h3 className={`font-bold text-sm ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Mistake Patterns</h3>
                            <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>{patterns.totalWrongAnswers} wrong answers analyzed</p>
                        </div>
                    </div>

                    {patterns.mostConfusedPairs.length > 0 && (
                        <div className="space-y-2">
                            <p className={`text-[10px] uppercase font-medium ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Common Confusions</p>
                            {patterns.mostConfusedPairs.slice(0, 3).map((pair: any, idx: number) => (
                                <div key={`${pair.correctOption}-${pair.wrongOption}`} className={`flex items-center gap-2 rounded-lg p-2 ${isDark ? 'bg-amber-900/20 border border-amber-500/20' : 'bg-amber-50'
                                    }`}>
                                    <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                                        When <span className={`font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>{pair.correctOption}</span> is correct,
                                    </span>
                                    <span className="text-xs">
                                        you pick <span className={`font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>{pair.wrongOption}</span>
                                    </span>
                                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-bold ${isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-200 text-amber-800'
                                        }`}>
                                        {pair.count}×
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {patterns.optionBias.length > 0 && patterns.optionBias[0].percentage > 30 && (
                        <div className={`mt-3 p-2 rounded-lg ${isDark ? 'bg-purple-900/20 border border-purple-500/20' : 'bg-purple-50'
                            }`}>
                            <p className={`text-[10px] ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>
                                💡 <span className="font-medium">Tip:</span> You tend to pick "{patterns.optionBias[0].option}"
                                ({patterns.optionBias[0].percentage}%) when wrong. Watch out for this bias!
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AnalyticsInsights;
