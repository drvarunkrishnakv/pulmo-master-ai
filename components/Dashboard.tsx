import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { SavedMCQ } from '../types';
import { TopicCategory, getMCQsForCategory } from '../content';
import {
  getWrongAnswers,
  getAllMCQs,
  getSprintMCQs,
  getCoverageAwareMCQs,
  areBundledMCQsLoaded
} from '../services/mcqBankService';
import { getBalancedMCQSet } from '../services/mcqUtils';
import { getTodaysPractice, getSRSStats } from '../services/srsService';
import { checkStreakStatus, recordPractice, StreakData, getDaysUntilExam } from '../services/streakService';
import { getFlashcardsDueCount } from '../services/flashcardService';
import ExamCountdown from './ExamCountdown';
import RioMascot from './RioMascot';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import SmartRevision from './SmartRevision';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from './ThemeToggle';
import ExamNotificationBanner from './ExamNotificationBanner';

interface DashboardProps {
  categories: TopicCategory[];
  selectedCategory: TopicCategory | null;
  onSelectCategory: (category: TopicCategory) => void;
  onStartQuiz: (mcqs: SavedMCQ[]) => void;
  onStartSprint?: (mcqs: SavedMCQ[], duration?: number) => void;
}

// Haptic feedback utility
const vibrate = (pattern: number | number[] = 10) => {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
};

// Sprint storage key
const SPRINT_STATS_KEY = 'pulmo_sprint_stats';

interface SprintStats {
  lastSprintDate: string;
  currentStreak: number;
  bestStreak: number;
  totalSprints: number;
}

const getSprintStats = (): SprintStats => {
  try {
    const stored = localStorage.getItem(SPRINT_STATS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) { }
  return { lastSprintDate: '', currentStreak: 0, bestStreak: 0, totalSprints: 0 };
};

const Dashboard: React.FC<DashboardProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  onStartQuiz,
  onStartSprint
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [sprintStats] = useState<SprintStats>(getSprintStats);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [streakData, setStreakData] = useState<StreakData>(() => checkStreakStatus());

  // Check streak on mount
  useEffect(() => {
    setStreakData(checkStreakStatus());
  }, []);

  // Pull-to-refresh handler
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(async () => {
    vibrate([10, 50, 10]);
    setStreakData(checkStreakStatus());
    setRefreshKey(k => k + 1); // Force recalculation of all stats
    // Small delay to show refresh animation
    await new Promise(resolve => setTimeout(resolve, 500));
  }, []);

  // Listen for visibility changes (coming back to dashboard) and exam date changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setRefreshKey(k => k + 1);
      }
    };

    const handleExamDateChange = () => {
      setRefreshKey(k => k + 1);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('examDateChanged', handleExamDateChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('examDateChanged', handleExamDateChange);
    };
  }, []);

  const { pullDistance, isRefreshing, shouldTrigger, handlers: pullHandlers } = usePullToRefresh(handleRefresh);

  // Daily greeting check
  const [showDailyGreeting, setShowDailyGreeting] = useState(false);
  const [showSprintMenu, setShowSprintMenu] = useState(false);

  useEffect(() => {
    const today = new Date().toDateString();
    const lastGreeting = localStorage.getItem('rio_last_greeting_date');
    if (lastGreeting !== today) {
      setShowDailyGreeting(true);
      localStorage.setItem('rio_last_greeting_date', today);
      // Auto-hide after 5 seconds
      setTimeout(() => setShowDailyGreeting(false), 5000);
    }
  }, []);

  // Track when bundled MCQs finish loading to trigger re-render
  const [mcqsLoaded, setMcqsLoaded] = useState(() => areBundledMCQsLoaded());

  useEffect(() => {
    if (mcqsLoaded) return; // Already loaded

    // Poll until MCQs are loaded (they load async on app startup)
    const interval = setInterval(() => {
      if (areBundledMCQsLoaded()) {
        setMcqsLoaded(true);
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [mcqsLoaded]);

  // Calculate weakness stats
  const weaknessData = useMemo(() => {
    const wrongAnswers = getWrongAnswers(20);
    const allMCQs = getAllMCQs();
    const attempted = allMCQs.filter(m => m.timesAttempted > 0);

    // Get stale questions (not attempted in 2+ weeks)
    const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const staleQuestions = allMCQs.filter(m =>
      m.timesAttempted > 0 &&
      m.lastAttemptedAt &&
      m.lastAttemptedAt < twoWeeksAgo
    );

    // Get weakest subtopics (simplified - no book loop needed)
    const weakSubtopics: { name: string; accuracy: number }[] = [];
    // For categories, we use getAllMCQs and group by topic
    const allMCQsByTopic = new Map<string, SavedMCQ[]>();
    allMCQs.forEach(m => {
      const topic = m.topic || 'General';
      if (!allMCQsByTopic.has(topic)) allMCQsByTopic.set(topic, []);
      allMCQsByTopic.get(topic)!.push(m);
    });

    allMCQsByTopic.forEach((mcqs, topicName) => {
      const totalAttempts = mcqs.reduce((sum, m) => sum + m.timesAttempted, 0);
      const totalCorrect = mcqs.reduce((sum, m) => sum + m.correctAttempts, 0);
      const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : -1;
      if (accuracy >= 0 && accuracy < 60 && totalAttempts > 0) {
        weakSubtopics.push({ name: topicName, accuracy });
      }
    });
    weakSubtopics.sort((a, b) => a.accuracy - b.accuracy);

    return {
      wrongCount: wrongAnswers.length,
      staleCount: staleQuestions.length,
      totalAttempted: attempted.length,
      totalMCQs: allMCQs.length,
      weakSubtopics: weakSubtopics.slice(0, 3)
    };
  }, [mcqsLoaded, refreshKey]);

  // Calculate daily target progress (new MCQs only)
  const dailyProgress = useMemo(() => {
    const allMCQs = getAllMCQs();
    const daysLeft = getDaysUntilExam();

    // Count new MCQs attempted today (first-time attempts)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const newTodayCount = allMCQs.filter(m =>
      m.timesAttempted === 1 &&
      m.lastAttemptedAt &&
      m.lastAttemptedAt >= todayMs
    ).length;

    // Calculate required velocity (same logic as ExamCountdown)
    const attemptedCount = allMCQs.filter(m => m.timesAttempted > 0).length;
    const remaining = allMCQs.length - attemptedCount;
    const revisionDays = 30;

    // If exam date is set, use actual days; otherwise default 90 days
    const effectiveDaysLeft = daysLeft ?? 90;
    const initialLearningDays = Math.max(1, effectiveDaysLeft - revisionDays);
    const requiredVelocity = Math.ceil(remaining / initialLearningDays);

    // Use requiredVelocity directly (matches Mission Status tile)
    // Only apply minimum if no questions remain or no exam set
    const dailyTarget = daysLeft !== null
      ? requiredVelocity
      : Math.max(30, requiredVelocity); // 30 default when no exam date

    // Don't cap percent at 100 - show overachievement
    const percentComplete = dailyTarget > 0
      ? Math.round((newTodayCount / dailyTarget) * 100)
      : 100;
    const isGoalMet = newTodayCount >= dailyTarget;
    const remaining2Go = Math.max(0, dailyTarget - newTodayCount);
    const bonus = Math.max(0, newTodayCount - dailyTarget); // Extra beyond target

    return {
      count: newTodayCount,
      target: dailyTarget,
      percent: percentComplete,
      isGoalMet,
      toGo: remaining2Go,
      bonus
    };
  }, [mcqsLoaded, refreshKey]);

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Handle Chapter Quiz (main quiz from selected category)
  const handleChapterQuiz = async () => {
    if (!selectedCategory) return;
    vibrate(20);

    setIsGenerating(true);
    setGenerationProgress('Loading questions...');

    try {
      // Get all MCQs for this category (from all subtopics)
      const allCategoryMCQs = await getMCQsForCategory(selectedCategory.id);
      const unusedMCQs = allCategoryMCQs.filter(m => m.timesAttempted === 0);

      // Prefer unused, but use any if not enough unused
      let mcqsToUse = unusedMCQs.length >= 5 ? unusedMCQs : allCategoryMCQs;

      if (mcqsToUse.length === 0) {
        alert('No MCQs available for this category yet.');
        setIsGenerating(false);
        return;
      }

      // Use balanced set (30% one-liners)
      const shuffled = getBalancedMCQSet(mcqsToUse, 10);
      setIsGenerating(false);
      onStartQuiz(shuffled);

    } catch (err) {
      console.error('Error loading quiz:', err);
      alert('Failed to load quiz. Please try again.');
      setIsGenerating(false);
    }
  };

  // Handle Today's Practice (SRS-powered)
  const handleTodaysPractice = () => {
    vibrate(20);

    const allMCQs = getAllMCQs();
    const { mcqs } = getTodaysPractice(allMCQs, 15);

    if (mcqs.length === 0) {
      alert('No questions ready yet! Start with a Chapter Quiz to build your practice bank.');
      return;
    }

    onStartQuiz(mcqs);
  };

  // Get SRS stats for display
  const srsStats = useMemo(() => {
    const allMCQs = getAllMCQs();
    return getSRSStats(allMCQs);
  }, [mcqsLoaded, refreshKey]);

  // Handle 5-Minute Sprint (Ghost Intelligence: prioritize 60-85% accuracy items)
  // Now supports variable duration (1, 3, 5, 7 mins) via menu
  const handleSprintStart = () => {
    vibrate(10);
    setShowSprintMenu(!showSprintMenu);
  };

  const handleSprintDurationSelect = (durationMinutes: number) => {
    vibrate(20);
    setShowSprintMenu(false);

    // Calculate needed questions (approx 20 per minute to be safe)
    const count = durationMinutes * 20;
    const mcqs = getSprintMCQs(count); // Uses smart selection

    if (mcqs.length < 5) {
      alert('Not enough questions available. Generate some quizzes first!');
      return;
    }

    // Use sprint handler if available, otherwise regular quiz
    if (onStartSprint) {
      onStartSprint(mcqs, durationMinutes);
    } else {
      onStartQuiz(mcqs);
    }
  };

  // Handle Random Challenge (Ghost Intelligence: coverage-aware, least-recently-seen topics)
  const handleRandomChallenge = () => {
    vibrate(15);
    const mcqs = getCoverageAwareMCQs(1); // Uses smart selection

    if (mcqs.length === 0) {
      alert('No questions available yet!');
      return;
    }

    onStartQuiz(mcqs);
  };

  return (
    <div
      className="max-w-2xl mx-auto space-y-5 md:space-y-6 animate-fade-in pb-16"
      {...pullHandlers}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 flex justify-center z-50 transition-all"
          style={{ paddingTop: Math.min(pullDistance, 60) }}
        >
          <div className={`bg-white dark:bg-slate-800 shadow-lg rounded-full p-3 ${isRefreshing ? 'animate-spin' : ''}`}>
            <span className="text-xl">
              {isRefreshing ? '🔄' : shouldTrigger ? '✓' : '↓'}
            </span>
          </div>
        </div>
      )}

      {/* Exam Updates Banner */}
      <ExamNotificationBanner />

      {/* Header and Toggle */}
      <header className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <RioMascot
              state={streakData.currentStreak > 0 ? 'celebrating' : 'greeting'}
              size="small"
              position="inline"
              variant="inline"
            />
          </div>
          <div>
            <h1 className={`text-lg md:text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
              {getGreeting()}! 👋
            </h1>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {srsStats.dueToday > 0
                ? `${srsStats.dueToday} questions due today`
                : streakData.currentStreak > 0
                  ? `🔥 ${streakData.currentStreak}-day streak!`
                  : 'Ready to learn?'
              }
            </p>
          </div>
        </div>

        <ThemeToggle size="md" />
      </header>

      {/* Goal & Exam Tiles */}
      <div className="grid grid-cols-2 gap-3">
        {/* Smart Revision Tile */}
        <SmartRevision onStartPractice={handleTodaysPractice} />

        {/* Exam Countdown */}
        <ExamCountdown />
      </div>

      {/* Topic Quiz Card - Primary Action */}
      <div className={`rounded-2xl border shadow-medium p-5 md:p-6 card-hover transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'
        }`}>
        <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'
          }`}>
          📖 Select a Topic
        </label>
        <select
          value={selectedCategory?.id || ''}
          onChange={(e) => {
            vibrate(5);
            const cat = categories.find(c => c.id === e.target.value);
            if (cat) onSelectCategory(cat);
          }}
          className={`btn-press w-full px-4 py-3 border-2 rounded-xl font-medium text-base focus:border-blue-500 focus:ring-2 transition-all mb-4 ${isDark
            ? 'border-slate-700 bg-slate-800 text-gray-100 focus:ring-blue-900/50'
            : 'border-gray-200 bg-white text-gray-800 focus:ring-blue-100'
            }`}
        >
          {categories.length === 0 ? (
            <option value="">Loading topics...</option>
          ) : (
            categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
            ))
          )}
        </select>

        {isGenerating ? (
          <div className="flex items-center justify-center gap-4 py-4">
            <div className="spinner rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <div>
              <p className="text-blue-600 dark:text-blue-400 font-semibold text-sm">{generationProgress}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">This may take a moment...</p>
            </div>
          </div>
        ) : (
          <button
            onClick={handleChapterQuiz}
            disabled={!selectedCategory}
            className="btn-press w-full py-4 gradient-blue text-white font-bold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-blue hover:shadow-lg transition-all flex items-center justify-center gap-3 relative overflow-hidden"
          >
            {/* Progress bar background */}
            <div
              className="absolute inset-0 bg-white/10 transition-all duration-500"
              style={{
                width: `${Math.min(dailyProgress.percent, 100)}%`,
                background: dailyProgress.isGoalMet
                  ? 'linear-gradient(90deg, rgba(16,185,129,0.3), rgba(16,185,129,0.1))'
                  : 'linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))'
              }}
            />

            {/* Button content */}
            <span className="relative flex items-center gap-2">
              <span className="text-xl">🚀</span>
              <span className="hidden sm:inline">Start Quiz</span>
              <span className="sm:hidden">Quiz</span>
              <span className={`px-2 py-0.5 rounded-full text-sm font-bold ${dailyProgress.isGoalMet
                ? 'bg-emerald-400/30 text-emerald-100'
                : dailyProgress.percent >= 75
                  ? 'bg-amber-400/30 text-amber-100'
                  : 'bg-white/20'
                }`}>
                {dailyProgress.count}/{dailyProgress.target}
              </span>
              {dailyProgress.isGoalMet && <span className="text-lg">✓</span>}
            </span>
          </button>
        )}

        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-3">
          {dailyProgress.bonus > 0
            ? `🔥 Overachiever! +${dailyProgress.bonus} bonus today • ${selectedCategory?.name || 'Topic'}`
            : dailyProgress.isGoalMet
              ? `🎉 Daily target hit! From ${selectedCategory?.name || 'selected topic'}`
              : dailyProgress.toGo <= 10
                ? `Almost there! ${dailyProgress.toGo} more to hit target`
                : `10 MCQs • ${dailyProgress.toGo} to daily target • ${selectedCategory?.name || 'Topic'}`
          }
        </p>
      </div>

      {/* Sprint & Random in a row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <button
            onClick={handleSprintStart}
            className={`btn-press w-full h-full card-hover bg-gradient-to-br from-blue-500 to-cyan-500 dark:from-blue-900 dark:to-cyan-900 dark:border dark:border-blue-700 rounded-xl p-4 text-white text-left shadow-md transition-all ${showSprintMenu ? 'ring-4 ring-blue-200 dark:ring-blue-900' : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl">⚡</span>
              {sprintStats.currentStreak > 0 && (
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  🔥 {sprintStats.currentStreak}
                </span>
              )}
            </div>
            <h3 className="font-bold">Sprint Quiz</h3>
            <p className="text-blue-100 text-[10px] mt-0.5">{showSprintMenu ? 'Select duration...' : 'Race the clock'}</p>
          </button>

          {/* Sprint Duration Menu - Popover */}
          {showSprintMenu && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-blue-100 dark:border-slate-700 z-30 p-2 animate-in slide-in-from-top-2">
              <div className="grid grid-cols-2 gap-2">
                {[1, 3, 5, 7].map(min => (
                  <button
                    key={min}
                    onClick={() => handleSprintDurationSelect(min)}
                    className="btn-press py-2 px-1 bg-blue-50 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-slate-600 text-blue-700 dark:text-blue-200 rounded-lg text-sm font-bold transition-colors border border-blue-200 dark:border-slate-600"
                  >
                    {min} min
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-center text-gray-400 mt-2">Tap to start</div>
            </div>
          )}
        </div>

        <button
          onClick={handleRandomChallenge}
          className="btn-press card-hover bg-gradient-to-br from-purple-500 to-indigo-500 dark:from-purple-900 dark:to-indigo-900 dark:border dark:border-purple-700 rounded-xl p-4 text-white text-left shadow-md"
        >
          <span className="text-2xl mb-1 block">🎲</span>
          <h3 className="font-bold">Random</h3>
          <p className="text-purple-100 text-[10px] mt-0.5">Test your luck</p>
        </button>
      </div>

      {/* Flashcards Button */}
      <a
        href="#flashcards"
        onClick={(e) => {
          e.preventDefault();
          vibrate(15);
          // Navigate to flashcards - we'll handle this in App.tsx
          window.dispatchEvent(new CustomEvent('openFlashcards'));
        }}
        className="btn-press block bg-gradient-to-r from-fuchsia-500 to-pink-500 dark:from-fuchsia-900 dark:to-pink-900 dark:border dark:border-fuchsia-700 rounded-xl p-4 text-white shadow-lg card-hover"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🃏</span>
            <div>
              <h3 className="font-bold text-lg">Smart Flashcards</h3>
              <p className="text-pink-100 text-xs">
                {getFlashcardsDueCount()} cards ready • From your weak spots
              </p>
            </div>
          </div>
          <span className="text-2xl">→</span>
        </div>
      </a>

      {/* Weak Subtopics Alert */}
      {weaknessData.weakSubtopics.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 shadow-soft">
          <h3 className="font-bold text-amber-800 dark:text-amber-500 text-sm mb-2 flex items-center gap-2">
            <span>⚠️</span>
            Weak Spots
          </h3>
          <div className="space-y-1.5">
            {weaknessData.weakSubtopics.map((topic, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-amber-100 dark:border-amber-900/30"
              >
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-200 text-xs">{topic.name}</p>
                </div>
                <span className={`font-bold text-sm ${topic.accuracy < 40 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                  }`}>
                  {topic.accuracy}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-hover bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-3 text-center shadow-soft">
          <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{weaknessData.totalMCQs}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-500 uppercase">Total MCQs</p>
        </div>
        <div className="card-hover bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-3 text-center shadow-soft">
          <p className="text-xl font-bold text-red-600 dark:text-red-400">{weaknessData.wrongCount}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-500 uppercase">To Review</p>
        </div>
        <div className="card-hover bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-3 text-center shadow-soft">
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{weaknessData.totalAttempted}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-500 uppercase">Attempted</p>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-4">
        📚 {categories.length} topic categories • Crush NEET-SS 🎯
      </p>
    </div>
  );
};

export default Dashboard;
