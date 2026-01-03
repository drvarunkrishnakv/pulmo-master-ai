import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useMascot } from '../contexts/MascotContext';
import { Plus, X, Check, Flame, ChevronLeft, ChevronRight, Trash2, Pencil, BarChart3, Archive, RotateCcw, GripVertical, ChevronDown } from 'lucide-react';
import {
    Habit,
    getHabits,
    addHabit,
    deleteHabit,
    updateHabit,
    archiveHabit,
    unarchiveHabit,
    toggleHabitLog,
    reorderHabits,
    isHabitCompletedForDate,
    getStreakForHabit,
    getHeatmapData,
    getTodayProgress,
    getWeeklyStats,
    getTrendData,
    formatDate,
    HABIT_SUGGESTIONS,
    HABIT_COLORS,
} from '../services/habitService';
import { getHabitAwarenessMessage } from '../services/habitAwarenessService';
import { awardHabitXP, getLevelInfo, HabitXPResult, LevelInfo, hasStreakFreeze, useStreakFreeze } from '../services/gamificationService';
import XPPopup from './XPPopup';
import LevelUpCelebration from './LevelUpCelebration';

// ===== CALENDAR DAY =====
const CalendarDay: React.FC<{
    date: Date;
    isToday: boolean;
    isSelected: boolean;
    onSelect: () => void;
    isDark: boolean;
}> = ({ date, isToday, isSelected, onSelect, isDark }) => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
        <button
            onClick={onSelect}
            className={`flex-shrink-0 flex flex-col items-center justify-center w-12 h-16 md:w-14 md:h-18 rounded-xl transition-all ${isSelected
                ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg scale-105'
                : isToday
                    ? isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'bg-blue-100 text-blue-700 border border-blue-200'
                    : isDark ? 'bg-slate-800/50 text-slate-400 hover:bg-slate-700' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-100'
                }`}
        >
            <span className={`text-[10px] md:text-xs font-medium ${isSelected ? 'text-white/80' : ''}`}>
                {dayNames[date.getDay()].slice(0, 3)}
            </span>
            <span className={`text-base md:text-lg font-bold ${isSelected ? 'text-white' : ''}`}>
                {date.getDate()}
            </span>
        </button>
    );
};

// ===== MINI HEATMAP =====
const Heatmap: React.FC<{ habitId: string; color: string; isDark: boolean }> = ({ habitId, color, isDark }) => {
    const data = getHeatmapData(habitId, 12);
    const weeks: typeof data[] = [];
    for (let i = 0; i < 12; i++) weeks.push(data.filter(d => d.weekIndex === i));

    return (
        <div className="flex gap-1 py-2">
            {weeks.map((week, i) => (
                <div key={i} className="flex flex-col gap-1">
                    {[0, 1, 2, 3, 4, 5, 6].map(d => {
                        const day = week.find(x => x.dayIndex === d);
                        return (
                            <div
                                key={d}
                                className="w-3 h-3 rounded-sm transition-transform hover:scale-125"
                                style={{
                                    backgroundColor: day?.completed ? color : isDark ? '#334155' : '#e2e8f0',
                                    opacity: day?.completed ? 1 : 0.3,
                                }}
                                title={day?.date || ''}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

// ===== HABIT CARD =====
const HabitCard: React.FC<{
    habit: Habit;
    selectedDate: string;
    onToggle: () => void;
    onDelete: () => void;
    onArchive: () => void;
    onEdit: () => void;
    isDark: boolean;
    // DnD props
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
    onReorder?: (targetId: string) => void; // For touch
}> = ({ habit, selectedDate, onToggle, onDelete, onArchive, onEdit, isDark, draggable, onDragStart, onDragOver, onDragEnd, onReorder }) => {
    const isCompleted = isHabitCompletedForDate(habit.id, selectedDate);
    const streak = getStreakForHabit(habit.id);
    const [showDelete, setShowDelete] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false); // New state for collapsible section

    // Check if archived
    const isArchived = habit.archived;

    // Mobile touch reorder handler
    const handleTouchMove = (e: React.TouchEvent) => {
        if (!onReorder) return;
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const habitCard = target?.closest('[data-habit-id]') as HTMLElement;
        if (habitCard && habitCard.dataset.habitId && habitCard.dataset.habitId !== habit.id) {
            onReorder(habitCard.dataset.habitId);
        }
    };

    return (
        <div
            draggable={draggable && !isArchived}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            data-habit-id={habit.id}
            className={`rounded-2xl overflow-hidden transition-all ${isDark ? 'bg-slate-800/60 border border-slate-700/50' : 'bg-white border border-gray-100 shadow-sm'
                }`}
        >
            {/* Main Row */}
            <div
                className={`flex items-center p-4 gap-4 ${isCompleted ? 'ring-2' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{ ['--tw-ring-color' as string]: isCompleted ? `${habit.color}30` : undefined }}
            >
                {/* Drag Handle (only for non-archived) */}
                {!isArchived && (
                    <div
                        className={`touch-none p-2 -ml-2 rounded-lg cursor-grab active:cursor-grabbing ${isDark ? 'text-slate-600 hover:bg-slate-700/50' : 'text-gray-300 hover:bg-gray-100'}`}
                        onTouchMove={handleTouchMove}
                    >
                        <GripVertical className="w-5 h-5" />
                    </div>
                )}

                {/* Tap to complete */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { onToggle(); if ('vibrate' in navigator) navigator.vibrate(30); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
                    className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer"
                >
                    {/* Check circle */}
                    <div
                        className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${isCompleted ? '' : isDark ? 'border-2 border-dashed border-slate-600' : 'border-2 border-dashed border-gray-300'
                            }`}
                        style={{
                            backgroundColor: isCompleted ? habit.color : 'transparent',
                            boxShadow: isCompleted ? `0 4px 15px ${habit.color}40` : undefined
                        }}
                    >
                        {isCompleted ? (
                            <Check className="w-6 h-6 md:w-7 md:h-7 text-white" strokeWidth={3} />
                        ) : (
                            <span className="text-2xl">{habit.emoji}</span>
                        )}
                    </div>

                    {/* Name & streak */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`font-semibold text-base md:text-lg truncate ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                                {habit.name}
                            </span>
                            {streak > 0 && (
                                <span
                                    className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                                    style={{ backgroundColor: `${habit.color}20`, color: habit.color }}
                                >
                                    <Flame className="w-3 h-3" />{streak}
                                </span>
                            )}
                        </div>
                        <span className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                            {isCompleted ? '✓ Completed today' : 'Tap to complete'}
                        </span>
                    </div>
                </div>

                {/* Archive/Delete button (3-dots) */}
                {isArchived && (
                    <button
                        onClick={onArchive}
                        className={`p-2 mr-1 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-slate-500 hover:text-green-400 hover:bg-slate-700' : 'text-gray-400 hover:text-green-500 hover:bg-gray-100'
                            }`}
                        title="Restore Habit"
                    >
                        <RotateCcw className="w-5 h-5" />
                    </button>
                )}
                <button
                    onClick={() => setShowDelete(!showDelete)}
                    className={`p-2 rounded-xl flex-shrink-0 transition-colors ${isArchived
                        ? isDark ? 'text-slate-500 hover:text-red-400 hover:bg-slate-700' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'
                        : isDark ? 'text-slate-500 hover:text-orange-400 hover:bg-slate-700' : 'text-gray-400 hover:text-orange-500 hover:bg-gray-100'
                        }`}
                >
                    {isArchived ? <Trash2 className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
                </button>
            </div>

            {/* Collapsible Details Toggle */}
            <button
                onClick={() => {
                    const willExpand = !isExpanded;
                    setIsExpanded(willExpand);
                    if (!willExpand) setShowHeatmap(false);
                }}
                className={`w-full flex items-center justify-center py-0.5 transition-colors ${isDark ? 'hover:bg-slate-700/30 text-slate-600' : 'hover:bg-gray-50 text-gray-300'
                    }`}
            >
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            {/* Collapsible Action Bar - Stats & Edit */}
            <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                    <div className={`flex items-center gap-3 px-4 py-2.5 border-t ${isDark ? 'border-slate-700/50 bg-slate-800/30' : 'border-gray-100 bg-gray-50/50'}`}>
                        <button
                            onClick={() => setShowHeatmap(!showHeatmap)}
                            className={`flex items-center gap-1.5 text-xs md:text-sm font-medium transition-colors ${showHeatmap
                                ? 'text-blue-500'
                                : isDark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <BarChart3 className="w-4 h-4" />
                            {showHeatmap ? 'Hide Stats' : 'Show Stats'}
                        </button>
                        <button
                            onClick={onEdit}
                            className={`flex items-center gap-1.5 text-xs md:text-sm font-medium ${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Pencil className="w-4 h-4" />
                            Edit
                        </button>
                    </div>
                </div>
            </div>

            {/* Archive/Delete Confirmation */}
            {showDelete && (
                <div className={`flex items-center justify-between px-4 py-3 border-t ${isArchived
                    ? (isDark ? 'border-red-900/50 bg-red-900/20' : 'border-red-100 bg-red-50')
                    : (isDark ? 'border-orange-900/50 bg-orange-900/20' : 'border-orange-100 bg-orange-50')
                    }`}>
                    <span className={`text-sm font-medium ${isArchived
                        ? isDark ? 'text-red-300' : 'text-red-600'
                        : isDark ? 'text-orange-300' : 'text-orange-600'
                        }`}>
                        {isArchived ? 'Delete permanently?' : 'Archive this habit?'}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowDelete(false)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600'}`}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                if (isArchived) { onDelete(); } else { onArchive(); }
                                setShowDelete(false);
                            }}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg text-white ${isArchived ? 'bg-red-500' : 'bg-orange-500'
                                }`}
                        >
                            {isArchived ? 'Delete' : 'Archive'}
                        </button>
                    </div>
                </div>
            )}

            {/* Heatmap */}
            {showHeatmap && (
                <div className={`px-4 py-3 border-t ${isDark ? 'border-slate-700/50' : 'border-gray-100'}`}>
                    <Heatmap habitId={habit.id} color={habit.color} isDark={isDark} />
                </div>
            )}
        </div>
    );
};

// ===== MODAL =====
const HabitModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (h: Omit<Habit, 'id' | 'createdAt'>) => void;
    isDark: boolean;
    editing?: Habit | null;
}> = ({ isOpen, onClose, onSave, isDark, editing }) => {
    const [name, setName] = useState('');
    const [emoji, setEmoji] = useState('✨');
    const [color, setColor] = useState(HABIT_COLORS[0]);
    const [freq, setFreq] = useState<Habit['frequency']>('daily');

    useEffect(() => {
        if (editing) {
            setName(editing.name);
            setEmoji(editing.emoji);
            setColor(editing.color);
            setFreq(editing.frequency);
        } else {
            setName(''); setEmoji('✨'); setColor(HABIT_COLORS[0]); setFreq('daily');
        }
    }, [editing, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-[200]">
            <div className={`w-full max-w-md rounded-t-3xl md:rounded-2xl p-5 md:p-6 pb-8 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
                <div className="flex justify-center mb-3 md:hidden">
                    <div className={`w-10 h-1 rounded-full ${isDark ? 'bg-slate-700' : 'bg-gray-300'}`} />
                </div>

                <div className="flex justify-between items-center mb-4">
                    <h2 className={`text-lg md:text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                        {editing ? 'Edit Habit' : 'New Habit'}
                    </h2>
                    <button onClick={onClose} className="p-2"><X className="w-5 h-5" /></button>
                </div>

                {/* Quick picks */}
                {!editing && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {HABIT_SUGGESTIONS.slice(0, 4).map(s => (
                            <button
                                key={s.name}
                                onClick={() => { setName(s.name); setEmoji(s.emoji); setColor(s.color); }}
                                className={`px-3 py-1.5 rounded-full text-xs md:text-sm font-medium transition-all ${name === s.name ? 'text-white' : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                style={name === s.name ? { backgroundColor: s.color } : undefined}
                            >
                                {s.emoji} {s.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Form */}
                <div className="space-y-4">
                    <div>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Habit name"
                            className={`w-full px-4 py-3 rounded-xl text-base ${isDark ? 'bg-slate-800 text-white placeholder-slate-500' : 'bg-gray-100 text-gray-800 placeholder-gray-400'}`}
                        />
                    </div>

                    {/* Emoji Picker */}
                    <div>
                        <label className={`text-xs font-medium mb-2 block ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            Choose an icon
                        </label>
                        <div className="grid grid-cols-8 gap-1.5">
                            {['📚', '🏃', '🧘', '💊', '💪', '🚰', '🍎', '😴',
                                '✍️', '📖', '🎯', '⏰', '🧠', '🌅', '🌙', '💼',
                                '🎨', '🎵', '🏋️', '🚶', '🧹', '💰', '📱', '🌿',
                                '❤️', '⭐', '🔥', '✨', '🎉', '🙏', '💡', '🎓'].map(e => (
                                    <button
                                        key={e}
                                        type="button"
                                        onClick={() => setEmoji(e)}
                                        className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${emoji === e
                                            ? 'bg-blue-500 scale-110 shadow-md'
                                            : isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-gray-100 hover:bg-gray-200'
                                            }`}
                                    >
                                        {e}
                                    </button>
                                ))}
                        </div>
                    </div>

                    {/* Color Picker */}
                    <div>
                        <label className={`text-xs font-medium mb-2 block ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            Choose a color
                        </label>
                        <div className="flex gap-2">
                            {HABIT_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={`w-9 h-9 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 scale-110' : ''}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {(['daily', 'weekdays', 'weekends'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFreq(f)}
                                className={`py-2.5 rounded-xl text-sm font-medium transition-all ${freq === f ? 'bg-blue-500 text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700'
                                    }`}
                            >
                                {f === 'daily' ? 'Daily' : f === 'weekdays' ? 'Weekdays' : 'Weekends'}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => { if (name.trim()) { onSave({ name: name.trim(), emoji, color, frequency: freq }); onClose(); } }}
                        disabled={!name.trim()}
                        className={`w-full py-3.5 rounded-xl font-bold text-base transition-all ${name.trim() ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg' : isDark ? 'bg-slate-800 text-slate-600' : 'bg-gray-200 text-gray-400'
                            }`}
                    >
                        {editing ? 'Save Changes' : 'Create Habit'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ===== MAIN =====
const HabitTracker: React.FC = () => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const { triggerMascot } = useMascot();
    const [habits, setHabits] = useState<Habit[]>([]);
    const [date, setDate] = useState(formatDate(new Date()));
    const [modal, setModal] = useState(false);
    const [editing, setEditing] = useState<Habit | null>(null);
    const [key, setKey] = useState(0);
    const calRef = useRef<HTMLDivElement>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const prevCompletedRef = useRef(0);
    const [showArchived, setShowArchived] = useState(false);

    // Gamification state
    const [xpPopup, setXpPopup] = useState<{ xpGain: { totalXP: number; reason: string; baseXP: number; bonusXP: number; multiplier: number } | null; coinsDrop: number }>({ xpGain: null, coinsDrop: 0 });
    const [levelUpInfo, setLevelUpInfo] = useState<{ levelInfo: LevelInfo; coins: number } | null>(null);
    const [rescuedStreak, setRescuedStreak] = useState<string | null>(null);

    // Track habits that have already earned XP today (prevent farming)
    const getHabitXPKey = () => `habit_xp_earned_${formatDate(new Date())}`;
    const getHabitsWithXP = (): Set<string> => {
        try {
            const stored = localStorage.getItem(getHabitXPKey());
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch { return new Set(); }
    };
    const markHabitXPEarned = (habitId: string) => {
        const current = getHabitsWithXP();
        current.add(habitId);
        localStorage.setItem(getHabitXPKey(), JSON.stringify([...current]));
    };

    // Auto-check for Streak Shield rescue on load
    useEffect(() => {
        const checkStreakRescue = () => {
            if (!hasStreakFreeze()) return;

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = formatDate(yesterday);

            // Check all habits for a broken streak that ended day-before-yesterday
            const habits = getHabits();
            let usedShield = false;

            for (const habit of habits) {
                // If yesterday is NOT completed
                if (!isHabitCompletedForDate(habit.id, yesterdayStr)) {
                    // Check if there was a streak leading up to yesterday
                    // We can check if day-before-yesterday was completed
                    const dayBefore = new Date();
                    dayBefore.setDate(dayBefore.getDate() - 2);
                    const dayBeforeStr = formatDate(dayBefore);

                    if (isHabitCompletedForDate(habit.id, dayBeforeStr)) {
                        // Found a break! Yesterday missed, but day before was active.
                        // Rescue this streak!
                        if (useStreakFreeze()) {
                            // Mark yesterday as completed to bridge the gap
                            toggleHabitLog(habit.id, yesterdayStr);
                            setRescuedStreak(habit.name);
                            usedShield = true;
                            // Only use one shield per load to prevent draining (or remove break to use multiple? usually 1 protects all for "yesterday")
                            // Let's protect just one habit break per load for now, or all breaks for yesterday?
                            // Typically one shield protects "the day". Let's assume one shield per habit for now as simpler economy.
                            break;
                        }
                    }
                }
            }

            if (usedShield) {
                setKey(k => k + 1); // Refresh UI
            }
        };

        // Small delay to ensure DB ready
        setTimeout(checkStreakRescue, 1000);
    }, []);

    // Handle habit toggle with XP award
    const handleHabitToggle = (habitId: string, selectedDate: string) => {
        const wasCompleted = isHabitCompletedForDate(habitId, selectedDate);
        toggleHabitLog(habitId, selectedDate);
        setKey(k => k + 1);

        // Only award XP if:
        // 1. Habit is being completed (not uncompleted)
        // 2. It's today
        // 3. XP hasn't already been earned for this habit today
        const todayStr = formatDate(new Date());
        const habitsWithXP = getHabitsWithXP();

        if (!wasCompleted && selectedDate === todayStr && !habitsWithXP.has(habitId)) {
            // Mark this habit as having earned XP today
            markHabitXPEarned(habitId);

            // Check if all habits will be complete after this toggle
            const { completed: currentCompleted, total } = getTodayProgress();
            const willAllBeComplete = (currentCompleted + 1) >= total;

            const xpResult = awardHabitXP(willAllBeComplete);

            // Show XP popup
            setXpPopup({ xpGain: xpResult.xpGained, coinsDrop: 0 });

            // Handle level up
            if (xpResult.leveledUp) {
                const newLevelInfo = getLevelInfo();
                setTimeout(() => {
                    setLevelUpInfo({ levelInfo: newLevelInfo, coins: 15 });
                    triggerMascot('cheering', 'levelUp');
                }, 1000);
            }
        }
    };

    // Drag and scale state
    const [draggedId, setDraggedId] = useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
        // Transparent drag image usually automatic, but we can set it if needed
    };

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === id) return;

        reorderHabits(draggedId, id);
        // Force refresh
        setKey(k => k + 1);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
    };

    // Carousel state for progress views
    const [carouselIndex, setCarouselIndex] = useState(0);
    const carouselRef = useRef<HTMLDivElement>(null);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);

    // Swipe handlers for carousel (Touch + Mouse)
    const [isDragging, setIsDragging] = useState(false);

    // Touch
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = () => {
        handleSwipeEnd();
    };

    // Mouse
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        touchStartX.current = e.clientX;
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            touchEndX.current = e.clientX;
        }
    };
    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
            handleSwipeEnd();
        }
    };
    const handleMouseLeave = () => {
        if (isDragging) {
            setIsDragging(false);
        }
    };

    const handleSwipeEnd = () => {
        const diff = touchStartX.current - touchEndX.current;
        // Only trigger if we actually moved (touchEndX is set)
        if (touchEndX.current !== 0 && Math.abs(diff) > 50) {
            if (diff > 0 && carouselIndex < 2) {
                setCarouselIndex(carouselIndex + 1);
            } else if (diff < 0 && carouselIndex > 0) {
                setCarouselIndex(carouselIndex - 1);
            }
        }
        // Reset
        touchEndX.current = 0;
    };

    useEffect(() => { setHabits(getHabits()); }, [key]);

    // Scroll calendar to today
    const scrollToToday = useCallback(() => {
        if (calRef.current) {
            const todayIndex = 14; // approx index of today in the 21-day range
            const dayWidth = 56; // approx width of each day cell + gap
            calRef.current.scrollTo({
                left: todayIndex * dayWidth - calRef.current.offsetWidth / 2 + dayWidth / 2,
                behavior: 'smooth'
            });
        }
    }, []);

    // Initial scroll to today
    useEffect(() => {
        scrollToToday();
    }, [scrollToToday]);

    const days = useCallback(() => {
        const arr: Date[] = [];
        const today = new Date();
        for (let i = -14; i <= 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            arr.push(d);
        }
        return arr;
    }, []);

    const { completed, total } = getTodayProgress();
    const todayStr = formatDate(new Date());
    const pct = total > 0 ? (completed / total) * 100 : 0;

    // Celebration confetti when all habits complete + Rio celebration
    useEffect(() => {
        if (total > 0 && completed === total && prevCompletedRef.current !== total) {
            setShowConfetti(true);
            triggerMascot('celebrating', 'complete', '🎉 All habits done! You\'re amazing!');
            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200]);
            setTimeout(() => setShowConfetti(false), 4000);
        }
        prevCompletedRef.current = completed;
    }, [completed, total, triggerMascot]);

    // Rio contextual awareness - trigger on mount and after habit changes
    useEffect(() => {
        // Small delay to let other animations finish
        const timer = setTimeout(() => {
            const awareness = getHabitAwarenessMessage();
            if (awareness) {
                triggerMascot(awareness.state as 'greeting' | 'encouraging' | 'celebrating' | 'thinking' | 'idle', 'greeting', awareness.message);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [key, triggerMascot]);

    return (
        <div className="w-full max-w-4xl mx-auto px-4 md:px-6">
            {/* Celebration Confetti - falling particles only, no center overlay */}
            {showConfetti && (
                <div className="fixed inset-0 pointer-events-none z-[300] overflow-hidden">
                    {[...Array(60)].map((_, i) => (
                        <div
                            key={i}
                            className="absolute animate-confetti"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `-20px`,
                                animationDelay: `${Math.random() * 2}s`,
                                animationDuration: `${2 + Math.random() * 2}s`,
                            }}
                        >
                            <div
                                style={{
                                    width: `${8 + Math.random() * 10}px`,
                                    height: `${8 + Math.random() * 10}px`,
                                    backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444'][Math.floor(Math.random() * 6)],
                                    borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                                    transform: `rotate(${Math.random() * 360}deg)`,
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Header */}
            <div className="mb-6">
                <h1 className={`text-2xl md:text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    ✅ Habit Tracker
                </h1>
                <p className={`text-sm md:text-base mt-1 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                    Build consistency, one day at a time
                </p>
            </div>

            {/* Progress + Calendar Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                {/* Swipeable Progress Carousel */}
                <div
                    className={`rounded-2xl p-5 overflow-hidden select-none cursor-grab active:cursor-grabbing ${isDark ? 'bg-slate-800/60 border border-slate-700/50' : 'bg-white border border-gray-100 shadow-sm'}`}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                >
                    {/* View 1: Today's Progress */}
                    {carouselIndex === 0 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Today's Progress</p>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className={`text-4xl font-black ${isDark ? 'text-white' : 'text-gray-800'}`}>{completed}</span>
                                        <span className={`text-xl font-bold ${isDark ? 'text-slate-600' : 'text-gray-300'}`}>/ {total}</span>
                                    </div>
                                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                        {total === 0 ? 'Add habits to start' : completed === total ? '🎉 All done!' : `${total - completed} remaining`}
                                    </p>
                                </div>
                                <div className={`relative w-16 h-16 ${showConfetti ? 'animate-pulse' : ''}`}>
                                    {showConfetti && (
                                        <div className="absolute inset-0 animate-spin-slow">
                                            <div className="absolute inset-0 animate-ping rounded-full" style={{ border: '3px solid #8b5cf6', opacity: 0.6 }} />
                                        </div>
                                    )}
                                    <svg className="w-full h-full -rotate-90">
                                        <circle cx="32" cy="32" r="28" stroke={isDark ? '#334155' : '#e2e8f0'} strokeWidth="5" fill="none" />
                                        <circle cx="32" cy="32" r="28" stroke="url(#habitProgress)" strokeWidth="5" fill="none" strokeLinecap="round"
                                            strokeDasharray={`${2 * Math.PI * 28}`} strokeDashoffset={`${2 * Math.PI * 28 * (1 - pct / 100)}`} />
                                        <defs>
                                            <linearGradient id="habitProgress" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#3b82f6" />
                                                <stop offset="100%" stopColor="#8b5cf6" />
                                            </linearGradient>
                                        </defs>
                                    </svg>
                                    <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                                        {Math.round(pct)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* View 2: Weekly Summary */}
                    {carouselIndex === 1 && (
                        <div className="animate-fade-in">
                            {(() => {
                                const weekly = getWeeklyStats();
                                return (
                                    <div>
                                        <p className={`text-sm font-medium mb-3 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>This Week</p>
                                        {/* Bar Chart */}
                                        <div className="flex items-end justify-between gap-1 h-12 mb-2">
                                            {weekly.days.map((day, i) => (
                                                <div key={day.date} className="flex-1 flex flex-col items-center">
                                                    <div
                                                        className={`w-full rounded-t transition-all ${day.pct === 100 ? 'bg-gradient-to-t from-blue-500 to-purple-500' : day.pct > 0 ? 'bg-blue-400' : isDark ? 'bg-slate-700' : 'bg-gray-200'}`}
                                                        style={{ height: `${Math.max(4, day.pct * 0.4)}px` }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        {/* Day Labels */}
                                        <div className="flex justify-between gap-1 mb-3">
                                            {weekly.days.map((day) => (
                                                <span key={day.date} className={`flex-1 text-center text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                                    {day.dayName}
                                                </span>
                                            ))}
                                        </div>
                                        {/* Stats */}
                                        <div className="flex items-center justify-between text-xs">
                                            <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                                                Avg: <span className="font-bold text-blue-500">{weekly.avgCompletion}%</span>
                                            </span>
                                            <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                                                Best: <span className="font-bold text-purple-500">{weekly.bestDay}</span>
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* View 3: 30-Day Trend */}
                    {carouselIndex === 2 && (
                        <div className="animate-fade-in">
                            {(() => {
                                const trend = getTrendData();
                                const maxPct = Math.max(...trend.points.map(p => p.pct), 1);
                                return (
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>30-Day Trend</p>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trend.trend === 'up' ? 'bg-green-500/20 text-green-500' :
                                                trend.trend === 'down' ? 'bg-red-500/20 text-red-500' :
                                                    isDark ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                {trend.trend === 'up' ? '↑' : trend.trend === 'down' ? '↓' : '→'} {Math.abs(trend.trendDiff)}%
                                            </span>
                                        </div>
                                        {/* Sparkline */}
                                        <div className="flex items-end gap-[2px] h-10 mb-2">
                                            {trend.points.map((point, i) => (
                                                <div
                                                    key={point.date}
                                                    className={`flex-1 rounded-sm transition-all ${point.pct === 100 ? 'bg-gradient-to-t from-emerald-500 to-teal-400' :
                                                        point.pct > 50 ? 'bg-blue-400' :
                                                            point.pct > 0 ? 'bg-blue-300' :
                                                                isDark ? 'bg-slate-700' : 'bg-gray-200'
                                                        }`}
                                                    style={{ height: `${Math.max(2, (point.pct / maxPct) * 36)}px` }}
                                                />
                                            ))}
                                        </div>
                                        {/* Weekly Comparison */}
                                        <div className="flex items-center justify-between text-xs">
                                            <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                                                This week: <span className="font-bold text-blue-500">{trend.currentWeekAvg}%</span>
                                            </span>
                                            <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                                                Last week: <span className="font-bold">{trend.lastWeekAvg}%</span>
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Dot Indicators */}
                    <div className="flex justify-center gap-2 mt-4">
                        {[0, 1, 2].map(i => (
                            <button
                                key={i}
                                onClick={() => setCarouselIndex(i)}
                                className={`w-2 h-2 rounded-full transition-all ${carouselIndex === i
                                    ? 'bg-blue-500 w-4'
                                    : isDark ? 'bg-slate-600' : 'bg-gray-300'
                                    }`}
                            />
                        ))}
                    </div>
                </div>

                {/* Calendar */}
                <div className="lg:col-span-2 relative">
                    <button
                        onClick={() => calRef.current?.scrollBy({ left: -150, behavior: 'smooth' })}
                        className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full items-center justify-center hidden md:flex ${isDark ? 'bg-slate-800/50 text-slate-500 hover:bg-slate-700' : 'bg-white/80 text-gray-400 shadow-sm hover:bg-gray-50'}`}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div ref={calRef} className="flex gap-2 overflow-x-auto hide-scrollbar px-10 py-2">
                        {days().map(d => (
                            <CalendarDay
                                key={d.toISOString()}
                                date={d}
                                isToday={formatDate(d) === todayStr}
                                isSelected={formatDate(d) === date}
                                onSelect={() => setDate(formatDate(d))}
                                isDark={isDark}
                            />
                        ))}
                    </div>
                    <button
                        onClick={() => calRef.current?.scrollBy({ left: 150, behavior: 'smooth' })}
                        className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full items-center justify-center hidden md:flex ${isDark ? 'bg-slate-800/50 text-slate-500 hover:bg-slate-700' : 'bg-white/80 text-gray-400 shadow-sm hover:bg-gray-50'}`}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div >

            {/* Date Label */}
            {
                date !== todayStr && (
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <span className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </span>
                        <button
                            onClick={() => { setDate(todayStr); scrollToToday(); }}
                            className="text-blue-500 text-sm font-semibold hover:underline"
                        >
                            Back to Today
                        </button>
                    </div>
                )
            }

            {/* Habits List */}
            <div className="space-y-4 mb-24 lg:mb-0">
                {habits.length === 0 && !showArchived ? (
                    <div className={`col-span-full rounded-2xl p-8 text-center ${isDark ? 'bg-slate-800/40 border border-dashed border-slate-700' : 'bg-gray-50 border border-dashed border-gray-200'}`}>
                        <span className="text-4xl">🌱</span>
                        <p className={`text-lg font-medium mt-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>No habits yet</p>
                        <p className={`text-sm mt-1 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Start building better habits today!</p>
                        <button
                            onClick={() => setModal(true)}
                            className="mt-4 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg"
                        >
                            Add Your First Habit
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowArchived(!showArchived)}
                                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${showArchived
                                    ? 'bg-orange-500 text-white'
                                    : isDark ? 'text-slate-500 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'
                                    }`}
                            >
                                {showArchived ? <ChevronLeft className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                                {showArchived ? 'Back to Habits' : 'Archived Habits'}
                            </button>
                        </div>

                        {habits
                            .filter(h => showArchived ? h.archived : !h.archived) // Filter condition
                            .map(h => (
                                <HabitCard
                                    key={h.id}
                                    habit={h}
                                    selectedDate={date}
                                    onToggle={() => handleHabitToggle(h.id, date)}
                                    onDelete={() => { deleteHabit(h.id); setKey(k => k + 1); }}
                                    onArchive={() => {
                                        if (h.archived) { unarchiveHabit(h.id); } else { archiveHabit(h.id); }
                                        setKey(k => k + 1);
                                    }}
                                    onEdit={() => { setEditing(h); setModal(true); }}
                                    isDark={isDark}
                                    // Drag props
                                    draggable={!showArchived}
                                    onDragStart={(e) => handleDragStart(e, h.id)}
                                    onDragOver={(e) => handleDragOver(e, h.id)}
                                    onDragEnd={handleDragEnd}
                                    onReorder={(targetId) => {
                                        reorderHabits(h.id, targetId);
                                        setKey(k => k + 1);
                                    }}
                                />
                            ))}

                        {/* Empty state for archived */}
                        {showArchived && habits.filter(h => h.archived).length === 0 && (
                            <div className={`text-center py-8 border-2 border-dashed rounded-xl ${isDark ? 'border-slate-800 text-slate-500' : 'border-gray-100 text-gray-400'}`}>
                                <Archive className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No archived habits</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* FAB - Floating Add Button - positioned to avoid Rio mascot */}
            {
                !showArchived && (
                    <button
                        onClick={() => { setEditing(null); setModal(true); }}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 md:bottom-8 md:left-8 md:translate-x-0 px-5 py-3 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl flex items-center gap-2 z-40 hover:scale-105 transition-transform"
                        style={{ boxShadow: '0 8px 25px rgba(99, 102, 241, 0.4)' }}
                    >
                        <Plus className="w-5 h-5" />
                        <span className="font-bold text-sm">Add Habit</span>
                    </button>
                )
            }

            {/* Modal */}
            <HabitModal
                isOpen={modal}
                onClose={() => { setModal(false); setEditing(null); }}
                onSave={d => { editing ? updateHabit(editing.id, d) : addHabit(d); setKey(k => k + 1); }}
                isDark={isDark}
                editing={editing}
            />

            {/* XP Popup */}
            <XPPopup
                xpGain={xpPopup.xpGain}
                coinsDrop={xpPopup.coinsDrop}
                onComplete={() => setXpPopup({ xpGain: null, coinsDrop: 0 })}
            />

            {/* Level Up Celebration */}
            {levelUpInfo && (
                <LevelUpCelebration
                    levelInfo={levelUpInfo.levelInfo}
                    coinsEarned={levelUpInfo.coins}
                    onClose={() => setLevelUpInfo(null)}
                />
            )}

            {/* Streak Rescue Modal */}
            {rescuedStreak && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 animate-fade-in">
                    <div className={`rounded-3xl p-8 max-w-sm w-full text-center relative overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
                        {/* Shield Background Effect */}
                        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-blue-500/20 to-transparent pointer-events-none" />

                        <div className="w-20 h-20 mx-auto text-6xl mb-4 animate-bounce-soft">🛡️</div>

                        <h2 className={`text-2xl font-black mb-2 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Streak Rescued!</h2>

                        <p className={`mb-6 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                            You missed a day for <span className="font-bold text-blue-500">{rescuedStreak}</span>, but your <span className="font-bold">Streak Shield</span> saved you!
                        </p>

                        <div className={`p-4 rounded-xl mb-6 ${isDark ? 'bg-slate-800' : 'bg-blue-50'}`}>
                            <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Streak saved</p>
                            <div className="flex items-center justify-center gap-2 mt-1">
                                <span className={`text-lg font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>Previous Day</span>
                                <span className="text-gray-400">→</span>
                                <span className={`text-lg font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Completed ✅</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setRescuedStreak(null)}
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Awesome!
                        </button>
                    </div>
                </div>
            )}
        </div >
    );
};

export default HabitTracker;
