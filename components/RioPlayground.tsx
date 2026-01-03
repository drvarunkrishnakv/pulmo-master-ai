import React, { useState, useEffect } from 'react';
import RioMascot, { MascotState } from './RioMascot';

const RioPlayground: React.FC = () => {
    const [activeEffect, setActiveEffect] = useState<string | null>(null);
    const [rioState, setRioState] = useState<MascotState>('idle');
    const [progress, setProgress] = useState(0);
    const [isWalking, setIsWalking] = useState(false);

    // Animation Loop for Walking
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isWalking) {
            interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 100) {
                        setIsWalking(false);
                        setRioState('celebrating');
                        return 100;
                    }
                    return prev + 1;
                });
            }, 50); // Speed of walk
        }
        return () => clearInterval(interval);
    }, [isWalking]);

    const reset = () => {
        setActiveEffect(null);
        setRioState('idle');
        setProgress(0);
        setIsWalking(false);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8 flex flex-col gap-8">
            <header className="text-center">
                <h1 className="text-3xl font-bold text-gray-800">🧪 Rio Lab</h1>
                <p className="text-gray-500">Audition new behaviors and effects</p>
            </header>

            {/* STAGE AREA */}
            <div className="flex-1 bg-white rounded-2xl border-2 border-dashed border-gray-300 relative overflow-hidden min-h-[400px] flex items-center justify-center">

                {/* Background Grid Pattern for "Lab" feel */}
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#4b5563 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                {/* 1. THE NAVIGATOR DEMO */}
                {activeEffect === 'navigator' && (
                    <div className="absolute top-1/2 left-8 right-8 h-4 bg-gray-200 rounded-full transform -translate-y-1/2">
                        <div
                            className="h-full bg-blue-100 rounded-full transition-all duration-75"
                            style={{ width: `${progress}%` }}
                        />
                        {/* Rio gliding on the bar */}
                        <div
                            className="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2 transition-all duration-75"
                            style={{ left: `${progress}%` }}
                        >
                            <div className="animate-bounce-soft"> {/* Bounce to simulate walking */}
                                <RioMascot
                                    state="presenting" // Looks like he's looking forward/presenting
                                    size="small"
                                    position="inline"
                                    variant="inline"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. CENTER STAGE RIO (For standard effects) */}
                {activeEffect !== 'navigator' && (
                    <div className="relative">
                        {/* EFFECT: FIRE MODE */}
                        {activeEffect === 'fire' && (
                            <div className="absolute inset-0 bg-orange-400 rounded-full blur-xl opacity-50 animate-pulse scale-150 z-0"></div>
                        )}

                        <div className={`
              relative z-10 transition-all duration-500
              ${activeEffect === 'hesitation' ? 'animate-shake' : ''} 
              ${activeEffect === 'wakeup' ? 'animate-pop' : ''}
            `}>
                            <RioMascot
                                state={rioState}
                                size="xlarge"
                                position="inline"
                                variant="inline"
                                showBubble={activeEffect === 'hesitation'}
                                bubbleText={activeEffect === 'hesitation' ? "Time is running out!" : undefined}
                            />

                            {/* EFFECT: SWEAT DROPS */}
                            {activeEffect === 'hesitation' && (
                                <>
                                    <span className="absolute -top-2 -right-4 text-2xl animate-drop">💧</span>
                                    <span className="absolute top-4 -right-6 text-xl animate-drop delay-300">💧</span>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* CONTROLS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                {/* Standard Moods */}
                <div className="bg-white p-4 rounded-xl border space-y-2">
                    <h3 className="font-bold text-gray-700 text-sm uppercase">Standard Moods</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => { reset(); setRioState('greeting'); }} className="btn-secondary text-xs">👋 Greeting</button>
                        <button onClick={() => { reset(); setRioState('celebrating'); }} className="btn-secondary text-xs">🎉 Celebrating</button>
                        <button onClick={() => { reset(); setRioState('encouraging'); }} className="btn-secondary text-xs">💪 Encouraging</button>
                        <button onClick={() => { reset(); setRioState('thinking'); }} className="btn-secondary text-xs">🤔 Thinking</button>
                        <button onClick={() => { reset(); setRioState('sad'); }} className="btn-secondary text-xs">😢 Sad</button>
                        <button onClick={() => { reset(); setRioState('cheering'); }} className="btn-secondary text-xs">🏆 Cheering</button>
                    </div>
                </div>

                {/* Composite: Hesitation */}
                <div className="bg-white p-4 rounded-xl border space-y-2">
                    <h3 className="font-bold text-amber-600 text-sm uppercase">😰 Hesitation</h3>
                    <p className="text-xs text-gray-500">Thinking + Shake + Sweat</p>
                    <button
                        onClick={() => { reset(); setActiveEffect('hesitation'); setRioState('thinking'); }}
                        className="w-full py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 font-medium"
                    >
                        Trigger Anxiety
                    </button>
                </div>

                {/* Composite: Fire Mode */}
                <div className="bg-white p-4 rounded-xl border space-y-2">
                    <h3 className="font-bold text-orange-600 text-sm uppercase">🔥 On Fire</h3>
                    <p className="text-xs text-gray-500">Thinking/Encouraging + Glow</p>
                    <button
                        onClick={() => { reset(); setActiveEffect('fire'); setRioState('encouraging'); }}
                        className="w-full py-2 bg-orange-100 text-orange-800 rounded-lg hover:bg-orange-200 font-medium"
                    >
                        Ignite Streak
                    </button>
                </div>

                {/* Composite: Navigator */}
                <div className="bg-white p-4 rounded-xl border space-y-2">
                    <h3 className="font-bold text-blue-600 text-sm uppercase">🏃‍♂️ Navigator</h3>
                    <p className="text-xs text-gray-500">Progress Bar + Glide</p>
                    <button
                        onClick={() => { reset(); setActiveEffect('navigator'); setIsWalking(true); }}
                        className="w-full py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 font-medium"
                    >
                        Start Walking
                    </button>
                </div>

            </div>
        </div>
    );
};

export default RioPlayground;
