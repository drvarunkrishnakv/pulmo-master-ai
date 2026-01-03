import React, { useState, useEffect } from 'react';
import RioMascot from './RioMascot';

interface RioNudgeProps {
    isVisible: boolean;
    onDismiss: () => void;
    onAction: (action: 'sprint' | 'practice' | 'random') => void;
}

const nudgeMessages = [
    { text: "Ready for a quick sprint? ⚡", action: 'sprint' as const },
    { text: "Let's practice some questions! 📚", action: 'practice' as const },
    { text: "How about a random challenge? 🎲", action: 'random' as const },
    { text: "Your brain needs a workout! 💪", action: 'sprint' as const },
    { text: "Time to crush some MCQs! 🔥", action: 'practice' as const },
];

const RioNudge: React.FC<RioNudgeProps> = ({ isVisible, onDismiss, onAction }) => {
    const [nudge] = useState(() => nudgeMessages[Math.floor(Math.random() * nudgeMessages.length)]);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (isVisible) {
            setIsAnimating(true);
        }
    }, [isVisible]);

    if (!isVisible) return null;

    return (
        <div
            className={`fixed bottom-24 md:bottom-8 right-4 z-50 transition-all duration-500 ${isAnimating ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
                }`}
        >
            <div className="bg-white rounded-2xl shadow-2xl border border-blue-100 p-4 max-w-[280px] animate-bounce-subtle">
                {/* Close button */}
                <button
                    onClick={onDismiss}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-gray-200 rounded-full text-gray-500 text-xs flex items-center justify-center hover:bg-gray-300 transition-colors"
                >
                    ✕
                </button>

                {/* Rio with message */}
                <div className="flex items-start gap-3">
                    <RioMascot
                        state="suggesting"
                        size="small"
                        position="inline"
                        variant="inline"
                    />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800 mb-3">
                            {nudge.text}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onAction(nudge.action)}
                                className="btn-press flex-1 py-2 gradient-blue text-white text-xs font-bold rounded-lg shadow-sm"
                            >
                                Let's Go!
                            </button>
                            <button
                                onClick={onDismiss}
                                className="btn-press px-3 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg"
                            >
                                Later
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RioNudge;
