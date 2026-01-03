import React, { useEffect, useRef, useState, memo } from 'react';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import { useTheme } from '../contexts/ThemeContext';

// Rio mascot states for different situations
export type MascotState =
    | 'idle'           // Resting, no waving
    | 'greeting'       // Wave once when appearing
    | 'celebrating'    // Wave enthusiastically for correct answers
    | 'encouraging'    // Wave for wrong answers - encouragement
    | 'thinking'       // Paused during quiz thinking time
    | 'cheering'       // Big celebration for milestones
    | 'presenting'     // Holding up/presenting something (scorecard)
    | 'sad'            // Sad expression (streak broken, low score)
    | 'sad'            // Sad expression (streak broken, low score)
    | 'suggesting'     // Suggesting an action (nudges)
    | 'sleeping';      // Idle sleep state with Zzz

// Display variants for different contexts
export type MascotVariant = 'floating' | 'inline' | 'presenter' | 'companion';

export interface RioMascotProps {
    state?: MascotState;
    size?: 'small' | 'medium' | 'large' | 'xlarge';
    position?: 'fixed' | 'inline';
    variant?: MascotVariant;
    className?: string;
    showBubble?: boolean;
    bubbleText?: string;
    bubblePosition?: 'top' | 'left' | 'right';
    contextMessage?: string; // Longer message below mascot
    onClick?: () => void;
    children?: React.ReactNode; // For presenter mode - content Rio "holds"
}

// Memoized component to prevent unnecessary re-renders
const RioMascot = memo<RioMascotProps>(({
    state = 'idle',
    size = 'medium',
    position = 'fixed',
    variant = 'floating',
    className = '',
    showBubble = false,
    bubbleText = '',
    bubblePosition = 'top',
    contextMessage = '',
    onClick,
    children
}) => {
    const lottieRef = useRef<LottieRefCurrentProps>(null);
    const [animationData, setAnimationData] = useState<object | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [hasWaved, setHasWaved] = useState(false);
    const [lastState, setLastState] = useState<MascotState>('idle');
    const [reactionState, setReactionState] = useState<MascotState | null>(null);
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Load animation data
    useEffect(() => {
        fetch('/animations/rio.json')
            .then(res => res.json())
            .then(data => {
                setAnimationData(data);
                // Fade in after loading
                setTimeout(() => setIsVisible(true), 100);
            })
            .catch(console.error);
    }, []);

    // Handle "Poke" interaction
    const handlePoke = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering parent clicks
        if (reactionState) return; // Already reacting

        // Haptic feedback
        if ('vibrate' in navigator) navigator.vibrate(10);

        // Random reaction
        const reactions: MascotState[] = ['greeting', 'celebrating', 'shy' as MascotState];
        // Note: 'shy' isn't in original types, defaulting to existing valid ones for now
        const validReactions: MascotState[] = ['greeting', 'celebrating', 'encouraging'];
        const randomReaction = validReactions[Math.floor(Math.random() * validReactions.length)];

        setReactionState(randomReaction);

        // Reset after animation
        setTimeout(() => {
            setReactionState(null);
        }, 2000);

        // Call optional parent onClick
        if (onClick) onClick();
    };

    // Determine effective state (prop vs reaction)
    const effectiveState = reactionState || state;

    // Control animation based on state
    useEffect(() => {
        if (!lottieRef.current || !animationData) return;

        const lottie = lottieRef.current;
        const currentState = reactionState || state;

        switch (currentState) {
            case 'idle':
                lottie.goToAndStop(0, true);
                break;

            case 'greeting':
                if (!hasWaved || lastState !== 'greeting' || reactionState === 'greeting') {
                    lottie.setSpeed(1);
                    lottie.goToAndPlay(0, true);
                    if (!reactionState) { // Only set hasWaved for natural greetings, not pokes
                        setTimeout(() => {
                            lottie.goToAndStop(0, true);
                            setHasWaved(true);
                        }, 1500);
                    }
                }
                break;

            case 'celebrating':
            case 'presenting':
                lottie.setSpeed(1.5);
                lottie.goToAndPlay(0, true);
                setTimeout(() => {
                    lottie.goToAndStop(0, true);
                }, 2000);
                break;

            case 'encouraging':
            case 'suggesting':
                lottie.setSpeed(0.8);
                lottie.goToAndPlay(0, true);
                setTimeout(() => {
                    lottie.goToAndStop(0, true);
                }, 1500);
                break;

            case 'thinking':
                lottie.goToAndStop(5, true);
                break;

            case 'cheering':
                lottie.setSpeed(1.3);
                lottie.play();
                setTimeout(() => {
                    lottie.goToAndStop(0, true);
                }, 3000);
                break;

            case 'sad':
                // Slower, more subdued animation
                lottie.setSpeed(0.5);
                lottie.goToAndPlay(0, true);
                setTimeout(() => {
                    lottie.goToAndStop(10, true);
                }, 1000);
                break;

            case 'sleeping':
                // Stop at a "eyes closed" frame if possible, or just play very slowly
                // Assuming frame 15 is a calm pose
                lottie.setSpeed(0.2);
                lottie.goToAndStop(10, true);
                break;
        }

        setLastState(currentState);
    }, [state, reactionState, animationData, hasWaved, lastState]);

    // Size mapping
    const sizeStyles = {
        small: { width: 50, height: 50 },
        medium: { width: 80, height: 80 },
        large: { width: 120, height: 120 },
        xlarge: { width: 160, height: 160 }
    };

    // Position styles based on variant
    const getPositionClasses = () => {
        if (position === 'inline') return '';

        switch (variant) {
            case 'floating':
                return 'fixed bottom-20 md:bottom-4 right-4 z-40';
            case 'presenter':
                return ''; // Presenter is always inline within a modal
            case 'companion':
                return 'fixed bottom-20 md:bottom-4 right-4 z-40';
            default:
                return '';
        }
    };

    // Bubble position classes - with dark mode support
    const getBubbleClasses = () => {
        const base = isDark
            ? 'absolute bg-gradient-to-r from-emerald-900/40 to-green-900/30 border border-emerald-500/30 px-3 py-1.5 rounded-xl shadow-lg text-sm font-medium text-emerald-300 animate-bounce-subtle z-50 max-w-[200px] md:max-w-xs text-center break-words'
            : 'absolute bg-white px-3 py-1.5 rounded-xl shadow-lg text-sm font-medium text-gray-700 animate-bounce-subtle z-50 max-w-[200px] md:max-w-xs text-center break-words';
        switch (bubblePosition) {
            case 'left':
                return `${base} -left-32 top-1/2 -translate-y-1/2`;
            case 'right':
                return `${base} -right-32 top-1/2 -translate-y-1/2`;
            default: // top
                return `${base} bottom-full mb-2 right-0 left-auto`;
        }
    };

    if (!animationData) {
        return null;
    }

    // Presenter variant - Rio above content she's "presenting"
    if (variant === 'presenter') {
        return (
            <div className={`flex flex-col items-center ${className}`}>
                {/* Speech bubble for presenter */}
                {showBubble && bubbleText && (
                    <div className={`px-4 py-2 rounded-xl shadow-lg text-sm font-medium mb-2 animate-fade-in max-w-[280px] md:max-w-sm text-center ${isDark
                            ? 'bg-gradient-to-r from-emerald-900/40 to-green-900/30 border border-emerald-500/30 text-emerald-300'
                            : 'bg-white text-gray-700'
                        }`}>
                        {bubbleText}
                    </div>
                )}

                {/* Rio */}
                <div
                    className={`
            transition-all duration-500 ease-out
            ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            ${state === 'celebrating' || state === 'cheering' || state === 'presenting' ? 'animate-bounce-soft' : ''}
          `}
                    style={sizeStyles[size]}
                >
                    <Lottie
                        lottieRef={lottieRef}
                        animationData={animationData}
                        loop={false}
                        autoplay={false}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>

                {/* Content Rio is presenting */}
                {children && (
                    <div className="animate-slide-up">
                        {children}
                    </div>
                )}

                {/* Context message below */}
                {contextMessage && (
                    <p className="text-sm text-gray-500 mt-2 text-center animate-fade-in">
                        {contextMessage}
                    </p>
                )}
            </div>
        );
    }

    // Companion variant - inline with content (for dashboard sections)
    if (variant === 'companion') {
        return (
            <div className={`flex items-center gap-3 ${className}`}>
                <div
                    className={`
            flex-shrink-0 transition-all duration-500 ease-out
            ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
            cursor-pointer hover:scale-110 active:scale-95
          `}
                    style={sizeStyles[size]}
                    onClick={handlePoke}
                >
                    <Lottie
                        lottieRef={lottieRef}
                        animationData={animationData}
                        loop={false}
                        autoplay={false}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>

                {/* Speech bubble as side text */}
                {showBubble && bubbleText && (
                    <div className={`px-3 py-2 rounded-xl border shadow-soft animate-fade-in max-w-[200px] md:max-w-xs ${isDark
                            ? 'bg-gradient-to-r from-emerald-900/40 to-green-900/30 border-emerald-500/30'
                            : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100'
                        }`}>
                        <p className={`text-sm font-medium break-words ${isDark ? 'text-emerald-300' : 'text-gray-700'}`}>{bubbleText}</p>
                    </div>
                )}
            </div>
        );
    }

    // Default floating/inline variant
    return (
        <div
            className={`
        ${getPositionClasses()}
        ${className}
        transition-all duration-500 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        cursor-pointer hover:scale-110 active:scale-95
      `}
            onClick={handlePoke}
            style={position === 'inline' ? sizeStyles[size] : undefined}
        >
            {/* Speech bubble */}
            {showBubble && bubbleText && (
                <div className={getBubbleClasses()}>
                    {bubbleText}
                </div>
            )}

            {/* Rio mascot */}
            <div
                className={`
          transition-transform duration-200
          ${effectiveState === 'celebrating' || effectiveState === 'cheering' || effectiveState === 'presenting' ? 'animate-bounce-soft' : ''}
          ${effectiveState === 'sad' ? 'opacity-80' : ''}
        `}
                style={sizeStyles[size]}
            >
                <Lottie
                    lottieRef={lottieRef}
                    animationData={animationData}
                    loop={false}
                    autoplay={false}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>

            {/* Sparkles for celebrations */}
            {(effectiveState === 'celebrating' || effectiveState === 'cheering' || effectiveState === 'presenting') && (
                <div className="absolute inset-0 pointer-events-none overflow-visible">
                    <span className="absolute -top-2 -left-2 text-lg animate-ping">✨</span>
                    <span className="absolute -top-1 -right-2 text-lg animate-ping delay-100">⭐</span>
                    <span className="absolute -bottom-1 -left-1 text-sm animate-ping delay-200">💫</span>
                </div>
            )}

            {/* Sleep Zzz Animation */}
            {state === 'sleeping' && (
                <div className="absolute top-0 right-0 pointer-events-none">
                    <span className="absolute bottom-0 right-4 text-xl font-bold text-blue-400 opacity-0 animate-float-zzz" style={{ animationDelay: '0ms' }}>Z</span>
                    <span className="absolute bottom-0 right-0 text-lg font-bold text-blue-300 opacity-0 animate-float-zzz" style={{ animationDelay: '800ms' }}>z</span>
                    <span className="absolute bottom-0 right-6 text-sm font-bold text-blue-200 opacity-0 animate-float-zzz" style={{ animationDelay: '1600ms' }}>z</span>
                </div>
            )}

            {/* Context message below */}
            {contextMessage && position === 'inline' && (
                <p className="text-xs text-gray-500 mt-1 text-center">{contextMessage}</p>
            )}
        </div>
    );
});

RioMascot.displayName = 'RioMascot';

export default RioMascot;
