import React from 'react';
import { useMascot } from '../contexts/MascotContext';
import RioMascot from './RioMascot';

const GlobalMascot: React.FC = () => {
    const { mascotState, bubble, setMascotState, setBubble } = useMascot();
    const [internalState, setInternalState] = React.useState<any>('idle');
    const [isIdle, setIsIdle] = React.useState(false);
    const idleTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    // Sync with global state, but allow local override for sleeping
    React.useEffect(() => {
        if (mascotState !== 'idle') {
            setInternalState(mascotState);
            setIsIdle(false);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            startIdleTimer();
        } else if (!isIdle) {
            setInternalState('idle');
            startIdleTimer();
        }
    }, [mascotState]);

    const startIdleTimer = () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            setIsIdle(true);
            setInternalState('sleeping');
        }, 30000); // Sleep after 30s of inactivity
    };

    // Wake up handler
    const handleWakeUp = () => {
        if (internalState === 'sleeping') {
            setIsIdle(false);
            setInternalState('greeting');

            // Random wake-up message
            const wakeMessages = [
                "Huh? I'm awake! 🦦",
                "Ready to study now? 📚",
                "Just resting my eyes... 😴",
                "Did I miss anything? 👀"
            ];
            const msg = wakeMessages[Math.floor(Math.random() * wakeMessages.length)];

            setBubble(true, msg);
            setTimeout(() => setBubble(false, ''), 3000);

            // Resume idle timer
            startIdleTimer();
        }
    };

    return (
        <>
            <RioMascot
                state={internalState}
                size="medium"
                variant="floating" // Default floating bottom-right
                showBubble={bubble.show}
                bubbleText={bubble.text}
                bubblePosition="top"
                onClick={internalState === 'sleeping' ? handleWakeUp : undefined}
            />
        </>
    );
};

export default GlobalMascot;
