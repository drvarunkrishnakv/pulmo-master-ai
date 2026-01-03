import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { MascotState } from '../components/RioMascot';

interface MascotContextType {
    mascotState: MascotState;
    bubble: { show: boolean; text: string };
    triggerMascot: (state: MascotState, messageType: 'greeting' | 'correct' | 'wrong' | 'streak' | 'complete' | 'scoreHigh' | 'scoreMid' | 'scoreLow' | 'milestone' | 'break' | 'levelUp' | 'coinDrop' | 'xpBonus' | 'streakFreeze', customText?: string) => void;
    setBubble: (show: boolean, text: string) => void;
    setMascotState: (state: MascotState) => void;
}

const MascotContext = createContext<MascotContextType | undefined>(undefined);

const mascotMessages = {
    greeting: ['Ready to learn! 📚', 'Let\'s do this! 💪', 'Hello, Doc! 👋'],
    correct: ['Brilliant! 🎯', 'Nailed it! ✨', 'You\'re on fire! 🔥', 'Perfect! 💯'],
    wrong: ['Keep going! 💪', 'You\'ll get it! 🌟', 'Learning moment! 📖', 'Next one\'s yours! 👊'],
    streak: ['Amazing streak! 🔥', '3 in a row! 🚀', 'Unstoppable! ⚡'],
    complete: ['Great work! 🎉', 'Session done! 🏆'],
    scoreHigh: ['You\'re crushing it! 🏆', 'Excellent work! ⭐', 'NEET-SS ready! 🎓'],
    scoreMid: ['Good progress! 📈', 'Keep pushing! 💪', 'You\'re improving! 🌱'],
    scoreLow: ['Every attempt counts! 📚', 'Review and try again! 🔄', 'You\'ve got this! 💙'],
    milestone: ['Amazing achievement! 🏆', 'You unlocked something! 🎁', 'Look at you go! 🚀'],
    break: ['Time for a quick break? 🧘', 'Your brain needs a breather! ☕', 'Take 5 minutes? 💪'],
    // Gamification messages
    levelUp: ['LEVEL UP! 🎉', 'You leveled up! 🚀', 'New level unlocked! 📈', 'So proud of you! 🌟'],
    coinDrop: ['Ooh, gems! 💎', 'Lucky drop! 💎', 'Bonus gems! ✨', 'Treasure found! 💰'],
    xpBonus: ['Bonus XP! ⚡', 'XP boost! 🔥', 'Extra XP earned! 💪', 'Streak bonus! ✨'],
    streakFreeze: ['Streak saved! 🧊', 'Freeze activated! ❄️', 'Your streak is safe! 💪']
};

export const MascotProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [mascotState, setMascotState] = useState<MascotState>('idle');
    const [bubble, setBubbleState] = useState<{ show: boolean; text: string }>({ show: false, text: '' });

    const triggerMascot = useCallback((state: MascotState, messageType: keyof typeof mascotMessages, customText?: string) => {
        let message = customText;
        if (!message) {
            const messages = mascotMessages[messageType];
            message = messages[Math.floor(Math.random() * messages.length)];
        }

        setMascotState(state);
        setBubbleState({ show: true, text: message || '' });

        // Auto reset after animation (approx 3s)
        setTimeout(() => {
            setMascotState('idle');
            setBubbleState({ show: false, text: '' });
        }, 3000);
    }, []);

    // Wrapper function to match the interface signature
    const setBubble = useCallback((show: boolean, text: string) => {
        setBubbleState({ show, text });
    }, []);

    return (
        <MascotContext.Provider value={{ mascotState, bubble, triggerMascot, setBubble, setMascotState }}>
            {children}
        </MascotContext.Provider>
    );
};

export const useMascot = () => {
    const context = useContext(MascotContext);
    if (!context) {
        throw new Error('useMascot must be used within a MascotProvider');
    }
    return context;
};
