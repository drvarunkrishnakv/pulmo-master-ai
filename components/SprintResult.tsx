import React from 'react';
import { SavedMCQ } from '../types';
import { getSprintBest } from '../services/sprintService';

/**
 * Sprint Result Modal Component
 * Shows sprint completion stats, personal bests, and review options
 */

// Haptic feedback utility
const vibrate = (pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

interface SprintResultProps {
    history: Array<{ correct: boolean }>;
    bestStreakThisSprint: number;
    newRecords: { score: boolean; streak: boolean; speed: boolean };
    wrongAnswers: Array<{ mcq: SavedMCQ; userAnswer: 'A' | 'B' | 'C' | 'D' }>;
    onTryAgain: () => void;
    onReviewMistakes: () => void;
    onGoHome: () => void;
}

const SprintResult: React.FC<SprintResultProps> = ({
    history,
    bestStreakThisSprint,
    newRecords,
    wrongAnswers,
    onTryAgain,
    onReviewMistakes,
    onGoHome
}) => {
    const correctCount = history.filter(h => h.correct).length;
    const sprintBest = getSprintBest();

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-2xl p-6 md:p-8 max-w-sm w-full text-center shadow-2xl animate-pop max-h-[90vh] overflow-y-auto">
                <div className="text-6xl mb-2">🏁</div>
                <h2 className="text-2xl font-black text-gray-800 mb-1">Sprint Complete!</h2>

                {/* New records badges */}
                {(newRecords.score || newRecords.streak || newRecords.speed) && (
                    <div className="flex justify-center gap-2 mb-4">
                        {newRecords.score && (
                            <span className="bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full text-xs font-bold animate-bounce">
                                🏆 New Best Score!
                            </span>
                        )}
                        {newRecords.streak && (
                            <span className="bg-orange-400 text-orange-900 px-2 py-1 rounded-full text-xs font-bold animate-bounce">
                                🔥 New Best Streak!
                            </span>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-3 gap-3 my-5">
                    <div className="bg-green-50 rounded-xl p-3">
                        <p className="text-2xl font-black text-green-600">
                            {correctCount}/{history.length}
                        </p>
                        <p className="text-[10px] text-green-700 font-medium">Correct</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-3">
                        <p className="text-2xl font-black text-orange-600">
                            🔥 {bestStreakThisSprint}
                        </p>
                        <p className="text-[10px] text-orange-700 font-medium">Best Streak</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3">
                        <p className="text-2xl font-black text-blue-600">
                            {history.length}
                        </p>
                        <p className="text-[10px] text-blue-700 font-medium">Q/min</p>
                    </div>
                </div>

                {/* Personal Best Comparison */}
                <div className="bg-gray-50 rounded-xl p-3 mb-5 text-left">
                    <p className="text-xs font-bold text-gray-500 mb-2">📊 Personal Bests</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                            <p className="text-sm font-bold text-gray-700">{sprintBest.bestScore}</p>
                            <p className="text-[9px] text-gray-400">Score</p>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-700">{sprintBest.bestStreak}</p>
                            <p className="text-[9px] text-gray-400">Streak</p>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-700">{sprintBest.bestSpeed}</p>
                            <p className="text-[9px] text-gray-400">Q/min</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    {/* Review Mistakes Button - only show if there are wrong answers */}
                    {wrongAnswers.length > 0 && (
                        <button
                            onClick={() => {
                                vibrate(15);
                                onReviewMistakes();
                            }}
                            className="btn-press w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all"
                        >
                            📖 Review Mistakes ({wrongAnswers.length})
                        </button>
                    )}
                    <button
                        onClick={() => {
                            vibrate(15);
                            onTryAgain();
                        }}
                        className="btn-press w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all"
                    >
                        🔄 Try Again
                    </button>
                    <button
                        onClick={() => {
                            vibrate(10);
                            onGoHome();
                        }}
                        className="btn-press w-full py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all"
                    >
                        🏠 Back to Home
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SprintResult;
