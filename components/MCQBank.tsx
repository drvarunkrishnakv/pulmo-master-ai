import React, { useState, useCallback, useMemo } from 'react';
import { SavedMCQ } from '../types';
import { getAllMCQs, deleteMCQ, deleteMCQs, deleteMCQsByBook, updateMCQ, getUniqueBooksFromMCQs, resetMCQStats } from '../services/mcqBankService';
import { Search, List, Grid3X3, Download, RotateCcw, Trash2, ChevronDown, ChevronRight, Filter, SortAsc } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface MCQBankProps {
    onStartPractice: (mcqs: SavedMCQ[]) => void;
}

type SortMode = 'newest' | 'oldest' | 'topic-az' | 'weakest' | 'least-attempted' | 'most-attempted';
type ViewMode = 'list' | 'compact' | 'grouped';
type StatusFilter = 'all' | 'attempted' | 'never-seen' | 'mastered' | 'needs-work';

const MCQBank: React.FC<MCQBankProps> = ({ onStartPractice }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    // Get unique topics derived from MCQ data
    const topics = useMemo(() => getUniqueBooksFromMCQs(), []);
    const [selectedTopic, setSelectedTopic] = useState<string | 'all'>('all');
    const [selectedSubTopic, setSelectedSubTopic] = useState<string | 'all'>('all');
    const [sortMode, setSortMode] = useState<SortMode>('newest');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingMCQ, setEditingMCQ] = useState<SavedMCQ | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [showFilters, setShowFilters] = useState(false);

    const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

    const getMCQs = (): SavedMCQ[] => {
        let mcqs = getAllMCQs();

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            mcqs = mcqs.filter(m =>
                m.question.toLowerCase().includes(query) ||
                m.topic?.toLowerCase().includes(query) ||
                m.subTopicName?.toLowerCase().includes(query) ||
                Object.values(m.options).some(opt => opt.toLowerCase().includes(query))
            );
        }

        // Filter by topic
        if (selectedTopic !== 'all') {
            mcqs = mcqs.filter(m => m.topic === selectedTopic || m.bookId === selectedTopic);
        }

        // Filter by sub-topic
        if (selectedSubTopic !== 'all') {
            mcqs = mcqs.filter(m => m.subTopicId === selectedSubTopic || m.subTopicName === selectedSubTopic);
        }

        // Filter by status
        switch (statusFilter) {
            case 'attempted':
                mcqs = mcqs.filter(m => m.timesAttempted > 0);
                break;
            case 'never-seen':
                mcqs = mcqs.filter(m => m.timesAttempted === 0);
                break;
            case 'mastered':
                mcqs = mcqs.filter(m => m.timesAttempted >= 3 && (m.correctAttempts / m.timesAttempted) >= 0.8);
                break;
            case 'needs-work':
                mcqs = mcqs.filter(m => m.timesAttempted > 0 && (m.correctAttempts / m.timesAttempted) < 0.5);
                break;
        }

        // Sort
        switch (sortMode) {
            case 'newest':
                return mcqs.sort((a, b) => b.generatedAt - a.generatedAt);
            case 'oldest':
                return mcqs.sort((a, b) => a.generatedAt - b.generatedAt);
            case 'topic-az':
                return mcqs.sort((a, b) => (a.topic || '').localeCompare(b.topic || ''));
            case 'weakest':
                return mcqs
                    .filter(m => m.timesAttempted > 0)
                    .sort((a, b) => {
                        const accA = a.correctAttempts / a.timesAttempted;
                        const accB = b.correctAttempts / b.timesAttempted;
                        return accA - accB;
                    });
            case 'least-attempted':
                return mcqs.sort((a, b) => a.timesAttempted - b.timesAttempted);
            case 'most-attempted':
                return mcqs.sort((a, b) => b.timesAttempted - a.timesAttempted);
            default:
                return mcqs;
        }
    };

    const mcqs = getMCQs();
    const allMCQs = getAllMCQs();

    // Group by topic for grouped view
    const groupedMCQs = useMemo(() => {
        if (viewMode !== 'grouped') return {};
        const groups: Record<string, SavedMCQ[]> = {};
        mcqs.forEach(mcq => {
            const topic = mcq.topic || 'Uncategorized';
            if (!groups[topic]) groups[topic] = [];
            groups[topic].push(mcq);
        });
        return groups;
    }, [mcqs, viewMode]);

    // Get unique sub-topics for filter dropdown
    const subTopics = useMemo(() => {
        const source = selectedTopic === 'all' ? getAllMCQs() : getAllMCQs().filter(m => m.topic === selectedTopic);
        const subTopicMap = new Map<string, string>();
        source.forEach(m => {
            if (m.subTopicName) {
                subTopicMap.set(m.subTopicId || m.subTopicName, m.subTopicName);
            }
        });
        return Array.from(subTopicMap.entries()).map(([id, name]) => ({ id, name }));
    }, [selectedTopic, refreshKey]);

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedIds.size === mcqs.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(mcqs.map(m => m.id)));
        }
    };

    const handleDeleteSelected = () => {
        if (selectedIds.size === 0) return;
        if (confirm(`Delete ${selectedIds.size} question(s)? This cannot be undone.`)) {
            deleteMCQs(Array.from(selectedIds));
            setSelectedIds(new Set());
            refresh();
        }
    };

    const handleDeleteByTopic = () => {
        if (selectedTopic === 'all') {
            alert('Please select a topic first');
            return;
        }
        const topicMCQs = mcqs.filter(m => m.topic === selectedTopic || m.bookId === selectedTopic);
        if (confirm(`Delete all ${topicMCQs.length} questions in this topic? This cannot be undone.`)) {
            deleteMCQsByBook(selectedTopic);
            setSelectedTopic('all');
            refresh();
        }
    };

    const handleDeleteOne = (id: string, question: string) => {
        if (confirm(`Delete this question?\n\n"${question.slice(0, 100)}..."`)) {
            deleteMCQ(id);
            refresh();
        }
    };

    const handleResetStats = (id: string) => {
        if (confirm('Reset all statistics for this question? (Attempts, accuracy, SRS data)')) {
            resetMCQStats(id);
            refresh();
        }
    };

    const handleSaveEdit = (updated: SavedMCQ) => {
        updateMCQ(updated.id, updated);
        setEditingMCQ(null);
        refresh();
    };

    const handleExport = (format: 'json' | 'csv') => {
        const dataToExport = selectedIds.size > 0
            ? mcqs.filter(m => selectedIds.has(m.id))
            : mcqs;

        let content: string;
        let filename: string;
        let mimeType: string;

        if (format === 'json') {
            content = JSON.stringify(dataToExport, null, 2);
            filename = `mcq-bank-${new Date().toISOString().split('T')[0]}.json`;
            mimeType = 'application/json';
        } else {
            // CSV format
            const headers = ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Topic', 'Attempts', 'Accuracy'];
            const rows = dataToExport.map(m => [
                `"${m.question.replace(/"/g, '""')}"`,
                `"${m.options.A.replace(/"/g, '""')}"`,
                `"${m.options.B.replace(/"/g, '""')}"`,
                `"${m.options.C.replace(/"/g, '""')}"`,
                `"${m.options.D.replace(/"/g, '""')}"`,
                m.correctAnswer,
                m.topic || '',
                m.timesAttempted,
                m.timesAttempted > 0 ? Math.round((m.correctAttempts / m.timesAttempted) * 100) + '%' : 'N/A'
            ]);
            content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            filename = `mcq-bank-${new Date().toISOString().split('T')[0]}.csv`;
            mimeType = 'text/csv';
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleTopicExpansion = (topic: string) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            if (next.has(topic)) {
                next.delete(topic);
            } else {
                next.add(topic);
            }
            return next;
        });
    };

    if (allMCQs.length === 0) {
        return (
            <div className={`rounded-xl border p-8 md:p-12 text-center ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
                }`}>
                <div className="text-5xl md:text-6xl mb-4">🗃️</div>
                <h3 className={`text-lg md:text-xl font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-800'
                    }`}>MCQ Bank is Empty</h3>
                <p className={`text-sm md:text-base mb-4 ${isDark ? 'text-slate-400' : 'text-gray-500'
                    }`}>
                    Start a quiz from Dashboard to populate the MCQ Bank
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4 md:space-y-6 overflow-x-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className={`text-xl md:text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>MCQ Bank</h2>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                        {mcqs.length} of {allMCQs.length} questions
                        {searchQuery && ` matching "${searchQuery}"`}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* View Mode Toggle */}
                    <div className={`flex rounded-lg p-1 ${isDark ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? (isDark ? 'bg-slate-700 shadow-sm' : 'bg-white shadow-sm') : (isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-200')}`}
                            title="List View"
                        >
                            <List size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('compact')}
                            className={`p-2 rounded-md transition-colors ${viewMode === 'compact' ? (isDark ? 'bg-slate-700 shadow-sm' : 'bg-white shadow-sm') : (isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-200')}`}
                            title="Compact View"
                        >
                            <Grid3X3 size={18} />
                        </button>
                    </div>

                    {/* Export Button */}
                    <div className="relative group">
                        <button className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-gray-100 hover:bg-gray-200'}`} title="Export">
                            <Download size={18} />
                        </button>
                        <div className={`absolute right-0 mt-1 border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
                            }`}>
                            <button
                                onClick={() => handleExport('json')}
                                className="block w-full px-4 py-2 text-sm text-left hover:bg-gray-50"
                            >
                                Export JSON
                            </button>
                            <button
                                onClick={() => handleExport('csv')}
                                className="block w-full px-4 py-2 text-sm text-left hover:bg-gray-50"
                            >
                                Export CSV
                            </button>
                        </div>
                    </div>

                    {mcqs.length > 0 && (
                        <button
                            onClick={() => onStartPractice(mcqs.slice(0, 10))}
                            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all text-sm"
                        >
                            Practice {Math.min(mcqs.length, 10)}
                        </button>
                    )}
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search questions, topics, or options..."
                    className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDark ? 'bg-slate-800 border-slate-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900'
                        }`}
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Filters Toggle */}
            <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors ${isDark ? 'text-blue-400 hover:bg-slate-800' : 'text-blue-600 hover:bg-blue-50'}`}
            >
                <Filter size={16} />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
                <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {/* Filters & Sort */}
            {showFilters && (
                <div className={`w-full flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-3 p-3 md:p-4 rounded-xl ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-gray-50'}`}>
                    <select
                        value={selectedTopic}
                        onChange={(e) => {
                            setSelectedTopic(e.target.value);
                            setSelectedSubTopic('all');
                        }}
                        className={`px-3 py-2 border rounded-lg text-sm w-full md:w-auto md:max-w-xs ${isDark ? 'bg-slate-800 border-slate-600 text-gray-200' : 'bg-white text-gray-700'}`}
                    >
                        <option value="all">All Topics</option>
                        {topics.map(topic => (
                            <option key={topic.id} value={topic.id}>{topic.name} ({topic.total})</option>
                        ))}
                    </select>

                    {subTopics.length > 0 && (
                        <select
                            value={selectedSubTopic}
                            onChange={(e) => setSelectedSubTopic(e.target.value)}
                            className={`px-3 py-2 border rounded-lg text-sm w-full md:w-auto md:max-w-xs ${isDark ? 'bg-slate-800 border-slate-600 text-gray-200' : 'bg-white text-gray-700'}`}
                        >
                            <option value="all">All Sub-Topics</option>
                            {subTopics.map(st => (
                                <option key={st.id} value={st.id}>{st.name}</option>
                            ))}
                        </select>
                    )}

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                        className={`px-3 py-2 border rounded-lg text-sm w-full md:w-auto ${isDark ? 'bg-slate-800 border-slate-600 text-gray-200' : 'bg-white text-gray-700'}`}
                    >
                        <option value="all">All Status</option>
                        <option value="attempted">✓ Attempted</option>
                        <option value="never-seen">○ Never Seen</option>
                        <option value="mastered">🏆 Mastered (≥80%)</option>
                        <option value="needs-work">⚠️ Needs Work (&lt;50%)</option>
                    </select>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <SortAsc size={16} className={`hidden md:block ${isDark ? 'text-slate-400' : 'text-gray-400'}`} />
                        <select
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value as SortMode)}
                            className={`px-3 py-2 border rounded-lg text-sm w-full md:w-auto ${isDark ? 'bg-slate-800 border-slate-600 text-gray-200' : 'bg-white text-gray-700'}`}
                        >
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                            <option value="topic-az">Topic A-Z</option>
                            <option value="weakest">Weakest Areas</option>
                            <option value="least-attempted">Least Practiced</option>
                            <option value="most-attempted">Most Practiced</option>
                        </select>
                    </div>

                    {selectedTopic !== 'all' && (
                        <button
                            onClick={handleDeleteByTopic}
                            className={`px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-1 ${isDark ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-50'}`}
                        >
                            <Trash2 size={14} />
                            Delete Topic
                        </button>
                    )}
                </div>
            )}

            {/* Bulk Actions Bar */}
            <div className="flex flex-wrap items-center gap-3">
                <button
                    onClick={handleSelectAll}
                    className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    {selectedIds.size === mcqs.length && mcqs.length > 0 ? 'Deselect All' : 'Select All'}
                </button>

                {selectedIds.size > 0 && (
                    <>
                        <span className="text-sm text-gray-500">
                            {selectedIds.size} selected
                        </span>
                        <button
                            onClick={handleDeleteSelected}
                            className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1"
                        >
                            <Trash2 size={14} />
                            Delete Selected
                        </button>
                    </>
                )}
            </div>

            {/* MCQ List */}
            <div className={`w-full max-w-full ${viewMode === 'compact' ? 'space-y-1' : 'space-y-3'}`}>
                {viewMode === 'grouped' ? (
                    // Grouped by Topic View
                    Object.entries(groupedMCQs).map(([topic, topicMCQs]) => (
                        <div key={topic} className="bg-white rounded-xl border overflow-hidden">
                            <button
                                onClick={() => toggleTopicExpansion(topic)}
                                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    {expandedTopics.has(topic) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    <span className="font-medium text-gray-800">{topic}</span>
                                    <span className="text-sm text-gray-500">({topicMCQs.length})</span>
                                </div>
                            </button>
                            {expandedTopics.has(topic) && (
                                <div className="border-t divide-y">
                                    {topicMCQs.map((mcq, index) => (
                                        <MCQCard
                                            key={mcq.id || index}
                                            mcq={mcq}
                                            index={index + 1}
                                            isSelected={selectedIds.has(mcq.id)}
                                            onToggleSelect={() => handleToggleSelect(mcq.id)}
                                            onDelete={() => handleDeleteOne(mcq.id, mcq.question)}
                                            onEdit={() => setEditingMCQ(mcq)}
                                            onResetStats={() => handleResetStats(mcq.id)}
                                            compact={false}
                                            isDark={isDark}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    // List or Compact View
                    mcqs.slice(0, 100).map((mcq, index) => (
                        <MCQCard
                            key={mcq.id || index}
                            mcq={mcq}
                            index={index + 1}
                            isSelected={selectedIds.has(mcq.id)}
                            onToggleSelect={() => handleToggleSelect(mcq.id)}
                            onDelete={() => handleDeleteOne(mcq.id, mcq.question)}
                            onEdit={() => setEditingMCQ(mcq)}
                            onResetStats={() => handleResetStats(mcq.id)}
                            compact={viewMode === 'compact'}
                            isDark={isDark}
                        />
                    ))
                )}

                {mcqs.length > 100 && viewMode !== 'grouped' && (
                    <p className="text-center text-gray-500 py-4 text-sm">
                        And {mcqs.length - 100} more questions...
                    </p>
                )}

                {mcqs.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        <p>No questions match your filters</p>
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setSelectedTopic('all');
                                setSelectedSubTopic('all');
                                setStatusFilter('all');
                            }}
                            className="mt-2 text-blue-600 hover:underline"
                        >
                            Clear all filters
                        </button>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingMCQ && (
                <MCQEditModal
                    mcq={editingMCQ}
                    onSave={handleSaveEdit}
                    onClose={() => setEditingMCQ(null)}
                />
            )}
        </div>
    );
};

interface MCQCardProps {
    mcq: SavedMCQ;
    index: number;
    isSelected: boolean;
    onToggleSelect: () => void;
    onDelete: () => void;
    onEdit: () => void;
    onResetStats: () => void;
    compact?: boolean;
    isDark: boolean;
}

const MCQCard: React.FC<MCQCardProps> = ({ mcq, index, isSelected, onToggleSelect, onDelete, onEdit, onResetStats, compact, isDark }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const accuracy = mcq.timesAttempted > 0
        ? Math.round((mcq.correctAttempts / mcq.timesAttempted) * 100)
        : null;

    // Status indicator
    const getStatusBadge = () => {
        if (mcq.timesAttempted === 0) {
            return <span className={`px-2 py-0.5 rounded-full text-xs ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-100 text-gray-600'}`}>○ New</span>;
        }
        if (accuracy! >= 80 && mcq.timesAttempted >= 3) {
            return <span className={`px-2 py-0.5 rounded-full text-xs ${isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'}`}>🏆 Mastered</span>;
        }
        if (accuracy! < 50) {
            return <span className={`px-2 py-0.5 rounded-full text-xs ${isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'}`}>⚠️ Needs Work</span>;
        }
        return <span className={`px-2 py-0.5 rounded-full text-xs ${isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>📚 Learning</span>;
    };

    if (compact) {
        return (
            <div className={`rounded-lg border px-2 md:px-3 py-2 hover:shadow-sm transition-shadow ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
                }`}>
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={onToggleSelect}
                        className={`flex-shrink-0 w-4 h-4 rounded text-blue-600 ${isDark ? 'border-slate-600 bg-slate-800' : 'border-gray-300'}`}
                    />
                    <span className={`flex-shrink-0 text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{index}</span>
                    <p
                        className={`text-sm cursor-pointer flex-1 ${isExpanded ? '' : 'line-clamp-1'} ${isDark ? 'text-gray-100' : 'text-gray-800'}`}
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {mcq.question}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="hidden sm:inline-block">{getStatusBadge()}</span>
                        <button onClick={onEdit} className="p-1 text-gray-400 hover:text-blue-600">✏️</button>
                        <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600">🗑️</button>
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`p-1 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}
                        >
                            {isExpanded ? '▲' : '▼'}
                        </button>
                    </div>
                </div>

                {/* Expanded content for compact view */}
                {isExpanded && (
                    <div className={`mt-3 pt-3 border-t space-y-2 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                        {(Object.entries(mcq.options) as [string, string][]).map(([key, value]) => (
                            <div
                                key={key}
                                className={`p-2 rounded-lg text-xs ${key === mcq.correctAnswer
                                    ? (isDark ? 'bg-green-900/20 border border-green-700 text-green-300' : 'bg-green-50 border border-green-200')
                                    : (isDark ? 'bg-slate-800 text-gray-200' : 'bg-gray-50')}`}
                            >
                                <span className="font-bold mr-2">{key}.</span>
                                {value}
                                {key === mcq.correctAnswer && (
                                    <span className="ml-2 text-green-600 text-xs">✓ Correct</span>
                                )}
                            </div>
                        ))}

                        <div className={`p-2 rounded-lg mt-2 ${isDark ? 'bg-blue-900/20 border border-blue-700' : 'bg-blue-50'}`}>
                            <h4 className={`font-bold text-xs mb-1 ${isDark ? 'text-blue-400' : 'text-blue-800'}`}>Explanation</h4>
                            <p className={`text-xs ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{mcq.deepDiveExplanation}</p>
                        </div>

                        {mcq.highYieldPearl && (
                            <div className={`p-2 rounded-lg ${isDark ? 'bg-amber-900/20 border border-amber-700' : 'bg-amber-50'}`}>
                                <h4 className={`font-bold text-xs mb-1 ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>High-Yield Pearl</h4>
                                <p className={`text-xs italic ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>{mcq.highYieldPearl}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`rounded-xl border p-3 md:p-4 hover:shadow-sm transition-shadow ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
            }`}>
            <div className="flex items-start gap-2 md:gap-3">
                {/* Checkbox */}
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelect}
                    className={`mt-2 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 ${isDark ? 'border-slate-600 bg-slate-800' : 'border-gray-300'}`}
                />

                <span className={`flex-shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-bold ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-100 text-gray-500'
                    }`}>
                    {index}
                </span>

                <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <p className={`text-sm md:text-base font-medium line-clamp-2 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>{mcq.question}</p>
                    <div className={`flex flex-wrap items-center gap-2 mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                        <span className={`px-2 py-0.5 rounded-full truncate max-w-[120px] ${isDark ? 'bg-blue-900/20 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                            {mcq.topic}
                        </span>
                        {getStatusBadge()}
                        {mcq.timesAttempted > 0 && (
                            <>
                                <span>{mcq.timesAttempted}x attempted</span>
                                <span className={accuracy! >= 50 ? 'text-green-600' : 'text-red-600'}>
                                    {accuracy}%
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1">
                    {mcq.timesAttempted > 0 && (
                        <button
                            onClick={onResetStats}
                            className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Reset Stats"
                        >
                            <RotateCcw size={16} />
                        </button>
                    )}
                    <button
                        onClick={onEdit}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                    >
                        ✏️
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                    >
                        🗑️
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-2 text-gray-400"
                    >
                        {isExpanded ? '▲' : '▼'}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className={`mt-4 pt-4 border-t space-y-3 ml-8 md:ml-12 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                    {(Object.entries(mcq.options) as [string, string][]).map(([key, value]) => (
                        <div
                            key={key}
                            className={`p-2 md:p-3 rounded-lg text-sm ${key === mcq.correctAnswer ? (isDark ? 'bg-green-900/20 border border-green-700 text-green-300' : 'bg-green-50 border border-green-200') : (isDark ? 'bg-slate-800 text-gray-200' : 'bg-gray-50')}`}
                        >
                            <span className="font-bold mr-2">{key}.</span>
                            {value}
                            {key === mcq.correctAnswer && (
                                <span className="ml-2 text-green-600 text-xs md:text-sm">✓ Correct</span>
                            )}
                        </div>
                    ))}

                    <div className={`p-3 md:p-4 rounded-lg mt-4 ${isDark ? 'bg-blue-900/20 border border-blue-700' : 'bg-blue-50'}`}>
                        <h4 className={`font-bold text-xs md:text-sm mb-2 ${isDark ? 'text-blue-400' : 'text-blue-800'}`}>Explanation</h4>
                        <p className={`text-xs md:text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{mcq.deepDiveExplanation}</p>
                    </div>

                    {mcq.highYieldPearl && (
                        <div className={`p-3 md:p-4 rounded-lg ${isDark ? 'bg-amber-900/20 border border-amber-700' : 'bg-amber-50'}`}>
                            <h4 className={`font-bold text-xs md:text-sm mb-1 ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>High-Yield Pearl</h4>
                            <p className={`text-xs md:text-sm italic ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>{mcq.highYieldPearl}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface MCQEditModalProps {
    mcq: SavedMCQ;
    onSave: (updated: SavedMCQ) => void;
    onClose: () => void;
}

const MCQEditModal: React.FC<MCQEditModalProps> = ({ mcq, onSave, onClose }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [edited, setEdited] = useState<SavedMCQ>({ ...mcq });

    const handleOptionChange = (key: 'A' | 'B' | 'C' | 'D', value: string) => {
        setEdited(prev => ({
            ...prev,
            options: { ...prev.options, [key]: value }
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 overflow-y-auto">
            <div className={`rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
                <div className={`p-4 md:p-6 border-b flex items-center justify-between sticky top-0 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <h2 className={`text-lg md:text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Edit MCQ</h2>
                    <button
                        onClick={onClose}
                        className={`transition-colors text-xl ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        ✕
                    </button>
                </div>

                <div className="p-4 md:p-6 space-y-4">
                    {/* Question */}
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Question</label>
                        <textarea
                            value={edited.question}
                            onChange={(e) => setEdited(prev => ({ ...prev, question: e.target.value }))}
                            className={`w-full p-3 border rounded-lg text-sm resize-none ${isDark ? 'bg-slate-800 border-slate-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                            rows={3}
                        />
                    </div>

                    {/* Options */}
                    <div className="space-y-3">
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Options</label>
                        {(['A', 'B', 'C', 'D'] as const).map((key) => (
                            <div key={key} className="flex items-start gap-2">
                                <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${edited.correctAnswer === key ? 'bg-green-500 text-white' : (isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600')}`}>
                                    {key}
                                </span>
                                <input
                                    type="text"
                                    value={edited.options[key]}
                                    onChange={(e) => handleOptionChange(key, e.target.value)}
                                    className={`flex-1 p-2 border rounded-lg text-sm ${isDark ? 'bg-slate-800 border-slate-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                                <button
                                    onClick={() => setEdited(prev => ({ ...prev, correctAnswer: key }))}
                                    className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${edited.correctAnswer === key ? 'bg-green-500 text-white' : (isDark ? 'bg-slate-700 text-slate-300 hover:bg-green-900/50' : 'bg-gray-100 text-gray-600 hover:bg-green-100')}`}
                                >
                                    {edited.correctAnswer === key ? '✓ Correct' : 'Set Correct'}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Explanation */}
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Explanation</label>
                        <textarea
                            value={edited.deepDiveExplanation}
                            onChange={(e) => setEdited(prev => ({ ...prev, deepDiveExplanation: e.target.value }))}
                            className={`w-full p-3 border rounded-lg text-sm resize-none ${isDark ? 'bg-slate-800 border-slate-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                            rows={4}
                        />
                    </div>

                    {/* High-Yield Pearl */}
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>High-Yield Pearl</label>
                        <textarea
                            value={edited.highYieldPearl}
                            onChange={(e) => setEdited(prev => ({ ...prev, highYieldPearl: e.target.value }))}
                            className={`w-full p-3 border rounded-lg text-sm resize-none ${isDark ? 'bg-slate-800 border-slate-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                            rows={2}
                        />
                    </div>
                </div>

                <div className={`p-4 md:p-6 border-t flex justify-end gap-3 sticky bottom-0 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <button
                        onClick={onClose}
                        className={`px-4 py-2 rounded-lg transition-colors ${isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(edited)}
                        className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MCQBank;
