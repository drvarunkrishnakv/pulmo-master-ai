import React, { useEffect, useState } from 'react';
import { XPGain } from '../services/gamificationService';

interface XPPopupProps {
    xpGain: XPGain | null;
    coinsDrop?: number;
    onComplete?: () => void;
}

interface FloatingXP {
    id: number;
    xp: number;
    reason: string;
    coins: number;
}

const XPPopup: React.FC<XPPopupProps> = ({ xpGain, coinsDrop = 0, onComplete }) => {
    const [floatingItems, setFloatingItems] = useState<FloatingXP[]>([]);

    useEffect(() => {
        if (xpGain && xpGain.totalXP !== 0) {
            const newItem: FloatingXP = {
                id: Date.now(),
                xp: xpGain.totalXP,
                reason: xpGain.reason,
                coins: coinsDrop,
            };

            setFloatingItems(prev => [...prev, newItem]);

            // Remove after animation
            setTimeout(() => {
                setFloatingItems(prev => prev.filter(item => item.id !== newItem.id));
                onComplete?.();
            }, 2000);
        }
    }, [xpGain, coinsDrop]);

    if (floatingItems.length === 0) return null;

    return (
        <div className="fixed top-20 right-4 z-50 pointer-events-none flex flex-col gap-2">
            {floatingItems.map((item, index) => (
                <div
                    key={item.id}
                    className="animate-float-up"
                    style={{
                        animationDelay: `${index * 100}ms`,
                    }}
                >
                    {/* XP Badge */}
                    <div className="flex flex-col items-end gap-1">
                        <div className={`
                            px-4 py-2 rounded-full font-bold text-white shadow-lg
                            ${item.xp < 0
                                ? 'bg-gradient-to-r from-red-500 to-orange-500 text-sm'
                                : item.xp >= 50
                                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-lg'
                                    : item.xp >= 20
                                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500'
                                        : 'bg-gradient-to-r from-green-500 to-emerald-500 text-sm'
                            }
                        `}>
                            {item.xp < 0 ? `${item.xp} XP 😔` : `+${item.xp} XP ✨`}
                        </div>

                        {/* Reason tag */}
                        {item.reason && item.reason !== 'Attempt' && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                {item.reason}
                            </span>
                        )}

                        {/* Coin drop */}
                        {item.coins > 0 && (
                            <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-white font-bold text-sm shadow-lg animate-bounce-subtle">
                                💎 +{item.coins} gems!
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default XPPopup;

