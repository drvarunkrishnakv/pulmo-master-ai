
import { GoogleGenAI, Type } from "@google/genai";
import { MCQ, Chunk, SavedMCQ } from "../types";
import { SYSTEM_INSTRUCTION, CHUNK_MCQ_INSTRUCTION } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// Using Gemini 2.5 Flash Lite with billing enabled
const MODEL = "gemini-2.5-flash-lite";

const mcqSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    topic: { type: Type.STRING },
    question: { type: Type.STRING },
    options: {
      type: Type.OBJECT,
      properties: {
        A: { type: Type.STRING },
        B: { type: Type.STRING },
        C: { type: Type.STRING },
        D: { type: Type.STRING },
      },
      required: ["A", "B", "C", "D"]
    },
    correctAnswer: { type: Type.STRING },
    deepDiveExplanation: { type: Type.STRING },
    highYieldPearl: { type: Type.STRING },
    trapAnalysis: {
      type: Type.OBJECT,
      properties: {
        A: { type: Type.STRING },
        B: { type: Type.STRING },
        C: { type: Type.STRING },
        D: { type: Type.STRING },
      },
      description: "Map of wrong options (A/B/C/D) to a short 1-sentence explanation of why a student might incorrectly pick it (common trap). Correct answer key should not be present or can be empty."
    }
  },
  required: ["id", "topic", "question", "options", "correctAnswer", "deepDiveExplanation", "highYieldPearl"]
};

/**
 * Generate a single MCQ from a domain (legacy support)
 */
export const generateMCQ = async (domain: string): Promise<MCQ> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Generate one high-yield NEET-SS standard MCQ for the domain: ${domain}. Ensure it is a complex clinical vignette.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: mcqSchema
      },
    });

    const data = JSON.parse(response.text);
    return data as MCQ;
  } catch (error) {
    console.error("Error generating MCQ:", error);
    throw error;
  }
};

/**
 * Generate multiple MCQs from a content chunk
 */
export const generateMCQsFromChunk = async (
  chunk: Chunk,
  bookName: string,
  count: number = 5
): Promise<SavedMCQ[]> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Based on the following medical content from "${bookName}" (section: ${chunk.sectionTitle}), generate ${count} high-yield NEET-SS/INI-SS standard MCQs.

CONTENT:
${chunk.content}

Generate exactly ${count} MCQs that test deep understanding of this content.`,
      config: {
        systemInstruction: CHUNK_MCQ_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: mcqSchema
        }
      },
    });

    const mcqs: MCQ[] = JSON.parse(response.text);

    // Convert to SavedMCQ format with source reference
    const savedMCQs: SavedMCQ[] = mcqs.map(mcq => ({
      ...mcq,
      topic: bookName,
      bookId: chunk.bookId,
      chunkId: chunk.id,
      generatedAt: Date.now(),
      timesAttempted: 0,
      correctAttempts: 0,
      sourceSection: chunk.sectionTitle, // Add source reference
    }));

    return savedMCQs;
  } catch (error) {
    console.error("Error generating MCQs from chunk:", error);
    throw error;
  }
};

/**
 * Generate a quiz from multiple chunks
 */
export const generateQuizFromChunks = async (
  chunks: Chunk[],
  bookName: string,
  mcqsPerChunk: number = 3
): Promise<SavedMCQ[]> => {
  const allMCQs: SavedMCQ[] = [];

  for (const chunk of chunks) {
    try {
      const mcqs = await generateMCQsFromChunk(chunk, bookName, mcqsPerChunk);
      allMCQs.push(...mcqs);
    } catch (err) {
      console.error(`Failed to generate MCQs for chunk ${chunk.id}:`, err);
      // Continue with other chunks even if one fails
    }
  }

  return allMCQs;
};

/**
 * Extract headings from markdown content
 */
export const extractHeadings = (content: string): { level: number; text: string; lineIndex: number }[] => {
  const lines = content.split('\n');
  const headings: { level: number; text: string; lineIndex: number }[] = [];

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        lineIndex: index
      });
    }
  });

  return headings;
};

/**
 * Use AI to suggest sub-topics from headings
 */
export const suggestSubTopics = async (
  headings: { level: number; text: string }[],
  bookName: string
): Promise<{ name: string; headingIndices: number[] }[]> => {
  try {
    const headingsList = headings.map((h, i) => `${i}. ${'#'.repeat(h.level)} ${h.text}`).join('\n');

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `You are organizing a medical textbook for NEET-SS/INI-SS exam preparation.

Book: "${bookName}"

Below are the section headings extracted from this book. Group them into 8-15 logical exam-relevant sub-topics.

HEADINGS:
${headingsList}

Group these headings into logical sub-topics that would be useful for tracking exam preparation progress. Each sub-topic should be a testable unit for exams.

Return a JSON array where each item has:
- "name": A concise sub-topic name (e.g., "Community-Acquired Pneumonia", "Severity Assessment & Scoring", "Treatment Guidelines")
- "headingIndices": Array of heading indices (the numbers at the start of each line) that belong to this sub-topic

Important:
- Every heading should be assigned to exactly one sub-topic
- Create meaningful clinical/exam-relevant groupings
- Use 8-15 sub-topics total
- Sub-topic names should be brief but descriptive`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              headingIndices: { type: Type.ARRAY, items: { type: Type.NUMBER } }
            },
            required: ["name", "headingIndices"]
          }
        }
      },
    });

    const suggestions = JSON.parse(response.text);
    return suggestions;
  } catch (error) {
    console.error("Error suggesting sub-topics:", error);
    // Fallback: create a single "General" sub-topic
    return [{
      name: "General",
      headingIndices: headings.map((_, i) => i)
    }];
  }
};

/**
 * Generate similar questions based on an existing MCQ
 */
export const generateSimilarQuestion = async (
  originalMCQ: SavedMCQ
): Promise<SavedMCQ | null> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Generate a similar NEET-SS level MCQ based on this question but with different clinical details:

ORIGINAL QUESTION:
${originalMCQ.question}

ORIGINAL OPTIONS:
A: ${originalMCQ.options.A}
B: ${originalMCQ.options.B}
C: ${originalMCQ.options.C}
D: ${originalMCQ.options.D}

CORRECT ANSWER: ${originalMCQ.correctAnswer}

TOPIC: ${originalMCQ.topic}

Generate a NEW question that tests the same core concept but with:
- Different patient demographics/presentation
- Different clinical scenario
- Fresh wording

The question should be equally challenging.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: mcqSchema
      },
    });

    const newMCQ: MCQ = JSON.parse(response.text);

    return {
      ...newMCQ,
      topic: originalMCQ.topic,
      bookId: originalMCQ.bookId,
      chunkId: originalMCQ.chunkId,
      generatedAt: Date.now(),
      timesAttempted: 0,
      correctAttempts: 0,
      sourceSection: originalMCQ.sourceSection,
    };
  } catch (error) {
    console.error("Error generating similar question:", error);
    return null;
  }
};

/**
 * Generate a concise topic explanation for "Teach Me This Topic" feature
 * Tailored for MD Pulmonology NEET-SS/INI-SS preparation
 */
export const generateTopicExplanation = async (
  question: string,
  correctAnswer: string,
  correctOptionText: string,
  topic: string
): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `You are a Pulmonology super-specialty exam coach helping an MD Pulmonologist prepare for NEET-SS/INI-SS.

A student got this question WRONG. Help them understand the concept quickly.

QUESTION: ${question}

CORRECT ANSWER: ${correctAnswer}) ${correctOptionText}

TOPIC: ${topic}

Provide a CONCISE explanation (max 100 words) covering:
1. WHY the correct answer is right (key concept)
2. Common misconception that leads to wrong answers
3. One high-yield clinical pearl to remember

Format: Use plain text, no markdown headers. Be direct and exam-focused.`,
      config: {
        responseMimeType: "text/plain"
      },
    });

    return response.text || "Unable to generate explanation. Please refer to the deep dive section.";
  } catch (error) {
    console.error("Error generating topic explanation:", error);
    return "Unable to generate explanation. Please refer to the deep dive section.";
  }
};

/**
 * Start a Socratic tutoring chat session
 */

