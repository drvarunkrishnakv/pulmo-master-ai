import React, { useState } from 'react';
import { SavedMCQ } from '../types';
import { generateTopicExplanation } from '../services/geminiService';
import RioMascot from './RioMascot';

/**
 * Quiz Explanation Component
 * Shows Deep Dive, High-Yield Pearl, Teach Me, and Confidence Rating after answer submission
 */

// Haptic feedback utility
const vibrate = (pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

interface QuizExplanationProps {
    question: SavedMCQ;
    selectedOption: 'A' | 'B' | 'C' | 'D';
    isCorrect: boolean;
    srsMessage?: string;
    onConfidenceSelect?: (confidence: 'guessed' | 'somewhat' | 'certain') => void;
    onSimilarQuestion?: (mcq: SavedMCQ) => Promise<void>;
    onNext: () => void;
    isGeneratingSimilar?: boolean;
}

const QuizExplanation: React.FC<QuizExplanationProps> = ({
    question,
    selectedOption,
    isCorrect,
    srsMessage,
    onConfidenceSelect,
    onSimilarQuestion,
    onNext,
    isGeneratingSimilar = false
}) => {
    const [confidenceSelected, setConfidenceSelected] = useState<'guessed' | 'somewhat' | 'certain' | null>(null);
    const [showTeachMe, setShowTeachMe] = useState(false);
    const [isLoadingTeachMe, setIsLoadingTeachMe] = useState(false);
    const [teachMeExplanation, setTeachMeExplanation] = useState<string | null>(null);

    // Handle Teach Me This Topic
    const handleTeachMe = async () => {
        vibrate(10);
        setShowTeachMe(true);
        setIsLoadingTeachMe(true);

        try {
            const correctAnswerText = question.options[question.correctAnswer];
            const explanation = await generateTopicExplanation(
                question.question,
                question.correctAnswer,
                correctAnswerText,
                question.topic
            );
            setTeachMeExplanation(explanation);
        } catch (error) {
            console.error('Error getting explanation:', error);
            setTeachMeExplanation('Unable to generate explanation. Please refer to the deep dive section.');
        } finally {
            setIsLoadingTeachMe(false);
        }
    };

    const handleNextClick = () => {
        vibrate(10);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        onNext();
    };

    const handleConfidenceClick = (confidence: 'guessed' | 'somewhat' | 'certain') => {
        vibrate(10);
        setConfidenceSelected(confidence);
        onConfidenceSelect?.(confidence);
    };

    return (
        <div className="p-3 md:p-6 lg:p-8 bg-gray-50 border-t space-y-3 md:space-y-4 animate-fade-in">
            {/* Result + SRS Message */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 md:gap-3">
                    <span className={`text-base md:text-lg font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                        {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                    </span>
                    <span className="text-gray-500 text-xs md:text-sm">
                        Answer: {question.correctAnswer}
                    </span>
                </div>
                {/* SRS Message - subtle, to the right */}
                {srsMessage && (
                    <span className="text-xs md:text-sm text-gray-400 italic">
                        {srsMessage}
                    </span>
                )}
            </div>

            {/* Deep Dive */}
            <div className="bg-white p-3 md:p-4 rounded-lg md:rounded-xl border border-blue-100 shadow-soft">
                <h4 className="text-blue-800 font-bold text-[10px] md:text-xs mb-1 md:mb-2 uppercase tracking-wide">
                    Deep Dive
                </h4>
                <p className="text-gray-700 text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
                    {question.deepDiveExplanation}
                </p>
            </div>

            {/* High-Yield Pearl */}
            <div className="bg-amber-50 p-3 md:p-4 rounded-lg md:rounded-xl border border-amber-200 shadow-soft">
                <h4 className="text-amber-800 font-bold text-[10px] md:text-xs mb-1 uppercase tracking-wide">
                    High-Yield Pearl 💎
                </h4>
                <p className="text-amber-900 text-xs md:text-sm italic font-medium">
                    {question.highYieldPearl}
                </p>
            </div>

            {/* Source Reference */}
            {question.sourceSection && (
                <div className="text-xs text-gray-400 flex items-center gap-1">
                    <span>📖</span>
                    <span>Source: {question.sourceSection}</span>
                </div>
            )}

            {/* Teach Me This Topic - Only show when wrong */}
            {!isCorrect && (
                <div className="space-y-3">
                    {/* Mistake Coach - Rio with encouragement */}
                    <div className="flex items-start gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-xl border border-blue-100">
                        <RioMascot
                            state="encouraging"
                            size="small"
                            position="inline"
                            variant="inline"
                        />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-blue-800">
                                Don't worry! Here's what to remember:
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                                Review the explanation below and try a similar question!
                            </p>
                        </div>
                    </div>

                    {/* Teach Me Button/Content */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-3 md:p-4 rounded-lg md:rounded-xl border border-indigo-200 shadow-soft">
                        {!showTeachMe ? (
                            <button
                                onClick={handleTeachMe}
                                className="btn-press w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all text-sm flex items-center justify-center gap-2 shadow-md"
                            >
                                <span>🎓</span>
                                Teach Me This Topic
                            </button>
                        ) : isLoadingTeachMe ? (
                            <div className="flex items-center justify-center gap-3 py-3">
                                <div className="spinner rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent"></div>
                                <span className="text-indigo-600 font-medium text-sm">Generating explanation...</span>
                            </div>
                        ) : (
                            <div>
                                <h4 className="text-indigo-800 font-bold text-xs mb-2 uppercase tracking-wide flex items-center gap-2">
                                    <span>🎓</span>
                                    Why You Were Wrong
                                </h4>
                                <p className="text-gray-700 text-sm leading-relaxed">
                                    {teachMeExplanation}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Confidence Rating - Show only when CORRECT and not yet selected */}
            {onConfidenceSelect && !confidenceSelected && isCorrect && (
                <div className="bg-gradient-to-r from-violet-50 to-purple-50 p-4 rounded-xl border border-violet-200 shadow-soft">
                    <p className="text-center text-sm font-semibold text-violet-800 mb-3">
                        How confident were you?
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => handleConfidenceClick('guessed')}
                            className="btn-press py-3 bg-amber-100 text-amber-700 rounded-xl font-bold text-xs hover:bg-amber-200 transition-all flex flex-col items-center gap-1"
                        >
                            <span className="text-lg">🎲</span>
                            <span>Guessed</span>
                        </button>
                        <button
                            onClick={() => handleConfidenceClick('somewhat')}
                            className="btn-press py-3 bg-blue-100 text-blue-700 rounded-xl font-bold text-xs hover:bg-blue-200 transition-all flex flex-col items-center gap-1"
                        >
                            <span className="text-lg">🤔</span>
                            <span>Somewhat</span>
                        </button>
                        <button
                            onClick={() => handleConfidenceClick('certain')}
                            className="btn-press py-3 bg-green-100 text-green-700 rounded-xl font-bold text-xs hover:bg-green-200 transition-all flex flex-col items-center gap-1"
                        >
                            <span className="text-lg">💯</span>
                            <span>Certain</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Show selected confidence */}
            {confidenceSelected && (
                <div className="text-center text-xs text-gray-400">
                    Confidence: {confidenceSelected === 'guessed' ? '🎲 Guessed' : confidenceSelected === 'somewhat' ? '🤔 Somewhat Sure' : '💯 Certain'}
                </div>
            )}

            {/* Action Buttons - Show after confidence selected for correct, immediately for wrong */}
            {(!onConfidenceSelect || confidenceSelected || !isCorrect) && (
                <div className="flex gap-2">
                    {onSimilarQuestion && (
                        <button
                            onClick={() => onSimilarQuestion(question)}
                            disabled={isGeneratingSimilar}
                            className="btn-press flex-1 py-3 bg-purple-100 text-purple-700 font-bold rounded-xl hover:bg-purple-200 transition-all text-xs md:text-sm disabled:opacity-50 shadow-soft"
                        >
                            {isGeneratingSimilar ? '⏳ Generating...' : '🔄 Practice Similar'}
                        </button>
                    )}
                    <button
                        onClick={handleNextClick}
                        className={`btn-press ${onSimilarQuestion ? 'flex-1' : 'w-full'} py-3 md:py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all text-sm md:text-base shadow-medium`}
                    >
                        Next →
                        <span className="hidden md:inline text-gray-500 text-xs ml-2">[Space]</span>
                    </button>
                </div>
            )}

            {/* Swipe hint on mobile */}
            {(!onConfidenceSelect || confidenceSelected || !isCorrect) && (
                <p className="md:hidden text-center text-[10px] text-gray-400">
                    ← Swipe left for next question
                </p>
            )}
        </div>
    );
};

export default QuizExplanation;
