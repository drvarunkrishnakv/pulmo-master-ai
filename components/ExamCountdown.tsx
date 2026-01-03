import React, { useState, useEffect, useMemo } from 'react';
import {
    getExamSettings,
    saveExamSettings,
    getDaysUntilExam,
    ExamSettings
} from '../services/streakService';
import { getAllMCQs, areBundledMCQsLoaded } from '../services/mcqBankService';
import { useTheme } from '../contexts/ThemeContext';

// Haptic feedback
const vibrate = (pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

const ExamCountdown: React.FC = () => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [settings, setSettings] = useState<ExamSettings | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [tempDate, setTempDate] = useState('');
    const [tempType, setTempType] = useState<'NEET-SS' | 'INI-SS'>('NEET-SS');
    const [daysLeft, setDaysLeft] = useState<number | null>(null);

    useEffect(() => {
        const saved = getExamSettings();
        if (saved) {
            setSettings(saved);
            setTempDate(saved.examDate);
            setTempType(saved.examType);
        }
        setDaysLeft(getDaysUntilExam());
    }, []);

    // Track when bundled MCQs finish loading to trigger stats re-render
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

    const handleSave = () => {
        vibrate(15);
        const newSettings: ExamSettings = {
            examDate: tempDate,
            examType: tempType
        };
        saveExamSettings(newSettings);
        setSettings(newSettings);
        setDaysLeft(getDaysUntilExam());
        setShowModal(false);

        // Dispatch event so Dashboard and other components can refresh
        window.dispatchEvent(new CustomEvent('examDateChanged'));
    };

    // Velocity & Stats Logic
    const stats = useMemo(() => {
        if (daysLeft === null || daysLeft <= 0) return null;

        const allMCQs = getAllMCQs();
        const attemptedCount = allMCQs.filter(m => m.timesAttempted > 0).length;
        const total = allMCQs.length;
        const remaining = total - attemptedCount;

        // Revision Phase starts 30 days before exam
        const revisionDays = 30;
        const initialLearningDays = Math.max(1, daysLeft - revisionDays);

        // Velocity needed to finish BEFORE revision phase
        const requiredVelocity = Math.ceil(remaining / initialLearningDays);
        const isOnTrack = requiredVelocity <= 40; // Arbitrary "safe" pace

        return {
            remainingItems: remaining,
            requiredVelocity,
            isOnTrack,
            revisionStartsIn: initialLearningDays
        };
    }, [daysLeft, mcqsLoaded]);

    // Get urgency color
    const getUrgencyColor = (): string => {
        if (daysLeft === null) return isDark ? 'text-slate-600' : 'text-slate-300';
        if (daysLeft <= 30) return isDark ? 'text-rose-400' : 'text-rose-500';
        if (daysLeft <= 90) return isDark ? 'text-amber-400' : 'text-amber-500';
        return isDark ? 'text-emerald-400' : 'text-emerald-500';
    };

    return (
        <>
            {/* Mission Control Card */}
            <div
                onClick={() => { vibrate(10); setShowModal(true); }}
                className={`relative overflow-hidden h-full min-h-[160px] rounded-2xl p-4 flex flex-col cursor-pointer group transition-all border ${isDark
                    ? 'bg-slate-900 border-slate-700 shadow-[0_0_20px_rgba(59,130,246,0.1)] hover:shadow-[0_0_25px_rgba(59,130,246,0.25)] hover:border-blue-500/50'
                    : 'bg-white rounded-2xl text-slate-800 shadow-sm border-slate-100 hover:border-blue-500/30 hover:shadow-md'
                    }`}
            >
                {/* Background Grid Effect */}
                {isDark ? (
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:14px_14px] pointer-events-none" />
                ) : (
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
                )}

                {/* Header */}
                <div className="relative z-10 flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold tracking-wider uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Mission Status</span>
                        {daysLeft !== null && (
                            <span className={`flex h-2 w-2 rounded-full ${daysLeft < 30 ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`}></span>
                        )}
                    </div>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${isDark ? 'bg-slate-800 text-blue-400' : 'bg-slate-100 text-slate-500'
                        }`}>
                        {settings?.examType || 'NO_TARGET'}
                    </span>
                </div>

                {/* Main Countdown */}
                <div className="relative z-10 flex-1 flex flex-col justify-center">
                    <div className="flex items-baseline gap-1">
                        <span className={`text-5xl font-black tracking-tighter ${getUrgencyColor()} ${isDark ? 'drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]' : 'drop-shadow-sm'}`}>
                            {daysLeft !== null ? daysLeft : '--'}
                        </span>
                        <span className={`text-xl font-medium ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>days</span>
                    </div>
                    {daysLeft === null && (
                        <p className="text-xs text-blue-500 font-medium animate-pulse mt-1">Tap to set initialization date</p>
                    )}
                </div>

                {/* Footer Stats / Velocity */}
                <div className={`relative z-10 mt-auto pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                    {stats ? (
                        <div className="flex justify-between items-end">
                            <div>
                                <p className={`text-[10px] mb-0.5 font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>REQ. VELOCITY</p>
                                <p className={`text-base font-bold ${stats.isOnTrack ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-orange-400' : 'text-orange-500')}`}>
                                    {stats.requiredVelocity} <span className={`text-[10px] font-normal ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>mcq/day</span>
                                </p>
                            </div>
                            <div className="text-right">
                                <p className={`text-[10px] mb-0.5 font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>REVISION PHASE</p>
                                <p className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    in {stats.revisionStartsIn} days
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className={`flex justify-between text-xs font-mono ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                            <span>VELOCITY: --</span>
                            <span>PHASE: WAITING</span>
                        </div>
                    )}
                </div>

                {/* Hover Glow */}
                <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'blur-sm' : ''}`} />
            </div>

            {/* Settings Modal - Dynamic Theme */}
            {showModal && (
                <div className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 ${isDark ? 'bg-black/60' : 'bg-slate-900/40'
                    }`}>
                    <div className={`rounded-2xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden ring-1 ${isDark
                        ? 'bg-slate-900 ring-slate-700'
                        : 'bg-white ring-slate-900/5'
                        }`}>
                        {/* Modal Background FX */}
                        <div className={`absolute top-0 right-0 w-32 h-32 blur-[50px] pointer-events-none ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'
                            }`} />

                        <h2 className={`text-xl font-bold mb-6 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'
                            }`}>
                            <span>📅</span>
                            Set Target Date
                        </h2>

                        {/* Exam Type */}
                        <label className={`block text-xs font-bold mb-2 uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                            Operation Type
                        </label>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {(['NEET-SS', 'INI-SS'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => { vibrate(5); setTempType(type); }}
                                    className={`py-3 rounded-xl font-bold text-sm transition-all border ${tempType === type
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200/50'
                                        : isDark
                                            ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                        }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>

                        {/* Date Picker */}
                        <label className={`block text-xs font-bold mb-2 uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                            Target Date
                        </label>
                        <input
                            type="date"
                            value={tempDate}
                            onChange={(e) => setTempDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className={`w-full px-4 py-3 border-2 rounded-xl font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all mb-8 ${isDark
                                ? 'bg-slate-800 border-slate-700 text-white focus:ring-blue-900/50 placeholder-slate-500'
                                : 'bg-slate-50 border-slate-200 text-slate-800'
                                }`}
                        />

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => { vibrate(5); setShowModal(false); }}
                                className={`flex-1 py-3 font-bold rounded-xl transition-all ${isDark
                                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!tempDate}
                                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ExamCountdown;
