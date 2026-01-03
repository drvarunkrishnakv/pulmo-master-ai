
export enum PulmonaryDomain {
  COPD = 'COPD & Obstructive Airway Disease',
  ASTHMA = 'Bronchial Asthma',
  ILD = 'Interstitial Lung Diseases (ILD)',
  PH = 'Pulmonary Hypertension',
  CRITICAL_CARE = 'Critical Care & Mechanical Ventilation',
  SLEEP = 'Sleep-Disordered Breathing',
  LUNG_CANCER = 'Thoracic Oncology & Lung Cancer',
  INFECTIONS = 'Infectious Diseases (Pneumonia/TB)',
  PLEURAL = 'Pleural & Mediastinal Diseases',
  PFT = 'Pulmonary Function Testing & Imaging'
}

// Book system types
export interface SubTopic {
  id: string;
  name: string;
  chunkIds?: string[];
  chunkIndices?: number[];
}

export interface Book {
  id: string;
  name: string;
  uploadedAt: number;
  totalChunks: number;
  totalCharacters: number;
  subTopics?: SubTopic[];
}

export interface Chunk {
  id: string;
  bookId: string;
  sectionTitle: string;
  content: string;
  wordCount: number;
  index: number;
  subTopicId?: string;
}

export interface MCQ {
  id: string;
  topic: string; // Can be PulmonaryDomain or book name
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  deepDiveExplanation: string;
  highYieldPearl: string;
  trapAnalysis?: {
    [key: string]: string; // "A": "Explanation", "B": "Explanation"
  };
  // Visual Pattern Intelligence (IBQ Support)
  imageDescription?: string;   // Vivid text description of radiological finding
  externalImageUrl?: string;   // URL to external image (will be proxied)
}

export interface SavedMCQ extends MCQ {
  bookId: string;
  chunkId: string;
  generatedAt: number;
  timesAttempted: number;
  lastAttemptedAt?: number;
  correctAttempts: number;
  subTopicId?: string;
  subTopicName?: string;
  sourceSection?: string; // The section title this MCQ was generated from
  isBundled?: boolean; // True if pre-generated, false/undefined if user-generated

  // SRS fields (invisible spaced repetition)
  srsInterval?: number; // Days until next review (starts at 1)
  srsEaseFactor?: number; // Difficulty multiplier (starts at 2.5)
  srsNextReviewAt?: number; // Timestamp when this question is due
  srsLevel?: number; // Learning level: 0=new, 1=learning, 2+=reviewing

  // Memory Intelligence fields
  memoryStrength?: number; // 0-10 scale, higher = harder to forget
  predictedRetention?: number; // 0-1, probability of remembering
  lastHesitationMs?: number; // Normalized hesitation on last attempt
  difficultyScore?: number; // Estimated difficulty 1-5
  correctStreak?: number; // Consecutive correct answers

  // Time Tracking (for time-per-question analytics)
  avgAnswerTimeMs?: number; // Running average of answer times
  answerTimesMs?: number[]; // Last 5 answer times for trend analysis

  // Mistake Pattern Tracking (for confusion analysis)
  wrongOptionHistory?: ('A' | 'B' | 'C' | 'D')[]; // Last 10 wrong options selected

  // Source Location (from RAG chunks)
  sourceLocation?: {
    bookName?: string;
    pageNumber?: number;
    chapter?: string;
    section?: string;
  };

  // Exam Style and Difficulty (for NEET-SS/INI-SS)
  examStyle?: 'NEET-SS' | 'INI-SS';
  difficulty?: 'easy' | 'moderate' | 'difficult';

  // Trap Analysis (why each wrong option is wrong)
  // Trap Analysis (why each wrong option is wrong)
  trapAnalysis?: {
    A?: string;
    B?: string;
    C?: string;
    D?: string;
  };

  // Special Flags
  isOneLiner?: boolean;
}

export interface UserPerformance {
  domain: PulmonaryDomain;
  correct: number;
  total: number;
}

export interface QuizState {
  currentQuestion: MCQ | null;
  selectedOption: 'A' | 'B' | 'C' | 'D' | null;
  isSubmitted: boolean;
  isLoading: boolean;
  history: { questionId: string; correct: boolean; domain: string }[];
  srsMessage?: string; // Friendly message like "See you in 3 days"
  isSprintMode?: boolean; // True if in 5-min sprint mode
  sprintStartTime?: number; // Timestamp when sprint started
  sprintDurationMinutes?: number; // Duration in minutes (1, 3, 5, 7)
}

// RAG System Types
export interface RAGChunk {
  id: string;
  text: string;
  metadata: {
    source: string;      // Filename
    topic: string;       // Section heading
    source_type: 'notes' | 'textbook';
    heading_level: number;
    // Source location
    pageNumber?: number;
    chapter?: string;
    section?: string;
  };
}

export interface RAGResult {
  chunk: RAGChunk;
  score: number;
}

