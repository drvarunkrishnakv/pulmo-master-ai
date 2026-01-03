/**
 * Skill Radar Chart - Premium Visual Design
 * 
 * completely redesigned with:
 * - High-contrast "Apple Health" style aesthetic
 * - Improved data visualization with background context
 * - Robust handling of filled areas
 * - Side-by-side stats breakdown
 */

import React, { useMemo } from 'react';
import {
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    ResponsiveContainer,
    Tooltip,
    Legend
} from 'recharts';
import { getSkillCategoryStats, getFlashcardCategoryStats, getWeakestCategories, getStrongestCategories } from '../services/skillCategoryService';
import { useTheme } from '../contexts/ThemeContext';

const SkillRadarChart: React.FC = () => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    // 1. Data Fetching
    const mcqStats = useMemo(() => getSkillCategoryStats(), []);
    const flashcardStats = useMemo(() => getFlashcardCategoryStats(), []);
    const weakest = useMemo(() => getWeakestCategories(), []);
    const strongest = useMemo(() => getStrongestCategories(), []);

    // Fix for Recharts "width(-1)" error: ensure chart only renders after client-side mount
    const [isMounted, setIsMounted] = React.useState(false);
    React.useEffect(() => {
        setIsMounted(true);
    }, []);

    // 2. Data Processing & Normalization
    const chartData = mcqStats.map((mcq, idx) => ({
        subject: mcq.name,
        // Ensure values are at least 0
        mcqAccuracy: Math.max(0, mcq.accuracy),
        flashcardMastery: Math.max(0, flashcardStats[idx]?.masteryPercent || 0),
        fullMark: 100,
        // Metadata for tooltips
        mcqDisplay: `${mcq.accuracy}%`,
        mcqCount: `${mcq.attempted}/${mcq.total}`,
        fcDisplay: `${flashcardStats[idx]?.masteryPercent || 0}%`,
        fcCount: `${flashcardStats[idx]?.reviewed || 0}/${flashcardStats[idx]?.total || 0}`
    }));

    // check if we have enough data to show a meaningful chart
    const hasData = chartData.some(d => d.mcqAccuracy > 0 || d.flashcardMastery > 0);

    // 3. Custom Tooltip Component
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-slate-900/95 backdrop-blur text-white text-xs rounded-lg p-3 shadow-xl border border-slate-700">
                    <p className="font-bold text-slate-100 mb-2 text-sm border-b border-slate-700 pb-1">
                        {data.subject}
                    </p>

                    <div className="space-y-2">
                        {/* Quiz Row */}
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"></span>
                                <span className="text-slate-300">Quiz</span>
                            </div>
                            <div className="text-right">
                                <span className="font-bold text-cyan-300">{data.mcqDisplay}</span>
                                <span className="text-slate-500 ml-1 text-[10px]">({data.mcqCount})</span>
                            </div>
                        </div>

                        {/* Flashcards Row */}
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.5)]"></span>
                                <span className="text-slate-300">Cards</span>
                            </div>
                            <div className="text-right">
                                <span className="font-bold text-fuchsia-300">{data.fcDisplay}</span>
                                <span className="text-slate-500 ml-1 text-[10px]">({data.fcCount})</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-100'
            }`}>
            {/* Header Section */}
            <div className="px-5 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-gray-100' : 'text-slate-900'
                        }`}>
                        <span className={`p-1.5 rounded-lg text-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>🕸️</span>
                        Skill DNA
                    </h3>
                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        Visualizing your competence footprint
                    </p>
                </div>

                {/* Legend */}
                <div className={`flex items-center gap-4 px-3 py-1.5 rounded-full border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
                    }`}>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Quiz</span>
                    </div>
                    <div className={`w-px h-3 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500"></span>
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Flashcards</span>
                    </div>
                </div>
            </div>

            <div className={`h-px w-full ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`} />

            {/* Main Content */}
            <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center">

                {/* 1. The Radar Chart */}
                <div className="h-64 md:h-72 min-h-[256px] relative w-full">
                    {/* Background Circle Decoration */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                        <div className="w-48 h-48 rounded-full border-4 border-slate-900 border-dashed"></div>
                    </div>

                    <div className="w-full h-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height={280}>
                            <RadarChart
                                cx="50%"
                                cy="50%"
                                outerRadius="70%"
                                data={chartData}
                            >
                                <PolarGrid stroke={isDark ? '#334155' : '#e2e8f0'} strokeDasharray="4 4" />
                                <PolarAngleAxis
                                    dataKey="subject"
                                    tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 600 }}
                                />
                                <PolarRadiusAxis
                                    angle={30}
                                    domain={[0, 100]}
                                    tick={false}
                                    axisLine={false}
                                />

                                {/* Flashcards Radar (Back Layer) */}
                                <Radar
                                    name="Flashcards"
                                    dataKey="flashcardMastery"
                                    stroke="#d946ef"
                                    strokeWidth={2}
                                    fill="#e879f9"
                                    fillOpacity={0.2}
                                    isAnimationActive={true}
                                    animationDuration={1000}
                                    dot={false}
                                    activeDot={{ r: 4, fill: '#d946ef', strokeWidth: 0 }}
                                />

                                {/* MCQ Radar (Front Layer) */}
                                <Radar
                                    name="MCQs"
                                    dataKey="mcqAccuracy"
                                    stroke="#06b6d4"
                                    strokeWidth={3}
                                    fill="#22d3ee"
                                    fillOpacity={0.4}
                                    isAnimationActive={true}
                                    animationDuration={1000}
                                    dot={{ r: 3, fill: '#06b6d4', strokeWidth: 2, stroke: isDark ? '#1e293b' : '#fff' }}
                                    activeDot={{ r: 5, fill: '#06b6d4', stroke: isDark ? '#1e293b' : '#fff', strokeWidth: 2 }}
                                />

                                <Tooltip content={<CustomTooltip />} cursor={false} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Insights Panel */}
                <div className="space-y-4">
                    {/* Strengths Card */}
                    <div className={`rounded-xl p-4 border ${isDark ? 'bg-gradient-to-br from-emerald-900/30 to-teal-900/30 border-emerald-800/50' : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100'}`}>
                        <div className="flex items-center gap-2 mb-3">
                            <div className={`p-1.5 rounded-lg ${isDark ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                            </div>
                            <h4 className={`font-bold text-sm ${isDark ? 'text-emerald-300' : 'text-emerald-900'}`}>Top Strengths</h4>
                        </div>

                        {strongest.length > 0 ? (
                            <div className="space-y-2">
                                {strongest.slice(0, 3).map((s, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2">
                                        <span className={`text-xs md:text-sm font-medium truncate flex-1 ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>{s.name}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <div className={`w-12 md:w-16 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-emerald-900/50' : 'bg-emerald-200'}`}>
                                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.accuracy}%` }}></div>
                                            </div>
                                            <span className={`text-xs font-bold w-8 text-right ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{s.accuracy}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className={`text-xs italic ${isDark ? 'text-emerald-400/70' : 'text-emerald-600/80'}`}>Start practicing to build your skill profile!</p>
                        )}
                    </div>

                    {/* Weaknesses Card */}
                    <div className={`rounded-xl p-4 border ${isDark ? 'bg-gradient-to-br from-indigo-900/30 to-violet-900/30 border-indigo-800/50' : 'bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-100'}`}>
                        <div className="flex items-center gap-2 mb-3">
                            <div className={`p-1.5 rounded-lg ${isDark ? 'bg-indigo-900/50 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            </div>
                            <h4 className={`font-bold text-sm ${isDark ? 'text-indigo-300' : 'text-indigo-900'}`}>Focus Areas</h4>
                        </div>

                        {weakest.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {weakest.slice(0, 3).map((w, i) => (
                                    <button
                                        key={i}
                                        className={`px-2 md:px-3 py-1 md:py-1.5 border rounded-lg text-xs font-semibold shadow-sm transition-colors ${isDark ? 'bg-slate-800 border-indigo-700 text-indigo-300 hover:border-indigo-500' : 'bg-white border-indigo-200 text-indigo-700 hover:border-indigo-300'}`}
                                    >
                                        {w.name}
                                    </button>
                                ))}
                                <span className={`text-xs flex items-center px-1 ${isDark ? 'text-indigo-400' : 'text-indigo-400'}`}>
                                    + drill these
                                </span>
                            </div>
                        ) : (
                            <p className={`text-xs italic ${isDark ? 'text-indigo-400/70' : 'text-indigo-600/80'}`}>Great job! Keep maintaining your skills.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SkillRadarChart;
