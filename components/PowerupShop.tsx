import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useMascot } from '../contexts/MascotContext';
import {
    getGamificationStats,
    purchaseStreakFreeze,
    purchaseHints,
    purchaseXPBoost,
    SHOP_PRICES,
} from '../services/gamificationService';
import { X, ShoppingBag, Zap, Lightbulb, Shield } from 'lucide-react';

interface PowerupShopProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ShopItem {
    id: string;
    name: string;
    description: string;
    price: number;
    icon: React.ReactNode;
    emoji: string;
    purchase: () => boolean;
    getOwned: () => number;
}

const PowerupShop: React.FC<PowerupShopProps> = ({ isOpen, onClose }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const { triggerMascot } = useMascot();
    const [stats, setStats] = useState(getGamificationStats());
    const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);

    const refreshStats = () => setStats(getGamificationStats());

    const shopItems: ShopItem[] = [
        {
            id: 'streak_freeze',
            name: 'Streak Freeze',
            description: 'Protect your streak for 1 day if you miss practice',
            price: SHOP_PRICES.STREAK_FREEZE,
            icon: <Shield className="w-6 h-6" />,
            emoji: '🧊',
            purchase: purchaseStreakFreeze,
            getOwned: () => stats.streakFreezes,
        },
        {
            id: 'hints',
            name: '50/50 Hints (x3)',
            description: 'Eliminate 2 wrong options from any question',
            price: SHOP_PRICES.HINTS_3,
            icon: <Lightbulb className="w-6 h-6" />,
            emoji: '💡',
            purchase: purchaseHints,
            getOwned: () => stats.hintsRemaining,
        },
        {
            id: 'xp_boost',
            name: 'XP Boost (10 Qs)',
            description: 'Double XP on your next 10 questions',
            price: SHOP_PRICES.XP_BOOST_10,
            icon: <Zap className="w-6 h-6" />,
            emoji: '⚡',
            purchase: purchaseXPBoost,
            getOwned: () => stats.xpBoostRemaining,
        },
    ];

    const handlePurchase = (item: ShopItem) => {
        if (stats.coins < item.price) {
            setPurchaseMessage(`Not enough gems! Need ${item.price - stats.coins} more 💎`);
            setTimeout(() => setPurchaseMessage(null), 2000);
            return;
        }

        const success = item.purchase();
        if (success) {
            refreshStats();
            setPurchaseMessage(`${item.emoji} ${item.name} purchased!`);
            triggerMascot('celebrating', 'correct', `Nice! ${item.name} ready to use! 🎉`);
            setTimeout(() => setPurchaseMessage(null), 2000);

            // Haptic feedback
            if ('vibrate' in navigator) {
                navigator.vibrate([50, 30, 50]);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 animate-fade-in">
            <div className={`
                relative max-w-md w-full rounded-3xl overflow-hidden
                ${isDark
                    ? 'bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700'
                    : 'bg-gradient-to-b from-white to-gray-50 border border-gray-200'
                }
                shadow-2xl animate-pop
            `}>
                {/* Header */}
                <div className={`
                    px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-2
                    ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-gray-50'}
                `}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`
                            p-2 rounded-xl flex-shrink-0
                            ${isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-600'}
                        `}>
                            <ShoppingBag className="w-5 h-5" />
                        </div>
                        <h2 className={`text-base sm:text-lg font-bold truncate ${isDark ? 'text-white' : 'text-gray-800'}`}>
                            Powerup Shop
                        </h2>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Coin balance */}
                        <div className={`
                            flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm
                            ${isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-600'}
                        `}>
                            <span>💎</span>
                            <span>{stats.coins}</span>
                        </div>

                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className={`
                                p-2 rounded-full transition-colors flex-shrink-0
                                ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-gray-500'}
                            `}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Purchase message */}
                {purchaseMessage && (
                    <div className={`
                        mx-6 mt-4 px-4 py-2 rounded-xl text-center text-sm font-medium animate-pop
                        ${purchaseMessage.includes('Not enough')
                            ? isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-600'
                            : isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-600'
                        }
                    `}>
                        {purchaseMessage}
                    </div>
                )}

                {/* Shop items */}
                <div className="p-4 space-y-3">
                    {shopItems.map((item) => {
                        const owned = item.getOwned();
                        const canAfford = stats.coins >= item.price;

                        return (
                            <div
                                key={item.id}
                                className={`
                                    p-4 rounded-2xl border transition-all
                                    ${isDark
                                        ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                                        : 'bg-white border-gray-200 hover:border-gray-300'
                                    }
                                `}
                            >
                                <div className="flex items-start gap-4">
                                    {/* Icon */}
                                    <div className={`
                                        p-3 rounded-xl text-2xl
                                        ${isDark ? 'bg-slate-700' : 'bg-gray-100'}
                                    `}>
                                        {item.emoji}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className={`font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                                                {item.name}
                                            </h3>
                                            {owned > 0 && (
                                                <span className={`
                                                    px-2 py-0.5 rounded-full text-xs font-medium
                                                    ${isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'}
                                                `}>
                                                    Owned: {owned}
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {item.description}
                                        </p>
                                    </div>

                                    {/* Buy button */}
                                    <button
                                        onClick={() => handlePurchase(item)}
                                        disabled={!canAfford}
                                        className={`
                                            px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2
                                            transition-all
                                            ${canAfford
                                                ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white hover:scale-105 shadow-lg'
                                                : isDark
                                                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                            }
                                        `}
                                    >
                                        <span>💎</span>
                                        <span>{item.price}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer tip */}
                <div className={`
                    px-6 py-4 text-center text-xs border-t
                    ${isDark ? 'border-slate-700 text-slate-500' : 'border-gray-200 text-gray-400'}
                `}>
                    💡 Earn gems by answering questions correctly and completing milestones!
                </div>
            </div>
        </div>
    );
};

export default PowerupShop;
