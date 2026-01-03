import React, { useState, useEffect, useMemo } from 'react';
import {
    getDailyGoal,
    setDailyGoal,
    getTodayProgress,
    getGoalCompletionPercent,
    getRemainingQuestions,
    isGoalCompleted
} from '../services/dailyGoalService';
import { getDaysUntilExam } from '../services/streakService';
import { getAllMCQs } from '../services/mcqBankService';
import confetti from 'canvas-confetti';
import { useTheme } from '../contexts/ThemeContext';

interface DailyGoalProps { }

const DailyGoal: React.FC<DailyGoalProps> = () => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [goal, setGoal] = useState(getDailyGoal());
    const [progress, setProgress] = useState(getTodayProgress());
    const [isEditing, setIsEditing] = useState(false);
    const [tempGoal, setTempGoal] = useState(goal.questionsTarget);

    // Smart Goal Logic
    const smartGoal = useMemo(() => {
        const days = getDaysUntilExam();
        if (days === null || days <= 0) return 30; // Default

        const allMCQs = getAllMCQs();
        const attemptedCount = allMCQs.filter(m => m.timesAttempted > 0).length;
        const remaining = allMCQs.length - attemptedCount;

        // Simple pacing: Finish remaining questions by exam date
        // Buffer: Aim to finish 14 days before exam for revision
        const daysToFinish = Math.max(1, days - 14);
        const neededPerDay = Math.ceil(remaining / daysToFinish);

        // Cap it reasonably (e.g., don't suggest 500/day)
        return Math.min(Math.max(neededPerDay, 20), 150);
    }, []);

    // Refresh progress periodically
    useEffect(() => {
        const interval = setInterval(() => {
            const newProgress = getTodayProgress();
            setProgress(newProgress);

            // Check for completion to trigger confetti (once per session ideally, but simplified here)
            if (newProgress.questionsCompleted >= goal.questionsTarget &&
                progress.questionsCompleted < goal.questionsTarget) {
                fireConfetti();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [progress.questionsCompleted, goal.questionsTarget]);

    const fireConfetti = () => {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: isDark
                ? ['#60A5FA', '#3B82F6', '#6366F1', '#ffffff'] // Neon blues for dark
                : ['#60A5FA', '#3B82F6', '#2563EB', '#ffffff'] // Standard blues for light
        });
    };

    const completionPercent = getGoalCompletionPercent();
    const completed = isGoalCompleted();

    // Safe radius for rings
    const radius = 36;
    const circumference = 2 * Math.PI * radius;

    const handleSaveGoal = () => {
        setDailyGoal(tempGoal);
        setGoal({ ...goal, questionsTarget: tempGoal });
        setIsEditing(false);
    };

    return (
        <div className={`relative overflow-hidden h-full min-h-[160px] rounded-2xl p-4 flex flex-col items-center justify-center transition-all duration-300 border ${isDark
                ? 'bg-slate-900 border-slate-700 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                : 'bg-white border-slate-100 shadow-sm'
            }`}>
            {/* Background Effects */}
            {isDark ? (
                <div className="absolute inset-0 bg-slate-900">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.1),transparent_70%)]" />
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-50 blur-sm" />
                </div>
            ) : (
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-50 via-transparent to-transparent opacity-70 pointer-events-none" />
            )}

            <div className="relative z-10 flex flex-col items-center w-full">
                {/* Modern Progress Ring */}
                <div className="relative w-20 h-20 mb-3 group cursor-pointer" onClick={() => !isEditing && setIsEditing(true)}>
                    <svg className="w-full h-full transform -rotate-90">
                        {/* Background track */}
                        <circle
                            cx="40" cy="40" r={radius}
                            stroke={isDark ? "#1e293b" : "#f1f5f9"}
                            strokeWidth="6" fill="none"
                            className="transition-colors duration-300"
                        />
                        {/* Progress Indicator */}
                        <circle
                            cx="40" cy="40" r={radius}
                            stroke={completed ? "#10b981" : "#3b82f6"}
                            strokeWidth="6"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={circumference - (Math.min(completionPercent, 100) / 100) * circumference}
                            className={`transition-all duration-700 ease-out ${completed
                                    ? 'drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                                    : isDark ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'drop-shadow-md'
                                }`}
                        />
                    </svg>

                    {/* Center Stat */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xl font-black ${completed
                                ? 'text-emerald-500'
                                : isDark ? 'text-white' : 'text-slate-800'
                            }`}>
                            {progress.questionsCompleted}
                        </span>
                        <div className={`h-[1px] w-8 my-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                        <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {goal.questionsTarget}
                        </span>
                    </div>

                    {/* Edit Hover Hint */}
                    <div className={`absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm ${isDark ? 'bg-slate-900/80 text-blue-400' : 'bg-white/80 text-blue-600'
                        }`}>
                        <span className="text-[10px] font-bold">EDIT</span>
                    </div>
                </div>

                {/* Text / Edit Mode */}
                <div className="w-full text-center">
                    <h3 className={`font-bold text-sm mb-1 ${isDark ? 'text-gray-200' : 'text-slate-700'}`}>
                        Today's Goal
                    </h3>

                    {isEditing ? (
                        <div className={`animate-in fade-in slide-in-from-bottom-2 absolute inset-0 backdrop-blur-md z-20 flex flex-col items-center justify-center p-4 rounded-2xl border shadow-xl ${isDark
                                ? 'bg-slate-900/95 border-slate-700'
                                : 'bg-white/95 border-slate-200'
                            }`}>
                            <h4 className="text-xs text-blue-500 font-bold mb-3 uppercase tracking-wider">Set Target</h4>

                            <div className="flex gap-2 mb-3">
                                <button onClick={() => setTempGoal(Math.max(5, tempGoal - 5))} className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                    }`}>-</button>
                                <span className={`text-2xl font-black w-12 text-center tabular-nums ${isDark ? 'text-white' : 'text-slate-800'}`}>{tempGoal}</span>
                                <button onClick={() => setTempGoal(tempGoal + 5)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                    }`}>+</button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 w-full mb-3">
                                {smartGoal !== goal.questionsTarget && (
                                    <button
                                        onClick={() => setTempGoal(smartGoal)}
                                        className={`col-span-2 py-1.5 px-2 rounded-lg border text-xs text-left ${isDark
                                                ? 'bg-indigo-900/30 text-indigo-300 border-indigo-500/30 hover:bg-indigo-900/50'
                                                : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100'
                                            }`}
                                    >
                                        <span className="block font-bold">🚀 Rio Suggests: {smartGoal}</span>
                                        <span className="opacity-70 text-[10px]">Based on your exam date</span>
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-2 w-full mt-auto">
                                <button onClick={() => setIsEditing(false)} className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${isDark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}>Cancel</button>
                                <button onClick={handleSaveGoal} className="flex-1 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-colors">Save</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {completed ? (
                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold animate-pulse">
                                    Target Smashed! 🌟
                                </p>
                            ) : (
                                <p className={`text-[10px] font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {getRemainingQuestions()} more to hit streak
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DailyGoal;
