import React, { useMemo, useState, useEffect } from 'react';
import { getAllMCQs, areBundledMCQsLoaded } from '../services/mcqBankService';
import { getSRSStats, getDueMCQs } from '../services/srsService';
import { useTheme } from '../contexts/ThemeContext';

// Haptic feedback
const vibrate = (pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

interface SmartRevisionProps {
    onStartPractice?: () => void;
}

const SmartRevision: React.FC<SmartRevisionProps> = ({ onStartPractice }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Track when bundled MCQs finish loading
    const [mcqsLoaded, setMcqsLoaded] = useState(() => areBundledMCQsLoaded());

    useEffect(() => {
        if (mcqsLoaded) return;
        const interval = setInterval(() => {
            if (areBundledMCQsLoaded()) {
                setMcqsLoaded(true);
                clearInterval(interval);
            }
        }, 200);
        return () => clearInterval(interval);
    }, [mcqsLoaded]);

    // Get SRS stats
    const stats = useMemo(() => {
        const allMCQs = getAllMCQs();
        const srsStats = getSRSStats(allMCQs);
        const dueMCQs = getDueMCQs(allMCQs);

        // Calculate overdue (due more than 1 day ago)
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const overdue = dueMCQs.filter(m =>
            m.srsNextReviewAt && m.srsNextReviewAt < oneDayAgo
        ).length;

        return {
            ...srsStats,
            overdue,
            totalDue: srsStats.dueToday
        };
    }, [mcqsLoaded]);

    // Determine status and colors
    const getStatus = () => {
        if (stats.totalDue === 0) {
            return {
                status: 'complete',
                color: isDark ? 'text-emerald-400' : 'text-emerald-500',
                ringColor: isDark ? '#10b981' : '#10b981',
                bgGlow: isDark ? 'shadow-[0_0_20px_rgba(16,185,129,0.2)]' : ''
            };
        }
        if (stats.overdue > 0) {
            return {
                status: 'overdue',
                color: isDark ? 'text-rose-400' : 'text-rose-500',
                ringColor: isDark ? '#f43f5e' : '#ef4444',
                bgGlow: isDark ? 'shadow-[0_0_20px_rgba(244,63,94,0.2)]' : ''
            };
        }
        return {
            status: 'due',
            color: isDark ? 'text-amber-400' : 'text-amber-500',
            ringColor: isDark ? '#f59e0b' : '#f59e0b',
            bgGlow: isDark ? 'shadow-[0_0_20px_rgba(245,158,11,0.15)]' : ''
        };
    };

    const { status, color, ringColor, bgGlow } = getStatus();

    // Calculate ring progress (inverse: 100% when all done, 0% when many due)
    // We'll show percentage of "caught up" state
    const totalAttempted = stats.masteredQuestions + stats.dueToday + stats.weakTopics;
    const progressPercent = totalAttempted > 0
        ? Math.round((stats.masteredQuestions / Math.max(totalAttempted, 1)) * 100)
        : 0;

    // Ring calculations
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (Math.min(progressPercent, 100) / 100) * circumference;

    const handleClick = () => {
        vibrate(15);
        if (onStartPractice) {
            onStartPractice();
        }
    };

    return (
        <div
            onClick={handleClick}
            className={`relative overflow-hidden h-full min-h-[160px] rounded-2xl p-4 flex flex-col cursor-pointer group transition-all duration-300 border ${bgGlow} ${isDark
                ? 'bg-slate-900 border-slate-700 hover:border-blue-500/50'
                : 'bg-white border-slate-100 shadow-sm hover:shadow-md hover:border-blue-500/30'
                }`}
        >
            {/* Background Effect */}
            {isDark ? (
                <div className="absolute inset-0 bg-slate-900">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.08),transparent_70%)]" />
                </div>
            ) : (
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-50 via-transparent to-transparent opacity-50 pointer-events-none" />
            )}

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center w-full h-full">
                {/* Ring Progress */}
                <div className="relative w-20 h-20 mb-2">
                    <svg className="w-full h-full transform -rotate-90">
                        {/* Background ring */}
                        <circle
                            cx="40"
                            cy="40"
                            r={radius}
                            stroke={isDark ? '#1e293b' : '#f1f5f9'}
                            strokeWidth="6"
                            fill="none"
                            className="transition-colors duration-300"
                        />
                        {/* Progress ring */}
                        <circle
                            cx="40"
                            cy="40"
                            r={radius}
                            stroke={ringColor}
                            strokeWidth="6"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            className={`transition-all duration-700 ease-out ${status === 'complete'
                                ? 'drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                                : status === 'overdue'
                                    ? 'drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                                    : isDark
                                        ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                                        : 'drop-shadow-md'
                                }`}
                        />
                    </svg>

                    {/* Center content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {status === 'complete' ? (
                            <span className="text-2xl">✓</span>
                        ) : (
                            <>
                                <span className={`text-xl font-black ${color}`}>
                                    {stats.totalDue}
                                </span>
                                <span className={`text-[10px] font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    due
                                </span>
                            </>
                        )}
                    </div>

                    {/* Pulse animation for overdue */}
                    {status === 'overdue' && (
                        <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-rose-500" style={{ animationDuration: '2s' }} />
                    )}
                </div>

                {/* Title */}
                <h3 className={`font-bold text-sm mb-1 ${isDark ? 'text-gray-200' : 'text-slate-700'}`}>
                    🧠 Smart Revision
                </h3>

                {/* Status message */}
                <p className={`text-[10px] font-medium mb-2 ${status === 'complete'
                    ? 'text-emerald-500'
                    : status === 'overdue'
                        ? 'text-rose-500 animate-pulse'
                        : isDark ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                    {status === 'complete'
                        ? 'All Caught Up! 🌟'
                        : status === 'overdue'
                            ? `${stats.overdue} overdue!`
                            : 'Tap to review'
                    }
                </p>

                {/* Footer stats */}
                <div className={`w-full mt-auto pt-2 border-t flex justify-between text-[9px] font-bold uppercase tracking-wide ${isDark ? 'border-slate-800 text-slate-600' : 'border-slate-100 text-slate-400'
                    }`}>
                    <div className="text-center flex-1">
                        <span className={stats.weakTopics > 0 ? (isDark ? 'text-amber-400' : 'text-amber-500') : ''}>
                            {stats.weakTopics}
                        </span>
                        <span className="ml-1">weak</span>
                    </div>
                    <div className={`text-center flex-1 border-x ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                        <span className={isDark ? 'text-emerald-400' : 'text-emerald-500'}>
                            {stats.masteredQuestions}
                        </span>
                        <span className="ml-1">solid</span>
                    </div>
                    <div className="text-center flex-1">
                        <span className={isDark ? 'text-blue-400' : 'text-blue-500'}>
                            {stats.newQuestions}
                        </span>
                        <span className="ml-1">new</span>
                    </div>
                </div>
            </div>

            {/* Hover glow */}
            <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'blur-sm' : ''}`} />
        </div>
    );
};

export default SmartRevision;
