import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { getGamificationStats, getStreakMultiplier } from '../services/gamificationService';
import { getStreakData } from '../services/streakService';

interface XPDisplayProps {
    compact?: boolean;
    showCoins?: boolean;
    onShopClick?: () => void;
}

const XPDisplay: React.FC<XPDisplayProps> = ({
    compact = false,
    showCoins = true,
    onShopClick
}) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const stats = getGamificationStats();
    const streakData = getStreakData();
    const multiplier = getStreakMultiplier();

    if (compact) {
        return (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isDark ? 'bg-slate-800/50' : 'bg-gray-100'
                }`}>
                <span>{stats.levelIcon}</span>
                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                    Lv.{stats.level}
                </span>
                {showCoins && (
                    <>
                        <span className={isDark ? 'text-slate-600' : 'text-gray-300'}>|</span>
                        <span className="text-amber-500">💎 {stats.coins}</span>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className={`rounded-2xl p-4 ${isDark
                ? 'bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50'
                : 'bg-gradient-to-br from-white to-blue-50/50 border border-blue-100/50 shadow-sm'
            }`}>
            {/* Level Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{stats.levelIcon}</span>
                    <div>
                        <p className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                            Level {stats.level}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {stats.levelTitle}
                        </p>
                    </div>
                </div>

                {/* Streak Multiplier Badge */}
                {multiplier > 1 && (
                    <div className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${multiplier >= 2
                            ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                            : multiplier >= 1.5
                                ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white'
                                : 'bg-yellow-100 text-yellow-700'
                        }`}>
                        🔥 {multiplier}x
                    </div>
                )}
            </div>

            {/* XP Progress Bar */}
            <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                    <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                        {stats.totalXP.toLocaleString()} XP
                    </span>
                    <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                        {stats.xpToNextLevel.toLocaleString()} to next
                    </span>
                </div>
                <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-200'
                    }`}>
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-500 relative overflow-hidden"
                        style={{ width: `${stats.levelProgress}%` }}
                    >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center justify-between">
                {/* Coins */}
                {showCoins && (
                    <button
                        onClick={onShopClick}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all hover:scale-105 ${isDark
                                ? 'bg-amber-900/20 text-amber-400 hover:bg-amber-900/30'
                                : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                            }`}
                    >
                        <span>💎</span>
                        <span>{stats.coins}</span>
                    </button>
                )}

                {/* Streak */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm ${streakData.currentStreak > 0
                        ? isDark
                            ? 'bg-orange-900/20 text-orange-400'
                            : 'bg-orange-50 text-orange-600'
                        : isDark
                            ? 'bg-slate-700/50 text-slate-400'
                            : 'bg-gray-100 text-gray-400'
                    }`}>
                    <span>{streakData.currentStreak > 0 ? '🔥' : '❄️'}</span>
                    <span className="font-medium">{streakData.currentStreak} day{streakData.currentStreak !== 1 ? 's' : ''}</span>
                </div>

                {/* Powerups indicator */}
                {(stats.hintsRemaining > 0 || stats.xpBoostRemaining > 0) && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${isDark ? 'bg-purple-900/20 text-purple-400' : 'bg-purple-50 text-purple-600'
                        }`}>
                        {stats.hintsRemaining > 0 && <span>💡{stats.hintsRemaining}</span>}
                        {stats.xpBoostRemaining > 0 && <span>⚡{stats.xpBoostRemaining}</span>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default XPDisplay;
