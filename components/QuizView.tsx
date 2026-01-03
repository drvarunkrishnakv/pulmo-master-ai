import React, { useEffect, useState, useRef, TouchEvent, useMemo } from 'react';
import { MCQ, QuizState, SavedMCQ } from '../types';
import { generateTopicExplanation } from '../services/geminiService';
import { getSprintBest, updateSprintBest } from '../services/sprintService';
import { getHintsRemaining, useHint } from '../services/gamificationService';
import RioMascot from './RioMascot';
import { useMascot } from '../contexts/MascotContext';
import { useTheme } from '../contexts/ThemeContext';

// Utility: Fisher-Yates shuffle (robust, cryptographically fair)
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Type for shuffled option with original key preserved
interface ShuffledOption {
  displayKey: 'A' | 'B' | 'C' | 'D';  // What user sees (A, B, C, D)
  originalKey: 'A' | 'B' | 'C' | 'D'; // Original key from data
  value: string;                       // Option text
}

// Format explanation text: detect numbered lists, bullet points, and format nicely
const formatExplanationText = (text: string): React.ReactNode => {
  if (!text) return [];

  // Split by common patterns: numbered items (1), 2), 1., 2.) or bullet points
  // Also split on sentences that start with capital letters after periods for major criteria lists
  const patterns = [
    /(?:^|\s)(\d+)\)\s*/g,  // 1) 2) 3)
    /(?:^|\s)(\d+)\.\s*/g,  // 1. 2. 3.
    /•\s*/g,                 // bullet points
    /[-–]\s+(?=[A-Z])/g,     // dash followed by capital letter
  ];

  // Try to detect if text has numbered items like "1) ... 2) ... 3)"
  const numberedPattern = /(\d+)\)\s*([^0-9]+?)(?=\d+\)|$)/g;
  const matches = [...text.matchAll(numberedPattern)];

  if (matches.length >= 2) {
    // Has numbered list format
    const elements: React.ReactElement[] = [];
    let lastIndex = 0;

    // Get intro text before first number
    const firstMatchIndex = text.indexOf(matches[0][0]);
    if (firstMatchIndex > 0) {
      const introText = text.substring(0, firstMatchIndex).trim();
      if (introText) {
        elements.push(
          <p key="intro" className="mb-2">{introText}</p>
        );
      }
    }

    // Create list items
    elements.push(
      <ol key="list" className="list-decimal list-inside space-y-1.5 ml-1">
        {matches.map((match, idx) => (
          <li key={idx} className="text-gray-700">
            <span className="ml-1">{match[2].trim()}</span>
          </li>
        ))}
      </ol>
    );

    // Get trailing text after last match
    const lastMatch = matches[matches.length - 1];
    const lastMatchEnd = text.lastIndexOf(lastMatch[0]) + lastMatch[0].length;
    const trailingText = text.substring(lastMatchEnd).trim();
    if (trailingText && trailingText.length > 10) {
      elements.push(
        <p key="trailing" className="mt-2">{trailingText}</p>
      );
    }

    return elements;
  }

  // Try pattern with colons followed by numbered items (common in criteria)
  const colonNumberPattern = /:\s*(\d+)\)/;
  if (colonNumberPattern.test(text)) {
    const parts = text.split(/(?=\d+\)\s)/);
    if (parts.length >= 2) {
      const elements: React.ReactElement[] = [];

      // First part is intro
      if (parts[0].trim()) {
        elements.push(<p key="intro" className="mb-2">{parts[0].trim()}</p>);
      }

      // Rest are list items
      const listItems = parts.slice(1).filter(p => p.trim());
      if (listItems.length > 0) {
        elements.push(
          <ol key="list" className="list-decimal list-inside space-y-1.5 ml-1">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-gray-700">
                <span className="ml-1">{item.replace(/^\d+\)\s*/, '').trim()}</span>
              </li>
            ))}
          </ol>
        );
      }

      return elements;
    }
  }

  // Fallback: just return as paragraph with line breaks preserved
  return [<span key="text">{text}</span>];
};

interface QuizViewProps {
  state: QuizState;
  onOptionSelect: (opt: 'A' | 'B' | 'C' | 'D') => void;
  onSubmit: () => void;
  onNext: () => void;
  onConfidenceSelect?: (confidence: 'guessed' | 'somewhat' | 'certain') => void;
  onSimilarQuestion?: (mcq: SavedMCQ) => Promise<void>;
  onHesitationTracked?: (responseTimeMs: number) => void; // Ghost intelligence: track response time
}

// Haptic feedback utility
const vibrate = (pattern: number | number[] = 10) => {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
};

const QuizView: React.FC<QuizViewProps> = ({ state, onOptionSelect, onSubmit, onNext, onConfidenceSelect, onSimilarQuestion, onHesitationTracked }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { currentQuestion, selectedOption, isSubmitted, isLoading, isSprintMode, sprintStartTime } = state;
  const [isGeneratingSimilar, setIsGeneratingSimilar] = useState(false);
  const [answerAnimation, setAnswerAnimation] = useState<'correct' | 'wrong' | null>(null);

  // Smart Hint State
  const { triggerMascot } = useMascot();
  const [disabledOptions, setDisabledOptions] = useState<string[]>([]);
  const stuckTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showHintOffer, setShowHintOffer] = useState(false); // Rio's nudge to use a hint
  const [hintCount, setHintCount] = useState(getHintsRemaining());
  const [hintUsedThisQuestion, setHintUsedThisQuestion] = useState(false);

  // Sprint timer state
  // Use passed duration or default to 5 minutes
  const sprintDurationMin = state.sprintDurationMinutes || 5;
  const [timeRemaining, setTimeRemaining] = useState<number>(sprintDurationMin * 60);
  const [isSprintEnded, setIsSprintEnded] = useState(false);
  const [showSprintResult, setShowSprintResult] = useState(false);

  // Sprint streak and review state
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreakThisSprint, setBestStreakThisSprint] = useState(0);
  const [showReviewMode, setShowReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState<Array<{ mcq: SavedMCQ; userAnswer: 'A' | 'B' | 'C' | 'D' }>>([]);
  const [sprintNewRecords, setSprintNewRecords] = useState<{ score: boolean; streak: boolean; speed: boolean }>({ score: false, streak: false, speed: false });

  // Confidence rating state
  const [confidenceSelected, setConfidenceSelected] = useState<'guessed' | 'somewhat' | 'certain' | null>(null);

  // Teach Me This Topic state
  const [showTeachMe, setShowTeachMe] = useState(false);
  const [isLoadingTeachMe, setIsLoadingTeachMe] = useState(false);
  const [teachMeExplanation, setTeachMeExplanation] = useState<string | null>(null);

  // Ghost Intelligence: Hesitation tracking (invisible to user)
  const questionShownAtRef = useRef<number>(Date.now());

  // Shuffle options to prevent position memorization during spaced repetition
  // Creates a stable shuffle per question ID
  const shuffledOptions = useMemo((): ShuffledOption[] => {
    if (!currentQuestion?.options) return [];

    const optionKeys: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    const displayKeys: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

    // Create array of options with original keys
    const optionsArray = optionKeys
      .filter(key => currentQuestion.options[key]) // Only include existing options
      .map(key => ({
        originalKey: key,
        value: currentQuestion.options[key]
      }));

    // Shuffle the array
    const shuffled = shuffleArray(optionsArray);

    // Assign new display keys
    return shuffled.map((opt, idx) => ({
      displayKey: displayKeys[idx],
      originalKey: opt.originalKey,
      value: opt.value
    }));
  }, [currentQuestion?.id, currentQuestion?.options]);

  // Helper: Get the original key from display key (for answer submission)
  const getOriginalKey = (displayKey: 'A' | 'B' | 'C' | 'D'): 'A' | 'B' | 'C' | 'D' => {
    const option = shuffledOptions.find(opt => opt.displayKey === displayKey);
    return option?.originalKey || displayKey;
  };

  // Helper: Get display key from original key (for showing correct answer)
  const getDisplayKey = (originalKey: 'A' | 'B' | 'C' | 'D'): 'A' | 'B' | 'C' | 'D' => {
    const option = shuffledOptions.find(opt => opt.originalKey === originalKey);
    return option?.displayKey || originalKey;
  };

  // Reset confidence and hesitation timer when question changes
  useEffect(() => {
    setConfidenceSelected(null);
    questionShownAtRef.current = Date.now(); // Ghost tracking: reset timer
  }, [currentQuestion?.id]);

  // Sprint timer countdown
  useEffect(() => {
    if (!isSprintMode || !sprintStartTime || isSprintEnded) return;

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - sprintStartTime) / 1000);
      const durationSeconds = sprintDurationMin * 60;
      const remaining = Math.max(0, durationSeconds - elapsed);
      setTimeRemaining(remaining);

      if (remaining === 0) {
        setIsSprintEnded(true);
        setShowSprintResult(true);
        vibrate([100, 50, 100, 50, 100]);

        // Calculate and save personal best
        const correctCount = state.history.filter(h => h.correct).length;
        const speed = state.history.length > 0 ? (state.history.length / sprintDurationMin) * 5 : 0; // Normalize speed to 5 min equivalent for comparison
        const records = updateSprintBest(correctCount, bestStreakThisSprint, speed);
        // Fix for lint error: manually construct the state object if types mismatch, but updateSprintBest should return correct shape.
        // If updateSprintBest returns { isNewBestScore... }, map it:
        setSprintNewRecords({
          score: records.isNewBestScore,
          streak: records.isNewBestStreak,
          speed: records.isNewBestSpeed
        });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isSprintMode, sprintStartTime, isSprintEnded, state.history, bestStreakThisSprint, sprintDurationMin]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get timer urgency level
  const getTimerUrgency = (): 'normal' | 'warning' | 'critical' => {
    // For short sprints (<= 2 mins), use tighter thresholds to avoid immediate urgency
    const isShortSprint = sprintDurationMin <= 2;
    const criticalThreshold = isShortSprint ? 15 : 30;
    const warningThreshold = isShortSprint ? 30 : 60;

    if (timeRemaining <= criticalThreshold) return 'critical';
    if (timeRemaining <= warningThreshold) return 'warning';
    return 'normal';
  };

  // Swipe handling
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  // Submit button ref for auto-scroll
  const submitRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX; // Reset end to start to avoid false swipes
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const swipeDistance = touchEndX.current - touchStartX.current;
    const minSwipeDistance = 100;

    if (isSubmitted && swipeDistance < -minSwipeDistance) {
      // Swipe left = next question
      vibrate(15);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      onNext();
    }
  };

  const handleSimilarQuestion = async () => {
    if (!onSimilarQuestion || !currentQuestion) return;
    vibrate(10);
    setIsGeneratingSimilar(true);
    try {
      await onSimilarQuestion(currentQuestion as SavedMCQ);
    } finally {
      setIsGeneratingSimilar(false);
    }
  };

  const handleOptionClick = (key: 'A' | 'B' | 'C' | 'D') => {
    vibrate(5);
    onOptionSelect(key);

    // Auto-scroll to submit button after selecting an option
    setTimeout(() => {
      submitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Handle Teach Me This Topic
  const handleTeachMe = async () => {
    if (!currentQuestion) return;
    vibrate(10);
    setShowTeachMe(true);
    setIsLoadingTeachMe(true);

    try {
      const correctAnswerText = currentQuestion.options[currentQuestion.correctAnswer];
      const explanation = await generateTopicExplanation(
        currentQuestion.question,
        currentQuestion.correctAnswer,
        correctAnswerText,
        currentQuestion.topic
      );
      setTeachMeExplanation(explanation);
    } catch (error) {
      console.error('Error getting explanation:', error);
      setTeachMeExplanation('Unable to generate explanation. Please refer to the deep dive section.');
    } finally {
      setIsLoadingTeachMe(false);
    }
  };

  // Reset teach me state when question changes
  useEffect(() => {
    setShowTeachMe(false);
    setTeachMeExplanation(null);
  }, [currentQuestion?.id]);

  const handleSubmitClick = () => {
    if (!selectedOption || !currentQuestion) return;
    vibrate(10);

    // Ghost Intelligence: Calculate response time (invisible to user)
    const responseTimeMs = Date.now() - questionShownAtRef.current;
    if (onHesitationTracked) {
      onHesitationTracked(responseTimeMs);
    }

    // Check if answer is correct before submitting
    const isCorrect = selectedOption === currentQuestion.correctAnswer;

    if (isSprintMode) {
      // Sprint mode: haptic feedback based on correct/wrong
      if (isCorrect) {
        vibrate([50, 30, 50]); // Double tap for correct
        setCurrentStreak(prev => {
          const newStreak = prev + 1;
          if (newStreak > bestStreakThisSprint) {
            setBestStreakThisSprint(newStreak);
          }
          return newStreak;
        });
      } else {
        vibrate([100, 50, 100]); // Long vibrate for wrong
        setCurrentStreak(0);
        // Store wrong answer for review
        setWrongAnswers(prev => [...prev, { mcq: currentQuestion as SavedMCQ, userAnswer: selectedOption }]);
      }

      // Set animation state
      setAnswerAnimation(isCorrect ? 'correct' : 'wrong');

      // Submit the answer
      onSubmit();

      // Auto-advance after brief delay (500ms)
      setTimeout(() => {
        setAnswerAnimation(null);
        if (!isSprintEnded) {
          window.scrollTo({ top: 0, behavior: 'instant' });
          onNext();
        }
      }, 500);
    } else {
      // Normal quiz mode
      onSubmit();
    }
  };

  // Show answer animation
  useEffect(() => {
    if (isSubmitted && currentQuestion) {
      const isCorrect = selectedOption === currentQuestion.correctAnswer;
      setAnswerAnimation(isCorrect ? 'correct' : 'wrong');
      vibrate(isCorrect ? [10, 50, 10] : [30, 50, 30, 50, 30]);

      // Clear animation after it plays
      const timer = setTimeout(() => setAnswerAnimation(null), 500);
      return () => clearTimeout(timer);
    }
  }, [isSubmitted, currentQuestion, selectedOption]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading || !currentQuestion) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!isSubmitted) {
        // Keyboard 1-4 maps to display positions, get the original key from shuffle
        const getOriginalKeyFromPosition = (position: number): 'A' | 'B' | 'C' | 'D' | null => {
          const option = shuffledOptions[position];
          return option?.originalKey || null;
        };

        if (e.key === '1' || e.key.toUpperCase() === 'A') {
          const originalKey = getOriginalKeyFromPosition(0);
          if (originalKey) handleOptionClick(originalKey);
        }
        else if (e.key === '2' || e.key.toUpperCase() === 'B') {
          const originalKey = getOriginalKeyFromPosition(1);
          if (originalKey) handleOptionClick(originalKey);
        }
        else if (e.key === '3' || e.key.toUpperCase() === 'C') {
          const originalKey = getOriginalKeyFromPosition(2);
          if (originalKey) handleOptionClick(originalKey);
        }
        else if (e.key === '4' || e.key.toUpperCase() === 'D') {
          const originalKey = getOriginalKeyFromPosition(3);
          if (originalKey) handleOptionClick(originalKey);
        }
        else if (e.key === 'Enter' && selectedOption) {
          e.preventDefault();
          handleSubmitClick();
        }
      } else {
        if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'n') {
          e.preventDefault();
          onNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, currentQuestion, isSubmitted, selectedOption]);

  // Detect "Stuck" state (45s without answer) - Rio suggests hint instead of auto-applying
  useEffect(() => {
    // Reset state on new question
    setDisabledOptions([]);
    setShowHintOffer(false);
    setHintUsedThisQuestion(false);
    setHintCount(getHintsRemaining());
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);

    if (isLoading || !currentQuestion || isSubmitted || isSprintMode || selectedOption) return;

    // Start 45s timer - Rio offers hint but doesn't auto-apply
    stuckTimerRef.current = setTimeout(() => {
      const hints = getHintsRemaining();
      if (hints > 0) {
        setShowHintOffer(true);
        triggerMascot(
          'suggesting',
          'greeting',
          `Stuck? You have ${hints} hint${hints > 1 ? 's' : ''} remaining. Tap 💡 to use one!`
        );
      } else {
        triggerMascot(
          'encouraging',
          'greeting',
          'Take your time! Review each option carefully. You can buy hints in the shop. 🛍️'
        );
      }
    }, 45000);

    return () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    };
  }, [currentQuestion?.id, isSubmitted, isSprintMode, isLoading, selectedOption, triggerMascot]);

  // Use a hint manually
  const handleUseHint = () => {
    if (!currentQuestion || hintUsedThisQuestion || hintCount <= 0) return;

    // Consume a hint
    const success = useHint();
    if (!success) return;

    setHintUsedThisQuestion(true);
    setHintCount(prev => prev - 1);
    setShowHintOffer(false);

    // Apply the 50/50 elimination
    const correctKey = currentQuestion.correctAnswer;
    const allKeys: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    const wrongKeys = allKeys.filter(key =>
      key !== correctKey && currentQuestion.options[key]
    );

    if (wrongKeys.length < 2) return;

    const shuffledWrong = shuffleArray(wrongKeys);
    const optionsToDisable = shuffledWrong.slice(0, 2);

    setDisabledOptions(optionsToDisable);
    vibrate([50, 50]);

    triggerMascot(
      'celebrating',
      'greeting',
      "Two wrong options removed! 🪄 Now pick wisely!"
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] md:min-h-[400px] space-y-4 px-4 animate-fade-in">
        <div className="spinner rounded-full h-10 w-10 md:h-12 md:w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p className={`font-medium italic text-sm md:text-base text-center ${isDark ? 'text-blue-400' : 'text-blue-600'
          }`}>
          Consulting the Knowledge Base...
        </p>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 px-4 animate-fade-in">
        <RioMascot
          state="suggesting"
          size="large"
          variant="presenter"
          position="inline"
          showBubble={true}
          bubbleText="Ready to practice? Let's start a quiz! 📚"
        >
          <div className={`rounded-xl p-5 shadow-lg border text-center mt-4 ${isDark ? 'bg-slate-900 border-blue-500/20' : 'bg-white border-blue-100'
            }`}>
            <p className={`mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              No question loaded yet.
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="btn-press px-6 py-3 gradient-blue text-white font-bold rounded-xl shadow-glow-blue"
            >
              Go to Dashboard
            </button>
          </div>
        </RioMascot>
      </div>
    );
  }

  const savedMCQ = currentQuestion as SavedMCQ;
  const timerUrgency = getTimerUrgency();

  return (
    <div
      className="max-w-3xl mx-auto px-2 md:px-0 animate-slide-up relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sprint Timer - Critical border glow with pulse (stops when sprint ends) */}
      {isSprintMode && timerUrgency === 'critical' && !isSprintEnded && !showSprintResult && (
        <div className="fixed inset-0 pointer-events-none z-40 animate-pulse">
          <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-red-500 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-2 bg-gradient-to-t from-red-500 to-transparent" />
          <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-red-500 to-transparent" />
          <div className="absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-red-500 to-transparent" />
        </div>
      )}

      {/* Sprint Timer Header */}
      {isSprintMode && (
        <div className={`mb-4 p-3 rounded-xl flex items-center justify-between ${isSprintEnded
          ? isDark ? 'bg-slate-800 border border-slate-700' : 'bg-gray-100 border border-gray-300'
          : timerUrgency === 'critical'
            ? isDark ? 'bg-red-900/30 border-2 border-red-400/50' : 'bg-red-100 border-2 border-red-400'
            : timerUrgency === 'warning'
              ? isDark ? 'bg-orange-900/30 border border-orange-400/50' : 'bg-orange-100 border border-orange-300'
              : isDark ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'
          }`}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">
              {isSprintEnded ? '🏁' : '⚡'}
            </span>
            <div>
              <p className={`font-bold text-sm ${isSprintEnded ? 'text-gray-600' : timerUrgency === 'critical' ? 'text-red-600' : 'text-blue-600'
                }`}>
                {isSprintEnded ? 'Sprint Complete!' : `${sprintDurationMin}-Minute Sprint`}
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">{state.history.length} answered</span>
                {currentStreak > 0 && !isSprintEnded && (
                  <span className="bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                    🔥 {currentStreak}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Timer Display */}
          <div className="text-right">
            <p className={`text-2xl font-black font-mono ${isSprintEnded
              ? 'text-gray-500'
              : timerUrgency === 'critical'
                ? 'text-red-600'
                : timerUrgency === 'warning'
                  ? 'text-orange-600'
                  : 'text-blue-600'
              }`}>
              {isSprintEnded ? '0:00' : formatTime(timeRemaining)}
            </p>
            <p className={`text-xs ${timerUrgency === 'critical' ? 'text-red-500 font-bold' : 'text-gray-400'
              }`}>
              {timerUrgency === 'critical' && !isSprintEnded ? '⚠️ HURRY!' : 'remaining'}
            </p>
          </div>
        </div>
      )}

      {/* Topic Badge + Exam Style + Difficulty + Source */}
      <div className="mb-3 md:mb-4 flex flex-wrap items-center gap-2">
        {/* Topic */}
        <span className="inline-block px-2 py-1 md:px-3 gradient-blue text-white text-[10px] md:text-xs font-bold rounded-full uppercase shadow-soft">
          {currentQuestion.topic}
        </span>

        {/* Exam Style Badge */}
        {savedMCQ.examStyle && (
          <span className={`inline-block px-2 py-0.5 text-[9px] md:text-[10px] font-bold rounded-full ${savedMCQ.examStyle === 'NEET-SS'
            ? 'bg-purple-100 text-purple-700 border border-purple-300'
            : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
            }`}>
            {savedMCQ.examStyle}
          </span>
        )}

        {/* Difficulty Badge */}
        {savedMCQ.difficulty && (
          <span className={`inline-block px-2 py-0.5 text-[9px] md:text-[10px] font-bold rounded-full ${savedMCQ.difficulty === 'easy'
            ? 'bg-green-100 text-green-700'
            : savedMCQ.difficulty === 'moderate'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700'
            }`}>
            {savedMCQ.difficulty === 'easy' ? '🟢' : savedMCQ.difficulty === 'moderate' ? '🟡' : '🔴'} {savedMCQ.difficulty}
          </span>
        )}

        {/* Source Reference (Book, Chapter, Page) */}
        {savedMCQ.sourceLocation && (savedMCQ.sourceLocation.bookName || savedMCQ.sourceLocation.chapter || savedMCQ.sourceLocation.pageNumber) && (
          <span className="text-[10px] md:text-xs text-gray-400 flex items-center gap-1">
            📖
            {savedMCQ.sourceLocation.bookName && <span className="font-medium">{savedMCQ.sourceLocation.bookName}</span>}
            {savedMCQ.sourceLocation.bookName && savedMCQ.sourceLocation.chapter && <span>:</span>}
            {savedMCQ.sourceLocation.chapter && <span>{savedMCQ.sourceLocation.chapter}</span>}
            {savedMCQ.sourceLocation.section && <span className="text-gray-300">› {savedMCQ.sourceLocation.section}</span>}
            {savedMCQ.sourceLocation.pageNumber && <span className="text-gray-300">(p.{savedMCQ.sourceLocation.pageNumber})</span>}
          </span>
        )}
      </div>

      {/* Question Card */}
      <div className={`rounded-xl md:rounded-2xl border shadow-medium overflow-hidden transition-colors ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
        } ${answerAnimation === 'correct' ? 'answer-correct shadow-glow-green' :
          answerAnimation === 'wrong' ? 'answer-wrong shadow-glow-red' : ''
        }`}>
        {/* Question */}
        <div className={`p-4 md:p-6 lg:p-8 border-b ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-gray-200'}
          }`}>

          <h3 className={`text-sm md:text-lg lg:text-xl font-medium leading-relaxed ${isDark ? 'text-gray-100' : 'text-gray-800'
            }`}>
            {currentQuestion.question}
          </h3>
        </div>

        {/* Options - Shuffled to prevent position memorization */}
        <div className={`p-3 md:p-6 lg:p-8 space-y-2 md:space-y-3 ${isDark ? 'bg-slate-900' : ''
          }`}>
          {shuffledOptions.map((option, index) => {
            // selectedOption stores the ORIGINAL key, so compare with originalKey
            const isSelected = selectedOption === option.originalKey;
            const isCorrect = isSubmitted && currentQuestion.correctAnswer === option.originalKey;
            const isWrong = isSubmitted && isSelected && currentQuestion.correctAnswer !== option.originalKey;

            // Stuck Detection: Disabled styling
            const isDisabledOption = disabledOptions.includes(option.originalKey);

            let bgColor = isDark ? 'bg-slate-800 hover:bg-slate-750' : 'bg-white hover:bg-gray-50';
            let borderColor = isDark ? 'border-slate-700' : 'border-gray-200';
            let shadowClass = '';
            let contentOpacity = 'opacity-100';
            let animationClass = ''; // Magic Vanish class

            if (isDisabledOption) {
              // Magic Vanish: Animate out and effectively remove
              animationClass = 'animate-magic-vanish';
              bgColor = isDark ? 'bg-slate-800' : 'bg-gray-50'; // Fallback
              contentOpacity = 'opacity-40 grayscale';
            } else if (isSelected && !isSubmitted) {
              bgColor = isDark ? 'bg-blue-900/30' : 'bg-blue-50';
              borderColor = isDark ? 'border-blue-400/50' : 'border-blue-400';
              shadowClass = isDark ? 'shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'shadow-glow-blue';
            }

            if (isCorrect) {
              bgColor = isDark ? 'bg-green-900/30' : 'bg-green-50';
              borderColor = isDark ? 'border-green-400/50' : 'border-green-500';
              shadowClass = isDark ? 'shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'shadow-glow-green';
              contentOpacity = 'opacity-100'; // Ensure correct answer is always visible
            }
            if (isWrong) {
              bgColor = isDark ? 'bg-red-900/30' : 'bg-red-50';
              borderColor = isDark ? 'border-red-400/50' : 'border-red-500';
              shadowClass = isDark ? 'shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'shadow-glow-red';
            }

            return (
              <button
                key={option.displayKey}
                disabled={isSubmitted || isDisabledOption}
                onClick={() => !isDisabledOption && handleOptionClick(option.originalKey)}
                className={`option-select w-full text-left flex items-start gap-2 md:gap-3 p-3 md:p-4 rounded-lg md:rounded-xl border-2 btn-press relative ${bgColor} ${borderColor} ${shadowClass} ${isSelected ? 'selected' : ''} ${animationClass} transition-all duration-500`}
              >
                {isDisabledOption && <div className="sparkle-overlay"></div>}
                <span className={`flex-shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full border-2 flex items-center justify-center text-xs md:text-sm font-bold transition-all ${isDisabledOption ? 'border-gray-200 text-gray-300' :
                  isSelected ? 'bg-blue-600 border-blue-600 text-white scale-110' :
                    isCorrect ? 'bg-green-600 border-green-600 text-white' :
                      isWrong ? 'bg-red-600 border-red-600 text-white' : 'text-gray-400 border-gray-300'
                  }`}>
                  {isCorrect ? '✓' : isWrong ? '✗' : option.displayKey}
                </span>
                <span className={`text-xs md:text-sm lg:text-base font-medium flex-1 ${contentOpacity} ${isDark ? 'text-gray-200' : 'text-gray-700'
                  }`}>
                  {option.value}
                </span>
                {!isDisabledOption && (
                  <span className="hidden md:inline-block text-[10px] text-gray-300 font-mono">
                    {index + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Submit Button + Hint Button */}
        {!isSubmitted ? (
          <div ref={submitRef} className={`p-3 md:p-6 lg:p-8 border-t ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
            }`}>
            {/* Hint used indicator - subtle, above buttons */}
            {hintUsedThisQuestion && (
              <div className={`mb-2 py-1.5 rounded-lg text-xs text-center ${isDark ? 'bg-slate-800 text-slate-500' : 'bg-gray-100 text-gray-400'}`}>
                💡 Hint used - 2 options eliminated
              </div>
            )}

            {/* Button row */}
            <div className="flex items-stretch gap-2">
              {/* Small Hint Button on the LEFT (to avoid Rio mascot on right) */}
              {hintCount > 0 && !hintUsedThisQuestion && disabledOptions.length === 0 && (
                <button
                  onClick={handleUseHint}
                  title={`Use 50/50 Hint (${hintCount} left)`}
                  className={`px-3 md:px-4 rounded-xl flex flex-col items-center justify-center transition-all flex-shrink-0 ${showHintOffer
                    ? 'bg-gradient-to-b from-yellow-400 to-amber-500 text-white shadow-lg animate-pulse'
                    : isDark
                      ? 'bg-slate-800 text-amber-400 border border-amber-500/30 hover:bg-slate-700'
                      : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                    }`}
                >
                  <span className="text-lg">💡</span>
                  <span className="text-[10px] font-bold">{hintCount}</span>
                </button>
              )}

              {/* Submit Button - takes most space */}
              <button
                disabled={!selectedOption}
                onClick={handleSubmitClick}
                className="btn-press flex-1 py-3 md:py-4 gradient-blue text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-blue hover:shadow-lg transition-all text-sm md:text-base"
              >
                Submit Answer
                <span className="hidden md:inline text-blue-200 text-xs ml-2">[Enter]</span>
              </button>
            </div>
          </div>
        ) : (
          /* Explanation Section */
          <div className={`p-3 md:p-6 lg:p-8 border-t space-y-3 md:space-y-4 animate-fade-in ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'
            }`}>
            {/* Result + SRS Message */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <span className={`text-base md:text-lg font-bold ${selectedOption === currentQuestion.correctAnswer ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                  {selectedOption === currentQuestion.correctAnswer ? '✓ Correct!' : '✗ Incorrect'}
                </span>
                <span className={`text-xs md:text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                  Answer: {getDisplayKey(currentQuestion.correctAnswer as 'A' | 'B' | 'C' | 'D')}
                </span>
              </div>
              {/* SRS Message - subtle, to the right */}
              {state.srsMessage && (
                <span className={`text-xs md:text-sm italic ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                  {state.srsMessage}
                </span>
              )}
            </div>

            {/* Mistake Anatomy - Trap Analysis */}
            {selectedOption &&
              selectedOption !== currentQuestion.correctAnswer &&
              currentQuestion.trapAnalysis &&
              currentQuestion.trapAnalysis[selectedOption] && (
                <div className={`p-3 md:p-4 rounded-lg md:rounded-xl animate-in slide-in-from-top-2 border ${isDark ? 'bg-amber-900/20 border-amber-500/30' : 'bg-amber-50 border-amber-200'
                  }`}>
                  <div className="flex gap-3">
                    <div className="text-xl md:text-2xl">⚠️</div>
                    <div>
                      <h4 className={`font-bold text-[10px] md:text-xs uppercase tracking-wide mb-1 ${isDark ? 'text-amber-400' : 'text-amber-800'
                        }`}>
                        Common Pitfall
                      </h4>
                      <p className={`text-xs md:text-sm font-medium leading-relaxed ${isDark ? 'text-amber-300' : 'text-amber-900'
                        }`}>
                        {currentQuestion.trapAnalysis[selectedOption]}
                      </p>
                    </div>
                  </div>
                </div>
              )}


            {/* Sprint Mode: Just show flash feedback (auto-advances) */}
            {isSprintMode && (
              <div className={`text-center py-4 rounded-xl ${selectedOption === currentQuestion.correctAnswer
                ? isDark ? 'bg-green-900/20' : 'bg-green-100'
                : isDark ? 'bg-red-900/20' : 'bg-red-100'
                }`}>
                <span className="text-4xl">
                  {selectedOption === currentQuestion.correctAnswer ? '✓' : '✗'}
                </span>
              </div>
            )}

            {/* Normal Mode: Full explanations */}
            {!isSprintMode && (
              <>
                {/* Deep Dive */}
                <div className={`p-3 md:p-4 rounded-lg md:rounded-xl border shadow-soft ${isDark ? 'bg-slate-800 border-blue-500/20' : 'bg-white border-blue-100'
                  }`}>
                  <h4 className={`font-bold text-[10px] md:text-xs mb-1 md:mb-2 uppercase tracking-wide ${isDark ? 'text-blue-400' : 'text-blue-800'
                    }`}>
                    Deep Dive
                  </h4>
                  <div className={`text-xs md:text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                    {formatExplanationText(currentQuestion.deepDiveExplanation || '')}
                  </div>
                </div>

                {/* Rio's Take - She delivers the High-Yield Pearl */}
                <div className={`flex items-start gap-3 p-3 md:p-4 rounded-lg md:rounded-xl border shadow-soft ${isDark ? 'bg-gradient-to-r from-amber-900/20 to-orange-900/20 border-amber-500/30' : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
                  }`}>
                  <div className="flex-shrink-0">
                    <RioMascot
                      state="presenting"
                      size="small"
                      position="inline"
                      variant="inline"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-bold text-[10px] md:text-xs mb-1 uppercase tracking-wide flex items-center gap-1 ${isDark ? 'text-amber-400' : 'text-amber-800'
                      }`}>
                      <span>Rio's Take</span>
                      <span className={isDark ? 'text-amber-500' : 'text-amber-500'}>💎</span>
                    </h4>
                    <p className={`text-xs md:text-sm italic font-medium leading-relaxed ${isDark ? 'text-amber-300' : 'text-amber-900'
                      }`}>
                      "{currentQuestion.highYieldPearl}"
                    </p>
                  </div>
                </div>

                {/* Source Reference */}
                {savedMCQ.sourceSection && (
                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    <span>📖</span>
                    <span>Source: {savedMCQ.sourceSection}</span>
                  </div>
                )}

                {/* Teach Me This Topic - Only show when wrong */}
                {selectedOption !== currentQuestion.correctAnswer && (
                  <div className="space-y-3">
                    {/* Teach Me Button/Content */}
                    <div className={`p-3 md:p-4 rounded-lg md:rounded-xl border shadow-soft ${isDark ? 'bg-gradient-to-r from-indigo-900/20 to-purple-900/20 border-indigo-500/30' : 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200'
                      }`}>
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
                          <span className={`font-medium text-sm ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Generating explanation...</span>
                        </div>
                      ) : (
                        <div>
                          <h4 className={`font-bold text-xs mb-2 uppercase tracking-wide flex items-center gap-2 ${isDark ? 'text-indigo-400' : 'text-indigo-800'
                            }`}>
                            <span>🎓</span>
                            Why You Were Wrong
                          </h4>
                          <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                            {teachMeExplanation}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Confidence Rating - Show only when CORRECT and not yet selected */}
                {onConfidenceSelect && !confidenceSelected && selectedOption === currentQuestion.correctAnswer && (
                  <div className={`p-4 rounded-xl border shadow-soft ${isDark ? 'bg-gradient-to-r from-violet-900/20 to-purple-900/20 border-violet-500/30' : 'bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200'
                    }`}>
                    <p className={`text-center text-sm font-semibold mb-3 ${isDark ? 'text-violet-400' : 'text-violet-800'
                      }`}>
                      How confident were you?
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => {
                          vibrate(10);
                          setConfidenceSelected('guessed');
                          onConfidenceSelect('guessed');
                        }}
                        className={`btn-press py-3 rounded-xl font-bold text-xs transition-all flex flex-col items-center gap-1 ${isDark ? 'bg-amber-900/30 text-amber-400 hover:bg-amber-900/50' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                      >
                        <span className="text-lg">🎲</span>
                        <span>Guessed</span>
                      </button>
                      <button
                        onClick={() => {
                          vibrate(10);
                          setConfidenceSelected('somewhat');
                          onConfidenceSelect('somewhat');
                        }}
                        className={`btn-press py-3 rounded-xl font-bold text-xs transition-all flex flex-col items-center gap-1 ${isDark ? 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          }`}
                      >
                        <span className="text-lg">🤔</span>
                        <span>Somewhat</span>
                      </button>
                      <button
                        onClick={() => {
                          vibrate(10);
                          setConfidenceSelected('certain');
                          onConfidenceSelect('certain');
                        }}
                        className={`btn-press py-3 rounded-xl font-bold text-xs transition-all flex flex-col items-center gap-1 ${isDark ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50' : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                      >
                        <span className="text-lg">💯</span>
                        <span>Certain</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Show selected confidence */}
                {confidenceSelected && (
                  <div className={`text-center text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'
                    }`}>
                    Confidence: {confidenceSelected === 'guessed' ? '🎲 Guessed' : confidenceSelected === 'somewhat' ? '🤔 Somewhat Sure' : '💯 Certain'}
                  </div>
                )}

                {/* Action Buttons - Show after confidence selected for correct, immediately for wrong */}
                {(!onConfidenceSelect || confidenceSelected || selectedOption !== currentQuestion.correctAnswer) && (
                  <div className="flex gap-2">
                    {onSimilarQuestion && (
                      <button
                        onClick={handleSimilarQuestion}
                        disabled={isGeneratingSimilar}
                        className="btn-press flex-1 py-3 bg-purple-100 text-purple-700 font-bold rounded-xl hover:bg-purple-200 transition-all text-xs md:text-sm disabled:opacity-50 shadow-soft"
                      >
                        {isGeneratingSimilar ? '⏳ Generating...' : '🔄 Practice Similar'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        vibrate(10);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        onNext();
                      }}
                      className={`btn-press ${onSimilarQuestion ? 'flex-1' : 'w-full'} py-3 md:py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all text-sm md:text-base shadow-medium`}
                    >
                      Next →
                      <span className="hidden md:inline text-gray-500 text-xs ml-2">[Space]</span>
                    </button>
                  </div>
                )}

                {/* Swipe hint on mobile */}
                {(!onConfidenceSelect || confidenceSelected || selectedOption !== currentQuestion.correctAnswer) && (
                  <p className="md:hidden text-center text-[10px] text-gray-400">
                    ← Swipe left for next question
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Keyboard Hints */}
      <div className="hidden md:flex justify-center mt-4 text-xs text-gray-400 gap-4">
        <span>1-4 or A-D: Select</span>
        <span>Enter: Submit</span>
        <span>Space/N: Next</span>
      </div>

      {/* Sprint Result Modal */}
      {
        showSprintResult && isSprintMode && !showReviewMode && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className={`rounded-2xl p-6 md:p-8 max-w-sm w-full text-center shadow-2xl animate-pop max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
              <div className="text-6xl mb-2">🏁</div>
              <h2 className={`text-2xl font-black mb-1 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Sprint Complete!</h2>

              {/* New records badges */}
              {(sprintNewRecords.score || sprintNewRecords.streak || sprintNewRecords.speed) && (
                <div className="flex justify-center gap-2 mb-4">
                  {sprintNewRecords.score && (
                    <span className="bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full text-xs font-bold animate-bounce">
                      🏆 New Best Score!
                    </span>
                  )}
                  {sprintNewRecords.streak && (
                    <span className="bg-orange-400 text-orange-900 px-2 py-1 rounded-full text-xs font-bold animate-bounce">
                      🔥 New Best Streak!
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 my-5">
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-2xl font-black text-green-600">
                    {state.history.filter(h => h.correct).length}/{state.history.length}
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
                    {state.history.length}
                  </p>
                  <p className="text-[10px] text-blue-700 font-medium">Q/min</p>
                </div>
              </div>

              {/* Personal Best Comparison */}
              <div className="bg-gray-50 rounded-xl p-3 mb-5 text-left">
                <p className="text-xs font-bold text-gray-500 mb-2">📊 Personal Bests</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-sm font-bold text-gray-700">{getSprintBest().bestScore}</p>
                    <p className="text-[9px] text-gray-400">Score</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-700">{getSprintBest().bestStreak}</p>
                    <p className="text-[9px] text-gray-400">Streak</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-700">{getSprintBest().bestSpeed.toFixed(1)}</p>
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
                      setShowSprintResult(false);
                      setShowReviewMode(true);
                      setReviewIndex(0);
                    }}
                    className="btn-press w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all"
                  >
                    📖 Review Mistakes ({wrongAnswers.length})
                  </button>
                )}
                <button
                  onClick={() => {
                    vibrate(15);
                    setShowSprintResult(false);
                    setIsSprintEnded(false);
                    setTimeRemaining(1 * 60);
                    setCurrentStreak(0);
                    setBestStreakThisSprint(0);
                    window.location.reload();
                  }}
                  className="btn-press w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all"
                >
                  🔄 Try Again
                </button>
                <button
                  onClick={() => {
                    vibrate(10);
                    setShowSprintResult(false);
                    window.location.href = '/';
                  }}
                  className="btn-press w-full py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all"
                >
                  🏠 Back to Home
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Review Mistakes Mode */}
      {
        showReviewMode && wrongAnswers.length > 0 && (
          <div className="fixed inset-0 bg-black/70 z-50 overflow-y-auto">
            <div className="min-h-screen p-4 pb-24">
              {/* Header */}
              <div className="max-w-2xl mx-auto mb-4">
                <div className={`rounded-xl p-4 flex items-center justify-between shadow-lg ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
                  <div>
                    <h2 className={`font-bold text-lg ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>📖 Review Mistakes</h2>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                      Question {reviewIndex + 1} of {wrongAnswers.length}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      vibrate(10);
                      setShowReviewMode(false);
                      setShowSprintResult(true);
                    }}
                    className="btn-press px-4 py-2 bg-gray-100 rounded-lg text-gray-600 font-medium"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              {/* Review Card */}
              <div className={`max-w-2xl mx-auto rounded-2xl shadow-xl overflow-hidden ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
                {/* Question */}
                <div className={`p-4 md:p-6 border-b ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                  <span className={`inline-block px-2 py-1 text-xs font-bold rounded-full mb-3 ${isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'}`}>
                    ❌ You Got This Wrong
                  </span>
                  <p className={`font-medium text-sm md:text-base ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                    {wrongAnswers[reviewIndex].mcq.question}
                  </p>

                  {/* Source Reference in Review */}
                  {wrongAnswers[reviewIndex].mcq.sourceLocation && (
                    <div className={`mt-3 pt-3 border-t flex items-start gap-2 text-[10px] ${isDark ? 'border-slate-700 text-slate-400' : 'border-gray-200 text-gray-500'}`}>
                      <span className="mt-0.5">📖</span>
                      <span className="break-words">
                        {wrongAnswers[reviewIndex].mcq.sourceLocation?.bookName && <span className="font-semibold">{wrongAnswers[reviewIndex].mcq.sourceLocation.bookName}</span>}
                        {wrongAnswers[reviewIndex].mcq.sourceLocation?.chapter && <span> • {wrongAnswers[reviewIndex].mcq.sourceLocation.chapter}</span>}
                        {wrongAnswers[reviewIndex].mcq.sourceLocation?.pageNumber && <span> (p.{wrongAnswers[reviewIndex].mcq.sourceLocation.pageNumber})</span>}
                      </span>
                    </div>
                  )}
                </div>

                {/* Options with highlights */}
                <div className="p-4 md:p-6 space-y-2">
                  {Object.entries(wrongAnswers[reviewIndex].mcq.options).map(([key, value]) => {
                    const isUserAnswer = key === wrongAnswers[reviewIndex].userAnswer;
                    const isCorrectAnswer = key === wrongAnswers[reviewIndex].mcq.correctAnswer;

                    let bgColor = 'bg-gray-50';
                    let borderColor = 'border-gray-200';
                    let icon = '';

                    if (isCorrectAnswer) {
                      bgColor = isDark ? 'bg-green-900/20' : 'bg-green-50';
                      borderColor = isDark ? 'border-green-700' : 'border-green-500';
                      icon = '✓ Correct';
                    } else if (isUserAnswer) {
                      bgColor = isDark ? 'bg-red-900/20' : 'bg-red-50';
                      borderColor = isDark ? 'border-red-700' : 'border-red-500';
                      icon = '✗ Your Answer';
                    } else {
                      bgColor = isDark ? 'bg-slate-800' : 'bg-gray-50';
                      borderColor = isDark ? 'border-slate-700' : 'border-gray-200';
                    }

                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-xl border-2 ${bgColor} ${borderColor}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isCorrectAnswer ? 'bg-green-600 text-white' :
                            isUserAnswer ? 'bg-red-600 text-white' :
                              'bg-gray-300 text-gray-600'
                            }`}>
                            {key}
                          </span>
                          <span className={`text-sm flex-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{value}</span>
                          {icon && (
                            <span className={`text-xs font-bold ${isCorrectAnswer ? 'text-green-600' : 'text-red-600'}`}>
                              {icon}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={`p-4 md:p-6 border-t space-y-4 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                  {/* Trap Analysis - Why you were wrong */}
                  {wrongAnswers[reviewIndex].mcq.trapAnalysis &&
                    wrongAnswers[reviewIndex].mcq.trapAnalysis![wrongAnswers[reviewIndex].userAnswer] && (
                      <div className={`p-4 rounded-xl border ${isDark ? 'bg-amber-900/20 border-amber-700' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex gap-2 mb-2">
                          <span className="text-lg">⚠️</span>
                          <h4 className={`font-bold text-xs uppercase tracking-wide mt-1 ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
                            Common Pitfall
                          </h4>
                        </div>
                        <p className={`text-sm font-medium leading-relaxed ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                          {wrongAnswers[reviewIndex].mcq.trapAnalysis![wrongAnswers[reviewIndex].userAnswer]}
                        </p>
                      </div>
                    )}

                  {/* Deep Dive */}
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-100'}`}>
                    <h4 className={`font-bold text-xs mb-2 uppercase tracking-wide ${isDark ? 'text-blue-400' : 'text-blue-800'}`}>
                      Deep Dive
                    </h4>
                    <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                      {wrongAnswers[reviewIndex].mcq.deepDiveExplanation}
                    </p>
                  </div>

                  {/* High-Yield Pearl */}
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-gradient-to-r from-amber-900/20 to-orange-900/20 border-amber-700' : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">💎</span>
                      <h4 className={`font-bold text-xs uppercase tracking-wide ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
                        Rio's Take
                      </h4>
                    </div>
                    <p className={`text-sm italic font-medium ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                      "{wrongAnswers[reviewIndex].mcq.highYieldPearl}"
                    </p>
                  </div>
                </div>

                {/* Navigation */}
                <div className={`p-4 md:p-6 border-t flex gap-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                  <button
                    onClick={() => {
                      vibrate(10);
                      setReviewIndex(prev => Math.max(0, prev - 1));
                    }}
                    disabled={reviewIndex === 0}
                    className={`btn-press flex-1 py-3 font-bold rounded-xl disabled:opacity-40 ${isDark ? 'bg-slate-700 text-gray-200' : 'bg-gray-200 text-gray-700'}`}
                  >
                    ← Previous
                  </button>
                  {reviewIndex < wrongAnswers.length - 1 ? (
                    <button
                      onClick={() => {
                        vibrate(10);
                        setReviewIndex(prev => prev + 1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="btn-press flex-1 py-3 bg-gray-900 text-white font-bold rounded-xl"
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        vibrate(15);
                        setShowReviewMode(false);
                        setShowSprintResult(true);
                      }}
                      className="btn-press flex-1 py-3 bg-green-600 text-white font-bold rounded-xl"
                    >
                      ✓ Done
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default QuizView;
