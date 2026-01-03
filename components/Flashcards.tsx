import React, { useState, useRef, TouchEvent, useEffect, useCallback } from 'react';
import {
    DynamicFlashcard,
    getFlashcardsForSession,
    updateFlashcardSRS
} from '../services/flashcardService';
import { getRioMessage, getRioState } from '../services/rioService';
import RioMascot from './RioMascot';
import { MascotState } from './RioMascot';

// Haptic feedback
const vibrate = (pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

interface FlashcardsProps {
    onClose?: () => void;
}

const Flashcards: React.FC<FlashcardsProps> = ({ onClose }) => {
    // Card state
    const [cards, setCards] = useState<DynamicFlashcard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Session stats
    const [sessionStats, setSessionStats] = useState({
        reviewed: 0,
        knew: 0,
        didntKnow: 0
    });

    // Rio state
    const [rioState, setRioState] = useState<MascotState>('greeting');
    const [rioMessage, setRioMessage] = useState('');
    const [showRioBubble, setShowRioBubble] = useState(true);

    // Swipe handling
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
    const touchStartX = useRef<number>(0);
    const touchStartY = useRef<number>(0);
    const isHorizontalSwipe = useRef<boolean | null>(null);

    const currentCard = cards[currentIndex];

    // Load flashcards on mount
    useEffect(() => {
        const loadCards = async () => {
            try {
                const result = await getFlashcardsForSession(25);
                const sessionCards = result.cards || [];
                const dueCount = result.dueCount || 0;
                const newCount = result.newCount || 0;

                setCards(sessionCards);
                setIsLoading(false);

                // Initial Rio message
                if (sessionCards.length > 0) {
                    if (dueCount > 0) {
                        setRioMessage(`${dueCount} cards to review! Let's go! 🚀`);
                    } else if (newCount > 0) {
                        setRioMessage(`${newCount} new cards from your weak areas! 💪`);
                    } else {
                        setRioMessage(getRioMessage('flashcard_start'));
                    }
                } else {
                    setRioMessage("Loading flashcards... 📚");
                    setRioState('suggesting');
                }

                // Hide bubble after 3 seconds
                setTimeout(() => setShowRioBubble(false), 3000);
            } catch (error) {
                console.error('Error loading flashcards:', error);
                setCards([]);
                setIsLoading(false);
                setRioMessage("Oops! Couldn't load cards. Try again!");
            }
        };

        loadCards();
    }, []);


    // Keyboard navigation for desktop
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                handleSwipeComplete('left');
            } else if (e.key === 'ArrowRight') {
                handleSwipeComplete('right');
            } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                vibrate(10);
                setIsFlipped(!isFlipped);
            } else if (e.key === 'Escape' && onClose) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFlipped, onClose, currentIndex, cards.length]);

    // Handle swipe complete (left = didn't know, right = knew it)
    const handleSwipeComplete = useCallback((direction: 'left' | 'right') => {
        if (!currentCard || cards.length === 0) return;

        const knewIt = direction === 'right';
        vibrate(knewIt ? [10, 50, 10] : 15);

        // Update SRS (silently, in background)
        const { message } = updateFlashcardSRS(currentCard.id, knewIt);

        // Update session stats
        setSessionStats(prev => ({
            reviewed: prev.reviewed + 1,
            knew: prev.knew + (knewIt ? 1 : 0),
            didntKnow: prev.didntKnow + (knewIt ? 0 : 1)
        }));

        // Show Rio feedback briefly
        setRioState(getRioState(knewIt ? 'flashcard_knew' : 'flashcard_didnt_know'));
        setRioMessage(getRioMessage(knewIt ? 'flashcard_knew' : 'flashcard_didnt_know'));
        setShowRioBubble(true);
        setTimeout(() => setShowRioBubble(false), 1500);

        // Move to next card
        setIsFlipped(false);
        setSwipeDirection(null);

        if (currentIndex < cards.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            // Session complete - show summary
            setRioState('cheering');
            setRioMessage(`Session done! ${sessionStats.knew + (knewIt ? 1 : 0)}/${sessionStats.reviewed + 1} mastered! 🎉`);
            setShowRioBubble(true);
        }
    }, [currentCard, currentIndex, cards.length, sessionStats]);

    // Touch handlers
    const handleTouchStart = (e: TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        isHorizontalSwipe.current = null;
        setIsSwiping(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (!isSwiping) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - touchStartX.current;
        const diffY = currentY - touchStartY.current;

        // Determine swipe direction
        if (isHorizontalSwipe.current === null && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
            isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY);
        }

        // Only track horizontal swipes
        if (isHorizontalSwipe.current) {
            setSwipeOffset(diffX);
            setSwipeDirection(diffX > 0 ? 'right' : 'left');
        }
    };

    const handleTouchEnd = () => {
        const minSwipeDistance = 100;

        if (Math.abs(swipeOffset) > minSwipeDistance) {
            handleSwipeComplete(swipeDirection!);
        }

        setSwipeOffset(0);
        setIsSwiping(false);
        isHorizontalSwipe.current = null;
    };

    const handleCardTap = () => {
        // Only flip if not swiping
        if (Math.abs(swipeOffset) < 10) {
            vibrate(10);
            setIsFlipped(!isFlipped);
        }
    };

    // Swipe indicator colors
    const getSwipeIndicatorStyles = () => {
        if (Math.abs(swipeOffset) < 30) return {};
        const intensity = Math.min(Math.abs(swipeOffset) / 150, 1);
        if (swipeDirection === 'right') {
            return {
                boxShadow: `0 0 ${30 * intensity}px rgba(34, 197, 94, ${0.5 * intensity})`,
                borderColor: `rgba(34, 197, 94, ${0.8 * intensity})`
            };
        } else {
            return {
                boxShadow: `0 0 ${30 * intensity}px rgba(239, 68, 68, ${0.5 * intensity})`,
                borderColor: `rgba(239, 68, 68, ${0.8 * intensity})`
            };
        }
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center z-50">
                <div className="text-center">
                    <div className="spinner rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-4"></div>
                    <p className="text-white/70">Loading flashcards...</p>
                </div>
            </div>
        );
    }

    // No cards state
    if (cards.length === 0) {
        return (
            <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center z-50 p-6">
                <RioMascot
                    state="suggesting"
                    size="large"
                    position="inline"
                    variant="presenter"
                    showBubble={true}
                    bubbleText="Take some quizzes first! I'll create flashcards from your weak areas 💪"
                />
                <button
                    onClick={onClose}
                    className="mt-8 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                >
                    ← Back to Dashboard
                </button>
            </div>
        );
    }

    // Session complete state
    if (currentIndex >= cards.length) {
        const accuracy = Math.round((sessionStats.knew / sessionStats.reviewed) * 100);
        return (
            <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center z-50 p-6">
                <RioMascot
                    state="cheering"
                    size="large"
                    position="inline"
                    variant="presenter"
                    showBubble={true}
                    bubbleText={accuracy >= 70 ? "Awesome session! 🎉" : "Great practice! 💪"}
                />

                <div className="bg-white/10 rounded-2xl p-6 mt-6 text-center max-w-sm w-full">
                    <h2 className="text-2xl font-bold text-white mb-4">Session Complete!</h2>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white/10 rounded-xl p-3">
                            <p className="text-2xl font-bold text-white">{sessionStats.reviewed}</p>
                            <p className="text-xs text-white/60">Reviewed</p>
                        </div>
                        <div className="bg-green-500/20 rounded-xl p-3">
                            <p className="text-2xl font-bold text-green-400">{sessionStats.knew}</p>
                            <p className="text-xs text-green-300">Knew It</p>
                        </div>
                        <div className="bg-red-500/20 rounded-xl p-3">
                            <p className="text-2xl font-bold text-red-400">{sessionStats.didntKnow}</p>
                            <p className="text-xs text-red-300">To Review</p>
                        </div>
                    </div>

                    <p className="text-white/70 text-sm mb-6">
                        {sessionStats.didntKnow > 0
                            ? `${sessionStats.didntKnow} cards added to tomorrow's review`
                            : "All cards mastered! See you next time 🌟"}
                    </p>

                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-white text-gray-800 font-bold rounded-xl hover:bg-gray-100 transition-all"
                    >
                        Done →
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex flex-col z-50">
            {/* Header */}
            <div className="flex items-center justify-between p-4 text-white">
                <button
                    onClick={onClose}
                    className="btn-press p-2 text-white/70 hover:text-white"
                >
                    ← Back
                </button>
                <div className="text-center">
                    <p className="text-white/60 text-xs">
                        {currentCard.sourceType === 'static' ? 'High-Yield Signs' : currentCard.topic}
                    </p>
                    <p className="font-bold">{currentIndex + 1} / {cards.length}</p>
                </div>
                <div className="w-16" />
            </div>

            {/* Rio Companion */}
            <div className="absolute top-16 right-4 z-50">
                <RioMascot
                    state={rioState}
                    size="small"
                    position="inline"
                    showBubble={showRioBubble}
                    bubbleText={rioMessage}
                    bubblePosition="left"
                />
            </div>

            {/* Card Container */}
            <div className="flex-1 flex items-center justify-center p-4 relative">
                {/* Left hint (didn't know) */}
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-all ${swipeDirection === 'left' && Math.abs(swipeOffset) > 50
                    ? 'opacity-100 scale-110' : 'opacity-30'
                    }`}>
                    <div className="bg-red-500/20 rounded-full p-3">
                        <span className="text-2xl">❌</span>
                    </div>
                    <p className="text-red-400 text-xs mt-1 text-center">Review</p>
                </div>

                {/* Right hint (knew it) */}
                <div className={`absolute right-4 top-1/2 -translate-y-1/2 transition-all ${swipeDirection === 'right' && Math.abs(swipeOffset) > 50
                    ? 'opacity-100 scale-110' : 'opacity-30'
                    }`}>
                    <div className="bg-green-500/20 rounded-full p-3">
                        <span className="text-2xl">✅</span>
                    </div>
                    <p className="text-green-400 text-xs mt-1 text-center">Got It</p>
                </div>

                {/* Card */}
                <div
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className="w-full max-w-sm"
                >
                    <div
                        onClick={handleCardTap}
                        className="aspect-[3/4] relative cursor-pointer"
                        style={{
                            transform: `translateX(${swipeOffset * 0.5}px) rotate(${swipeOffset * 0.03}deg)`,
                            transition: isSwiping ? 'none' : 'transform 0.3s ease-out'
                        }}
                    >
                        {/* Card Inner - handles flip */}
                        <div
                            className="w-full h-full relative rounded-3xl border-2 border-transparent"
                            style={{
                                transformStyle: 'preserve-3d',
                                transition: 'transform 0.5s ease-out',
                                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                                ...getSwipeIndicatorStyles()
                            }}
                        >
                            {/* Front of card */}
                            <div
                                className={`absolute inset-0 rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center bg-gradient-to-br ${currentCard.color} text-white shadow-2xl`}
                                style={{ backfaceVisibility: 'hidden' }}
                            >
                                <span className="text-5xl md:text-7xl mb-6 md:mb-8">{currentCard.emoji}</span>
                                <p className="text-xl md:text-2xl font-bold text-center leading-relaxed px-2 md:px-4">
                                    {currentCard.front}
                                </p>
                                {currentCard.sourceType !== 'static' && (
                                    <div className="absolute top-4 left-4 bg-white/20 px-2 py-1 rounded-full">
                                        <p className="text-[10px] text-white/80">From your weak spots</p>
                                    </div>
                                )}
                                <div className="absolute bottom-6 md:bottom-8 flex flex-col items-center gap-2">
                                    <p className="text-white/70 text-sm">👆 Tap to reveal</p>
                                </div>
                            </div>

                            {/* Back of card */}
                            <div
                                className="absolute inset-0 rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center bg-white shadow-2xl"
                                style={{
                                    backfaceVisibility: 'hidden',
                                    transform: 'rotateY(180deg)'
                                }}
                            >
                                <span className="text-4xl md:text-5xl mb-3">{currentCard.emoji}</span>
                                <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Answer</p>
                                <p className="text-lg md:text-xl font-bold text-gray-800 text-center leading-relaxed px-4 md:px-6 max-h-[60%] overflow-y-auto">
                                    {currentCard.back}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Controls - extra padding for mobile navbar */}
            <div className="p-4 pb-32 md:pb-6">
                {/* Desktop buttons */}
                <div className="hidden md:flex justify-center gap-4 mb-4">
                    <button
                        onClick={() => handleSwipeComplete('left')}
                        className="btn-press px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-medium transition-all flex items-center gap-2"
                    >
                        ❌ Didn't Know (←)
                    </button>
                    <button
                        onClick={() => handleSwipeComplete('right')}
                        className="btn-press px-6 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-xl font-medium transition-all flex items-center gap-2"
                    >
                        ✅ Knew It (→)
                    </button>
                </div>

                {/* Mobile swipe hint */}
                <div className="md:hidden text-center mb-4">
                    <div className="bg-white/10 rounded-xl p-3 inline-flex items-center gap-4">
                        <span className="text-red-400 text-sm">← Review</span>
                        <span className="text-white/40">|</span>
                        <span className="text-white font-medium">Swipe</span>
                        <span className="text-white/40">|</span>
                        <span className="text-green-400 text-sm">Got It →</span>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="max-w-sm mx-auto">
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-300"
                            style={{ width: `${((currentIndex) / cards.length) * 100}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-white/50 mt-2">
                        <span>{sessionStats.knew} mastered</span>
                        <span>{sessionStats.didntKnow} to review</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Flashcards;
