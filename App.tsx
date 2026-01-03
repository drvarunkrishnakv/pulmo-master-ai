import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Home, Library, Play, BarChart3, Sparkles, CheckCircle, Menu } from 'lucide-react';
import { QuizState, MCQ, SavedMCQ } from './types';
import { deleteMCQsByBook, updateMCQStats, saveMCQs, loadBundledMCQsAsync, getAllMCQs } from './services/mcqBankService';
import { adjustForConfidence } from './services/srsService';
import { recordPractice } from './services/streakService';
import { getTopicCategories, TopicCategory } from './content';
import { generateSimilarQuestion } from './services/geminiService';
import { generateTargetedPracticeSession } from './services/smartSelectionService';
import Sidebar from './components/Sidebar';
import Confetti from './components/Confetti';
import RioMascot from './components/RioMascot';
import { recordQuizCompletion, Milestone } from './services/milestoneService';
import { checkStreakStatus } from './services/streakService';
import { MascotProvider, useMascot } from './contexts/MascotContext';
import GlobalMascot from './components/GlobalMascot';
import Skeleton from './components/Skeleton';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
// Gamification imports
import { awardXP, getLevelInfo, resetSessionStreak, awardPerfectQuizBonus, awardDailyGoalBonus, XPGain, LevelInfo } from './services/gamificationService';
import { isGoalCompleted, wasGoalBonusClaimed, markGoalBonusClaimed } from './services/dailyGoalService';
import XPPopup from './components/XPPopup';
import LevelUpCelebration from './components/LevelUpCelebration';
import PowerupShop from './components/PowerupShop';

// Initialize Firebase (side effect import)
import './services/firebase';

// Lazy Load Components
const Dashboard = lazy(() => import('./components/Dashboard'));
const QuizView = lazy(() => import('./components/QuizView'));
const SubTopicAnalytics = lazy(() => import('./components/SubTopicAnalytics'));
const MCQBank = lazy(() => import('./components/MCQBank'));
const Flashcards = lazy(() => import('./components/Flashcards'));
const TrendDashboard = lazy(() => import('./components/TrendDashboard2'));
const RioPlayground = lazy(() => import('./components/RioPlayground'));
const HabitTracker = lazy(() => import('./components/HabitTracker'));

type TabType = 'dashboard' | 'practice' | 'analytics' | 'mcq-bank' | 'flashcards' | 'forecast' | 'habits';

// Inner App Content to use Mascot Context
const AppContent: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true); // Renamed to avoid confusion with lazy loading
  const { triggerMascot } = useMascot();

  const [showCelebration, setShowCelebration] = useState(false);
  const [quizResult, setQuizResult] = useState<{ correct: number; total: number } | null>(null);

  // Gamification state
  const [xpPopup, setXpPopup] = useState<{ xpGain: XPGain | null; coinsDrop: number }>({ xpGain: null, coinsDrop: 0 });
  const [levelUpInfo, setLevelUpInfo] = useState<{ levelInfo: LevelInfo; coins: number } | null>(null);
  const [showShop, setShowShop] = useState(false);
  // Pending level-up during sprint (to show after sprint ends)
  const pendingLevelUpRef = React.useRef<{ levelInfo: LevelInfo; coins: number } | null>(null);

  // Topic intro state
  const [showTopicIntro, setShowTopicIntro] = useState(false);
  const [currentTopic, setCurrentTopic] = useState<string>('');
  const [newMilestone, setNewMilestone] = useState<Milestone | null>(null);
  // Mobile sidebar state
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // Topic categories state
  const [categories, setCategories] = useState<TopicCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TopicCategory | null>(null);

  // Quiz state
  const [quizMCQs, setQuizMCQs] = useState<SavedMCQ[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);

  const [quizState, setQuizState] = useState<QuizState>({
    currentQuestion: null,
    selectedOption: null,
    isSubmitted: false,
    isLoading: false,
    history: []
  });

  // Initialize Background Intelligence (pre-caching, analytics warming, etc.)
  useEffect(() => {
    // Import and initialize after a short delay to let UI settle
    const timer = setTimeout(async () => {
      try {
        const { initBackgroundIntelligence } = await import('./services/backgroundIntelligenceService');
        initBackgroundIntelligence();
        console.log('✓ Background intelligence initialized');
      } catch (e) {
        console.warn('Background intelligence init failed:', e);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Load topic categories and bundled MCQs on startup
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await getTopicCategories();
        setCategories(cats);

        if (cats.length > 0 && !selectedCategory) {
          setSelectedCategory(cats[0]);
        }

        loadBundledMCQsAsync().then(() => {
          console.log('✓ Pre-generated MCQs loaded');
        }).catch(console.error);

      } catch (error) {
        console.error('Failed to load categories:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, []);

  // Handle flashcards open event
  useEffect(() => {
    const handleOpenFlashcards = () => {
      setActiveTab('flashcards');
    };
    window.addEventListener('openFlashcards', handleOpenFlashcards);
    return () => window.removeEventListener('openFlashcards', handleOpenFlashcards);
  }, []);

  const handleStartQuiz = (mcqs: SavedMCQ[]) => {
    if (mcqs.length === 0) return;

    recordPractice();
    resetSessionStreak(); // Reset gamification session streak for new quiz
    setQuizMCQs(mcqs);
    setCurrentQuizIndex(0);
    setQuizState({
      currentQuestion: mcqs[0],
      selectedOption: null,
      isSubmitted: false,
      isLoading: false,
      history: []
    });

    const topic = mcqs[0]?.topic || 'This Topic';
    setCurrentTopic(topic);
    setShowTopicIntro(true);

    setTimeout(() => {
      setShowTopicIntro(false);
      setActiveTab('practice');
      triggerMascot('greeting', 'greeting');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 2500);
  };

  const handleStartSprint = (mcqs: SavedMCQ[], duration: number = 5) => {
    if (mcqs.length === 0) return;

    recordPractice();
    setQuizMCQs(mcqs);
    setCurrentQuizIndex(0);
    setQuizState({
      currentQuestion: mcqs[0],
      selectedOption: null,
      isSubmitted: false,
      isLoading: false,
      history: [],
      isSprintMode: true,
      sprintStartTime: Date.now(),
      sprintDurationMinutes: duration
    });
    setActiveTab('practice');

    setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 100);
  };

  // Track response time for analytics
  const lastResponseTimeRef = React.useRef<number>(0);

  const handleOptionSelect = (opt: 'A' | 'B' | 'C' | 'D') => {
    setQuizState(prev => ({ ...prev, selectedOption: opt }));
  };

  // Called by QuizView when answer is submitted (tracks response time)
  const handleHesitationTracked = (responseTimeMs: number) => {
    lastResponseTimeRef.current = responseTimeMs;
  };

  const handleSubmit = () => {
    if (!quizState.currentQuestion || !quizState.selectedOption) return;

    const isCorrect = quizState.selectedOption === quizState.currentQuestion.correctAnswer;
    const currentMCQ = quizMCQs[currentQuizIndex] as SavedMCQ;

    let srsMessage = '';
    if (currentMCQ?.id) {
      // Pass response time and selected option for analytics tracking
      srsMessage = updateMCQStats(
        currentMCQ.id,
        isCorrect,
        lastResponseTimeRef.current,
        quizState.selectedOption
      );

      // Track time-of-day performance
      import('./services/timeOptimizationService').then(({ recordAttemptTime }) => {
        recordAttemptTime(isCorrect, lastResponseTimeRef.current);
      }).catch(() => { });

      // Reset for next question
      lastResponseTimeRef.current = 0;
    }

    // === GAMIFICATION: Award XP ===
    const isFirstTry = currentMCQ?.timesAttempted === 0;
    const isHardQuestion = currentMCQ?.difficulty === 'difficult';
    let xpResult = awardXP(isCorrect, isFirstTry, isHardQuestion);

    // Award Daily Goal Bonus if just completed
    if (isGoalCompleted() && !wasGoalBonusClaimed()) {
      const goalBonus = awardDailyGoalBonus();
      markGoalBonusClaimed();

      // Merge goal bonus into current XP result for a single massive popup
      xpResult = {
        ...xpResult,
        xpGained: {
          baseXP: xpResult.xpGained.baseXP + goalBonus.baseXP,
          bonusXP: xpResult.xpGained.bonusXP + goalBonus.bonusXP,
          multiplier: xpResult.xpGained.multiplier,
          totalXP: xpResult.xpGained.totalXP + goalBonus.totalXP,
          reason: xpResult.xpGained.reason + ' + Goal Crushed! 🎯'
        }
      };

      // Trigger major celebration
      triggerMascot('celebrating', 'milestone', "Daily Goal Crushed! You're unstoppable! 🔥");
      setShowCelebration(true);
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 100, 200]);
    }

    // Show XP popup only in non-sprint mode (sprint has its own quick feedback)
    if (!quizState.isSprintMode) {
      setXpPopup({ xpGain: xpResult.xpGained, coinsDrop: xpResult.coinsDrop });
    }

    // Handle level up - defer if in sprint mode
    if (xpResult.leveledUp) {
      const newLevelInfo = getLevelInfo();
      if (quizState.isSprintMode) {
        // Queue level-up for after sprint ends
        pendingLevelUpRef.current = { levelInfo: newLevelInfo, coins: 20 };
      } else {
        // Show immediately in normal quiz mode
        setTimeout(() => {
          setLevelUpInfo({ levelInfo: newLevelInfo, coins: 20 });
          triggerMascot('cheering', 'levelUp');
        }, 1000);
      }
    }

    // Handle coin drop - skip mascot reaction in sprint mode (XP popup is enough)
    if (xpResult.coinsDrop > 0 && !quizState.isSprintMode) {
      setTimeout(() => {
        triggerMascot('celebrating', 'coinDrop', `💎 +${xpResult.coinsDrop} gems!`);
      }, 500);
    }
    // === END GAMIFICATION ===

    setQuizState(prev => ({
      ...prev,
      isSubmitted: true,
      srsMessage,
      history: [...prev.history, {
        questionId: quizState.currentQuestion!.id,
        correct: isCorrect,
        domain: quizState.currentQuestion!.topic
      }]
    }));

    // Fatigue detection - check after each answer
    import('./services/fatigueService').then(({ recordQuestionResult }) => {
      const fatigueCheck = recordQuestionResult(isCorrect);
      if (fatigueCheck.shouldSuggestBreak && fatigueCheck.message) {
        // Use Rio to gently suggest a break (no scary stats shown!)
        setTimeout(() => {
          triggerMascot('suggesting', 'break', fatigueCheck.message);
        }, 1500);
      }
    }).catch(() => { });

    if (isCorrect) {
      const recentCorrect = quizState.history.slice(-2).filter(h => h.correct).length;
      if (recentCorrect >= 2) {
        triggerMascot('cheering', 'streak');
      } else {
        triggerMascot('celebrating', 'correct');
      }
    } else {
      triggerMascot('encouraging', 'wrong');

      // Concept linking - queue prerequisites for wrong answers
      const topic = quizState.currentQuestion?.topic;
      if (topic) {
        import('./services/conceptLinkService').then(({ processWrongAnswer }) => {
          processWrongAnswer(topic);
        }).catch(() => { });
      }
    }
  };

  const handleConfidenceSelect = (confidence: 'guessed' | 'somewhat' | 'certain') => {
    const currentMCQ = quizMCQs[currentQuizIndex] as SavedMCQ;
    if (!currentMCQ || !quizState.isSubmitted) return;

    const wasCorrect = quizState.selectedOption === quizState.currentQuestion?.correctAnswer;
    const currentSRS = {
      interval: currentMCQ.srsInterval ?? 1,
      easeFactor: currentMCQ.srsEaseFactor ?? 2.5,
      level: currentMCQ.srsLevel ?? 0,
      nextReviewAt: currentMCQ.srsNextReviewAt ?? Date.now()
    };

    const adjustment = adjustForConfidence(wasCorrect, confidence, currentSRS);

    if (adjustment.message && adjustment.shouldPenalize) {
      const allMCQs = getAllMCQs();
      const mcqIndex = allMCQs.findIndex(m => m.id === currentMCQ.id);
      if (mcqIndex !== -1) {
        setQuizState(prev => ({
          ...prev,
          srsMessage: adjustment.message
        }));
      }
    }
  };

  const handleNext = () => {
    const nextIndex = currentQuizIndex + 1;

    if (nextIndex < quizMCQs.length) {
      setCurrentQuizIndex(nextIndex);
      setQuizState(prev => ({
        ...prev,
        currentQuestion: quizMCQs[nextIndex],
        selectedOption: null,
        isSubmitted: false
      }));
      // Auto-scroll to top for next question
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const totalCorrect = quizState.history.filter(h => h.correct).length +
        (quizState.selectedOption === quizState.currentQuestion?.correctAnswer ? 1 : 0);

      const streakData = checkStreakStatus();
      const newMilestones = recordQuizCompletion(
        quizMCQs.length,
        totalCorrect,
        streakData.currentStreak
      );

      if (newMilestones.length > 0) {
        setNewMilestone(newMilestones[0]);
        triggerMascot('cheering', 'milestone');
        setShowCelebration(true);
        if ('vibrate' in navigator) navigator.vibrate([50, 100, 50, 100, 50, 100, 50]);
      } else {
        setNewMilestone(null);
        if (totalCorrect / quizMCQs.length >= 0.7) {
          setShowCelebration(true);
          if ('vibrate' in navigator) navigator.vibrate([50, 100, 50, 100, 50]);
        }
      }

      setQuizResult({ correct: totalCorrect, total: quizMCQs.length });

      // Show pending level-up if queued during sprint
      if (pendingLevelUpRef.current) {
        setTimeout(() => {
          setLevelUpInfo(pendingLevelUpRef.current);
          triggerMascot('cheering', 'levelUp');
          pendingLevelUpRef.current = null;
        }, 1500); // Delay to let quiz result appear first
      }

      // Trigger background cache refresh
      import('./services/backgroundIntelligenceService').then(({ onQuizComplete }) => {
        onQuizComplete();
      }).catch(() => { });

      // Record study session for predictive service
      const sessionTopic = quizMCQs[0]?.topic;
      if (sessionTopic) {
        import('./services/predictiveService').then(({ recordStudySession }) => {
          recordStudySession(sessionTopic, quizMCQs.length);
        }).catch(() => { });
      }
    }
  };

  return (
    <div className={`min-h-screen flex ${isDark ? 'bg-slate-950' : 'bg-gray-50'} ${isDark ? 'text-gray-100' : 'text-gray-900'} transition-colors duration-300`}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={showMobileSidebar}
        onClose={() => setShowMobileSidebar(false)}
      />
      <GlobalMascot />

      <main className="flex-1 w-full overflow-x-hidden p-4 md:p-8 pb-24 md:pb-8 bg-transparent">
        <div className="md:hidden flex items-center justify-between mb-4 px-2">
          <button
            onClick={() => setShowMobileSidebar(true)}
            className={`p-2 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-blue-600 absolute left-1/2 -translate-x-1/2">🫁 Pulmo-Master</h1>
          <div className="w-10"></div> {/* Spacer for center alignment */}
        </div>

        {activeTab === 'practice' && quizMCQs.length > 1 && (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">
              Question {currentQuizIndex + 1} of {quizMCQs.length}
            </span>
            <div className="flex-1 bg-gray-200 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${((currentQuizIndex + (quizState.isSubmitted ? 1 : 0)) / quizMCQs.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        <Suspense fallback={<div className="p-8"><Skeleton className="h-64 w-full rounded-2xl" /></div>}>
          {activeTab === 'dashboard' && (
            <Dashboard
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              onStartQuiz={handleStartQuiz}
              onStartSprint={handleStartSprint}
            />
          )}

          {activeTab === 'practice' && (
            <QuizView
              state={quizState}
              onOptionSelect={handleOptionSelect}
              onSubmit={handleSubmit}
              onNext={handleNext}
              onConfidenceSelect={handleConfidenceSelect}
              onHesitationTracked={handleHesitationTracked}
              onSimilarQuestion={async (mcq) => {
                const similar = await generateSimilarQuestion(mcq);
                if (similar) {
                  saveMCQs([similar]);
                  const newMCQs = [...quizMCQs];
                  newMCQs.splice(currentQuizIndex + 1, 0, similar);
                  setQuizMCQs(newMCQs);
                  setCurrentQuizIndex(currentQuizIndex + 1);
                  setQuizState(prev => ({
                    ...prev,
                    currentQuestion: similar,
                    selectedOption: null,
                    isSubmitted: false
                  }));
                } else {
                  alert('Could not generate a similar question. Please try again.');
                }
              }}
            />
          )}

          {activeTab === 'mcq-bank' && <MCQBank onStartPractice={handleStartQuiz} />}

          {activeTab === 'analytics' && (
            <SubTopicAnalytics onStartQuiz={(topicId) => {
              const mcqs = generateTargetedPracticeSession(topicId, 15);
              if (mcqs.length > 0) {
                handleStartQuiz(mcqs);
                setTimeout(() => {
                  triggerMascot('suggesting', 'greeting', `Here's a 15-question set to boost your score! Focus on past mistakes! 🎯`);
                }, 2600);
              } else {
                alert('No MCQs available for targeted practice yet.');
              }
            }} />
          )}

          {activeTab === 'flashcards' && (
            <div className="max-w-2xl mx-auto">
              <Flashcards onClose={() => setActiveTab('dashboard')} />
            </div>
          )}

          {activeTab === 'forecast' && (
            <TrendDashboard
              onClose={() => setActiveTab('dashboard')}
              onGenerateMCQ={(topic) => {
                const mcqs = generateTargetedPracticeSession(topic, 10);
                if (mcqs.length > 0) {
                  handleStartQuiz(mcqs);
                  setTimeout(() => {
                    triggerMascot('presenting', 'greeting', `Generating 10 high-yield questions on ${topic}... Good luck! 🍀`);
                  }, 1000);
                } else {
                  alert(`No specific questions generated for "${topic}" yet. Try the Question Bank.`);
                }
              }}
            />
          )}



          {activeTab === 'habits' && <HabitTracker />}
        </Suspense>
      </main>


      {/* Mobile Bottom Navigation - Glassmorphism Floating Bar */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 z-50">
        {/* Glassmorphism Bar */}
        <div className={`relative ${isDark ? 'bg-slate-900/70' : 'bg-white/70'} backdrop-blur-xl rounded-2xl ${isDark ? 'shadow-[0_8px_32px_rgba(0,0,0,0.4)]' : 'shadow-[0_8px_32px_rgba(0,0,0,0.12)]'} border ${isDark ? 'border-slate-700/50' : 'border-white/50'} px-2 py-2`}>
          <div className="flex items-center justify-between">

            {/* Left Nav Items */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`nav-pill ${activeTab === 'dashboard' ? 'nav-pill-active' : ''}`}
              >
                <Home className="w-5 h-5" strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} />
                {activeTab === 'dashboard' && <span className="nav-pill-label">Home</span>}
              </button>

              <button
                onClick={() => setActiveTab('mcq-bank')}
                className={`nav-pill ${activeTab === 'mcq-bank' ? 'nav-pill-active' : ''}`}
              >
                <Library className="w-5 h-5" strokeWidth={activeTab === 'mcq-bank' ? 2.5 : 2} />
                {activeTab === 'mcq-bank' && <span className="nav-pill-label">Bank</span>}
              </button>

            </div>

            {/* Center FAB */}
            <div className="relative -mt-8">
              <button
                onClick={() => setActiveTab('practice')}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 ${isDark ? 'border-slate-800/80' : 'border-white/80'} transition-all duration-300 ${activeTab === 'practice'
                  ? 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 scale-110 shadow-[0_0_24px_rgba(99,102,241,0.5)]'
                  : 'bg-gradient-to-br from-blue-500 to-indigo-600 hover:scale-105 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]'
                  }`}
              >
                <Play className="w-6 h-6 text-white ml-0.5" fill="white" strokeWidth={0} />
              </button>
              {activeTab === 'practice' && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
              )}
            </div>

            {/* Right Nav Items */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('habits')}
                className={`nav-pill ${activeTab === 'habits' ? `nav-pill-active ${isDark ? 'text-emerald-400' : 'text-emerald-600'}` : ''}`}
              >
                <CheckCircle className="w-5 h-5" strokeWidth={activeTab === 'habits' ? 2.5 : 2} />
                {activeTab === 'habits' && <span className="nav-pill-label">Habits</span>}
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`nav-pill ${activeTab === 'analytics' ? 'nav-pill-active' : ''}`}
              >
                <BarChart3 className="w-5 h-5" strokeWidth={activeTab === 'analytics' ? 2.5 : 2} />
                {activeTab === 'analytics' && <span className="nav-pill-label">Stats</span>}
              </button>
            </div>

          </div>
        </div>
      </nav>


      {/* Topic Introduction Modal */}
      {showTopicIntro && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 animate-fade-in">
          <div className={`rounded-2xl p-6 text-center shadow-2xl animate-pop max-w-sm ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-gradient-to-b from-white to-blue-50'}`}>
            <RioMascot
              state="greeting"
              size="large"
              variant="presenter"
              showBubble={true}
              bubbleText={`Let's tackle ${currentTopic}! 💪`}
            >
              <div className="mt-4">
                <p className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Get Ready!</p>
                <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Focus and take your time</p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </RioMascot>
          </div>
        </div>
      )}

      <Confetti show={showCelebration} onComplete={() => setShowCelebration(false)} />

      {/* Quiz Result Modal */}
      {quizResult && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 animate-fade-in">
          <div className={`rounded-2xl p-6 md:p-8 max-w-sm w-full shadow-2xl animate-pop ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-gradient-to-b from-white to-blue-50'}`}>
            <RioMascot
              state={quizResult.correct / quizResult.total >= 0.7 ? 'celebrating' : 'encouraging'}
              size="large"
              variant="presenter"
              showBubble={true}
              bubbleText={quizResult.correct / quizResult.total >= 0.7 ? "Great job!" : "Keep practicing!"} // Simplified for now
            >
              <div className={`rounded-xl p-5 shadow-lg border text-center mt-2 min-w-[200px] ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-blue-100'}`}>
                <h2 className={`text-lg font-bold mb-3 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Quiz Complete!</h2>
                <div className="flex items-center justify-center gap-1 mb-2">
                  <span className={`text-5xl font-black ${quizResult.correct / quizResult.total >= 0.7 ? 'text-green-500' : 'text-yellow-500'}`}>{quizResult.correct}</span>
                  <span className={`text-3xl font-bold ${isDark ? 'text-gray-500' : 'text-gray-300'}`}>/</span>
                  <span className={`text-3xl font-bold ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>{quizResult.total}</span>
                </div>
                <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{Math.round((quizResult.correct / quizResult.total) * 100)}% Accuracy</p>

                {/* Milestone announcement */}
                {newMilestone && (
                  <div className={`rounded-lg p-3 mb-4 animate-bounce-subtle ${isDark ? 'bg-purple-900/20 border border-purple-700' : 'bg-gradient-to-r from-purple-100 to-pink-100'}`}>
                    <p className={`text-xs font-bold uppercase mb-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>🎉 Milestone Unlocked!</p>
                    <p className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{newMilestone.icon} {newMilestone.name}</p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{newMilestone.description}</p>
                  </div>
                )}

                <button onClick={() => { setQuizResult(null); setNewMilestone(null); setActiveTab('dashboard'); }} className="btn-press w-full py-3 gradient-blue text-white font-bold rounded-xl shadow-glow-blue">
                  Back to Dashboard
                </button>
              </div>
            </RioMascot>
          </div>
        </div>
      )}

      {/* XP Popup - Floating notification */}
      <XPPopup
        xpGain={xpPopup.xpGain}
        coinsDrop={xpPopup.coinsDrop}
        onComplete={() => setXpPopup({ xpGain: null, coinsDrop: 0 })}
      />

      {/* Level Up Celebration */}
      {levelUpInfo && (
        <LevelUpCelebration
          levelInfo={levelUpInfo.levelInfo}
          coinsEarned={levelUpInfo.coins}
          onClose={() => setLevelUpInfo(null)}
        />
      )}

      {/* Powerup Shop */}
      <PowerupShop
        isOpen={showShop}
        onClose={() => setShowShop(false)}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <MascotProvider>
        <AppContent />
      </MascotProvider>
    </ThemeProvider>
  );
};

export default App;
