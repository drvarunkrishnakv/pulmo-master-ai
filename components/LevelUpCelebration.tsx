import React, { useEffect, useState } from 'react';
import RioMascot from './RioMascot';
import { useTheme } from '../contexts/ThemeContext';
import { LevelInfo } from '../services/gamificationService';

interface LevelUpCelebrationProps {
    levelInfo: LevelInfo;
    coinsEarned: number;
    onClose: () => void;
}

const LevelUpCelebration: React.FC<LevelUpCelebrationProps> = ({
    levelInfo,
    coinsEarned,
    onClose,
}) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [showContent, setShowContent] = useState(false);

    useEffect(() => {
        // Haptic feedback
        if ('vibrate' in navigator) {
            navigator.vibrate([100, 50, 100, 50, 200]);
        }

        // Delay content reveal for dramatic effect
        setTimeout(() => setShowContent(true), 300);
    }, []);

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
            {/* Confetti-like particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(20)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute animate-confetti"
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: '-20px',
                            animationDelay: `${Math.random() * 2}s`,
                            animationDuration: `${2 + Math.random() * 2}s`,
                        }}
                    >
                        {['✨', '⭐', '🌟', '💫', '🎉', '🎊'][Math.floor(Math.random() * 6)]}
                    </div>
                ))}
            </div>

            {/* Modal */}
            <div className={`
                relative max-w-sm w-full rounded-3xl p-6 text-center
                ${isDark
                    ? 'bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700'
                    : 'bg-gradient-to-b from-white to-blue-50 border border-blue-100'
                }
                shadow-2xl animate-pop
            `}>
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-yellow-500/20 via-purple-500/20 to-pink-500/20 blur-xl -z-10" />

                {/* Header sparkle row */}
                <div className="flex justify-center gap-2 mb-2 text-2xl animate-bounce-subtle">
                    <span>✨</span>
                    <span>🎉</span>
                    <span>✨</span>
                </div>

                {/* Title */}
                <h2 className={`text-2xl font-black mb-4 bg-gradient-to-r from-yellow-500 via-purple-500 to-pink-500 bg-clip-text text-transparent`}>
                    LEVEL UP!
                </h2>

                {/* Rio celebration */}
                <div className={`transition-all duration-500 ${showContent ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                    <RioMascot
                        state="celebrating"
                        size="xlarge"
                        variant="presenter"
                        showBubble={true}
                        bubbleText="Amazing progress! 🚀"
                    >
                        <div className={`mt-4 rounded-2xl p-4 ${isDark ? 'bg-slate-800/50' : 'bg-white/50'
                            } backdrop-blur-sm`}>
                            {/* Level badge */}
                            <div className="flex items-center justify-center gap-3 mb-3">
                                <span className="text-4xl">{levelInfo.icon}</span>
                                <div className="text-left">
                                    <p className={`text-3xl font-black ${isDark ? 'text-white' : 'text-gray-800'}`}>
                                        Level {levelInfo.level}
                                    </p>
                                    <p className={`text-lg font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                        {levelInfo.title}
                                    </p>
                                </div>
                            </div>

                            {/* Coin bonus */}
                            {coinsEarned > 0 && (
                                <div className={`
                                    inline-flex items-center gap-2 px-4 py-2 rounded-full
                                    bg-gradient-to-r from-amber-400 to-yellow-500 text-white font-bold
                                    animate-bounce-subtle
                                `}>
                                    <span className="text-lg">💎</span>
                                    <span>+{coinsEarned} gems bonus!</span>
                                </div>
                            )}
                        </div>
                    </RioMascot>
                </div>

                {/* Continue button */}
                <button
                    onClick={onClose}
                    className={`
                        mt-6 w-full py-3 px-6 rounded-xl font-bold text-white
                        bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500
                        hover:from-blue-600 hover:via-indigo-600 hover:to-purple-600
                        transition-all duration-300 hover:scale-105
                        shadow-lg hover:shadow-xl
                    `}
                >
                    Continue 🚀
                </button>
            </div>
        </div>
    );
};

export default LevelUpCelebration;
