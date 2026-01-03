import React, { useState, useEffect, useMemo } from 'react';
import RioMascot from './RioMascot';
import { useTheme } from '../contexts/ThemeContext';

// Import raw trends data
import trendsDataRaw from '../src/data/exam_forecast_trends.json';

interface ParadigmShift {
    id: string;
    topic: string;
    source: string;
    oldConcept: string;
    newConcept: string;
    relevanceScore: number;
    reason: string;
}

// Parse trends data
function parseTrendsData(data: any): ParadigmShift[] {
    let rawTrends: any[] = [];
    if (Array.isArray(data)) rawTrends = data;
    else if (data?.trends) rawTrends = data.trends;

    return rawTrends.map((t: any, idx: number) => ({
        id: `trend-${idx}`,
        topic: t.topic || '',
        source: t.source_guideline || t.source || '',
        oldConcept: t.old_concept || t.oldConcept || '',
        newConcept: t.new_concept || t.newConcept || '',
        relevanceScore: t.exam_relevance_score || t.relevanceScore || 5,
        reason: t.reason || '',
    }));
}

// Group by source
function groupBySource(trends: ParadigmShift[]): Record<string, ParadigmShift[]> {
    return trends.reduce((acc, trend) => {
        const source = trend.source || 'Other';
        if (!acc[source]) acc[source] = [];
        acc[source].push(trend);
        return acc;
    }, {} as Record<string, ParadigmShift[]>);
}

const TrendDashboard2: React.FC<{
    onClose: () => void;
    onGenerateMCQ: (topic: string) => void;
}> = ({ onClose, onGenerateMCQ }) => {
    const [trends, setTrends] = useState<ParadigmShift[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [filterSource, setFilterSource] = useState<string>('all');
    const [showHighYieldOnly, setShowHighYieldOnly] = useState(false);

    useEffect(() => {
        const parsed = parseTrendsData(trendsDataRaw);
        setTrends(parsed);
    }, []);

    // Get unique sources
    const sources = useMemo(() => {
        return [...new Set(trends.map(t => t.source))].sort();
    }, [trends]);

    // Filter trends
    const filteredTrends = useMemo(() => {
        let result = trends;
        if (filterSource !== 'all') {
            result = result.filter(t => t.source === filterSource);
        }
        if (showHighYieldOnly) {
            result = result.filter(t => t.relevanceScore >= 8);
        }
        return result;
    }, [trends, filterSource, showHighYieldOnly]);

    // Stats
    const stats = {
        total: trends.length,
        highYield: trends.filter(t => t.relevanceScore >= 8).length,
        sources: sources.length
    };

    return (
        <div className="max-w-2xl mx-auto pb-24"> {/* Removed internal px-3 to avoid double padding */}
            {/* Sticky Header */}
            <header className={`sticky top-0 backdrop-blur z-20 pb-3 border-b -mx-4 px-4 md:mx-0 md:px-0 ${isDark ? 'bg-slate-950/95 border-slate-700' : 'bg-white/95 border-gray-200'
                }`}> {/* Updated to -mx-4 to match App p-4 */}
                <div className="flex items-center justify-between py-3 gap-2">
                    <div className="min-w-0">
                        <h1 className={`text-lg md:text-xl font-bold truncate ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>What's New in Guidelines</h1>
                        <p className={`text-[10px] md:text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{stats.total} updates from {stats.sources} sources</p>
                    </div>
                    <button onClick={onClose} className={`flex-shrink-0 p-2 rounded-lg ${isDark ? 'text-slate-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}>✕</button>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide"> {/* Updated to -mx-4 */}
                    <button
                        onClick={() => setShowHighYieldOnly(!showHighYieldOnly)}
                        className={`flex-shrink-0 px-2.5 md:px-3 py-1.5 rounded-full text-[10px] md:text-xs font-medium transition-all ${showHighYieldOnly
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : (isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
                            }`}
                    >
                        🔥 High-Yield ({stats.highYield})
                    </button>

                    <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

                    <select
                        value={filterSource}
                        onChange={(e) => setFilterSource(e.target.value)}
                        className={`flex-shrink-0 px-2.5 md:px-3 py-1.5 rounded-full text-[10px] md:text-xs font-medium border-0 focus:ring-2 focus:ring-blue-500 ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        <option value="all">All Sources</option>
                        {sources.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
            </header>

            {/* Rio intro message */}
            <div className="flex gap-2 md:gap-3 py-4">
                <div className="flex-shrink-0">
                    <RioMascot state="greeting" size="small" position="inline" variant="inline" />
                </div>
                <div className={`border rounded-2xl rounded-tl-md p-2.5 md:p-3 flex-1 ${isDark ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-100'
                    }`}>
                    <p className={`text-xs md:text-sm ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>
                        Hey! I've compiled the latest guideline changes you should know.
                        The <span className="font-bold text-red-600">🔥 high-yield</span> ones are most likely to appear!
                    </p>
                </div>
            </div>

            {/* Updates Feed */}
            <div className="space-y-3 md:space-y-4">
                {filteredTrends.length === 0 ? (
                    <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                        <p className="text-4xl mb-2">📭</p>
                        <p>No updates match your filters</p>
                    </div>
                ) : (
                    filteredTrends.map((trend, idx) => {
                        const isExpanded = expandedId === trend.id;
                        const isHighYield = trend.relevanceScore >= 8;

                        return (
                            <div
                                key={trend.id}
                                className={`rounded-2xl border transition-all ${isHighYield
                                    ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'
                                    : (isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200')
                                    } ${isExpanded ? 'shadow-lg' : 'shadow-sm hover:shadow-md'}`}
                            >
                                {/* Header row */}
                                <div
                                    className="flex items-start gap-3 p-3 md:p-4 cursor-pointer" // Reduced mobile padding
                                    onClick={() => setExpandedId(isExpanded ? null : trend.id)}
                                >
                                    {/* Index number */}
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isHighYield ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                                        }`}>
                                        {idx + 1}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className={`font-bold text-sm leading-snug ${isDark && !isHighYield ? 'text-gray-100' : 'text-gray-800'}`}>
                                                {trend.topic}
                                            </h3>
                                            {isHighYield && (
                                                <span className="flex-shrink-0 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                                                    🔥 {trend.relevanceScore}/10
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">📄 {trend.source}</p>

                                        {/* Preview */}
                                        {!isExpanded && (
                                            <p className={`text-sm mt-2 line-clamp-2 ${isDark && !isHighYield ? 'text-gray-300' : 'text-gray-600'}`}>
                                                {trend.newConcept}
                                            </p>
                                        )}
                                    </div>

                                    {/* Chevron */}
                                    <svg
                                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>

                                {/* Expanded content */}
                                {isExpanded && (
                                    <div className="px-4 pb-4 animate-fade-in">
                                        <div className="ml-11 space-y-3">
                                            {/* Old practice */}
                                            <div className="relative pl-4 border-l-2 border-red-300">
                                                <p className="text-[10px] text-red-500 font-bold uppercase mb-1">Previously</p>
                                                <p className="text-sm text-gray-700">{trend.oldConcept}</p>
                                            </div>

                                            {/* New practice */}
                                            <div className="relative pl-4 border-l-2 border-green-400">
                                                <p className="text-[10px] text-green-600 font-bold uppercase mb-1">Now Recommended</p>
                                                <p className="text-sm text-gray-700">{trend.newConcept}</p>
                                            </div>

                                            {/* Reason if available */}
                                            {trend.reason && (
                                                <div className="bg-blue-50 rounded-lg p-3 mt-3">
                                                    <p className="text-[10px] text-blue-600 font-bold uppercase mb-1">💡 Why This Matters</p>
                                                    <p className="text-sm text-blue-800">{trend.reason}</p>
                                                </div>
                                            )}

                                            {/* Action button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onGenerateMCQ(trend.topic);
                                                }}
                                                className="w-full mt-2 py-2.5 bg-gray-900 text-white font-medium text-sm rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <span>🎯</span>
                                                Practice MCQs on this
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Bottom summary */}
            {filteredTrends.length > 0 && (
                <div className="text-center text-xs text-gray-400 py-8">
                    Showing {filteredTrends.length} of {trends.length} updates
                </div>
            )}
        </div>
    );
};

export default TrendDashboard2;
