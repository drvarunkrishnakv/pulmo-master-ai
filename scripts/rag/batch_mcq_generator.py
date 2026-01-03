#!/usr/bin/env python3
"""
Batch MCQ Generator using Gemini 2.5 Flash
Generates NEET-SS and INI-SS style questions with difficulty levels

Usage:
    source .venv/bin/activate
    python scripts/rag/batch_mcq_generator.py
"""

import os
import json
import time
import random
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

# Load environment variables
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(env_path)

from google import genai
from google.genai.types import GenerateContentConfig

# Configuration
API_KEY = os.getenv('GEMINI_API_KEY') or os.getenv('API_KEY')
if not API_KEY:
    print("❌ API key not found. Set GEMINI_API_KEY in .env.local")
    exit(1)

# Initialize client
client = genai.Client(api_key=API_KEY)

# Paths
DATA_DIR = Path(__file__).parent.parent.parent / 'data' / 'rag'
CHUNKS_FILE = DATA_DIR / 'chunks.jsonl'
EMBEDDINGS_FILE = DATA_DIR / 'embeddings.json'
MAPPING_FILE = DATA_DIR / 'chunk_mapping.json'
TOPIC_LIST_FILE = DATA_DIR / 'topic-list.json'
OUTPUT_DIR = Path(__file__).parent.parent.parent / 'content' / 'generated-mcqs'

# Model configuration
MODEL = 'gemini-2.5-flash'
RATE_LIMIT_DELAY = 1.0  # seconds between API calls

# Distribution targets (from NEET SS 2025)
DIFFICULTY_DISTRIBUTION = {
    'easy': 0.22,      # 20-25%
    'moderate': 0.48,  # 45-50%
    'difficult': 0.30  # 25-30%
}

EXAM_STYLE_DISTRIBUTION = {
    'NEET-SS': 0.60,
    'INI-SS': 0.40
}


def load_chunks() -> Dict[str, Dict]:
    """Load chunk mapping for RAG context"""
    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        chunks = json.load(f)
    return {c['id']: c for c in chunks}


def load_topic_list() -> Dict:
    """Load topic list with MCQ counts"""
    with open(TOPIC_LIST_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_difficulty() -> str:
    """Randomly select difficulty based on distribution"""
    r = random.random()
    cumulative = 0
    for diff, prob in DIFFICULTY_DISTRIBUTION.items():
        cumulative += prob
        if r < cumulative:
            return diff
    return 'moderate'


def get_exam_style() -> str:
    """Randomly select exam style based on distribution"""
    return 'NEET-SS' if random.random() < EXAM_STYLE_DISTRIBUTION['NEET-SS'] else 'INI-SS'


def search_relevant_chunks(topic: str, chunks: Dict[str, Dict], top_k: int = 10) -> List[Dict]:
    """
    Simple keyword-based search for relevant chunks.
    In production, you'd use the vector index for semantic search.
    """
    topic_lower = topic.lower()
    keywords = topic_lower.replace('-', ' ').replace('_', ' ').split()
    
    scored_chunks = []
    for chunk_id, chunk in chunks.items():
        text = chunk.get('text', '').lower()
        metadata = chunk.get('metadata', {})
        
        # Score based on keyword matches
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scored_chunks.append((score, chunk))
    
    # Sort by score and return top_k
    scored_chunks.sort(key=lambda x: -x[0])
    return [c[1] for c in scored_chunks[:top_k]]


def build_mcq_prompt(topic: str, context: str, difficulty: str, exam_style: str, count: int = 5) -> str:
    """Build the enhanced MCQ generation prompt"""
    
    difficulty_guidance = {
        'easy': """
EASY/DIRECT QUESTIONS (20-25% of exam):
- Direct recall of facts, definitions, standard guidelines
- Single-step reasoning
- Clear, unambiguous answers
Example: "What is the first-line treatment for CAP in outpatients?"
""",
        'moderate': """
MODERATE QUESTIONS (45-50% of exam):
- Clinical vignettes requiring 2-step reasoning
- Standard management protocols applied to scenarios
- Multi-step diagnosis with clear clinical presentation
Example: "A 65-year-old diabetic presents with productive cough, fever 39°C, and CXR showing right lower lobe consolidation. Most appropriate empirical therapy?"
""",
        'difficult': """
DIFFICULT QUESTIONS (25-30% of exam):
- Complex case vignettes with multiple variables
- Recent advances and updated guidelines
- Ambiguous options requiring careful elimination
- Rare syndromes or atypical presentations
Example: "An immunocompromised patient develops pneumonia not responding to broad-spectrum antibiotics. BAL shows branching hyphae. Which investigation provides the MOST SPECIFIC diagnosis?"
"""
    }
    
    exam_style_guidance = {
        'NEET-SS': """
NEET-SS STYLE:
- Clinical vignette leading to single best answer
- Focus on management protocols and practical application
- Options should be plausible but only one is clearly best
- Avoid "All of the above" or "None of the above"
""",
        'INI-SS': """
INI-SS STYLE:
- Can use "All of the following EXCEPT" format
- May include assertion-reason questions
- Emphasize basic science integration with clinical correlates
- May test recent advances and newer research
- Tricky wording requiring careful reading
"""
    }
    
    return f"""You are a senior medical educator creating questions for NEET-SS/INI-SS pulmonology examination.

TOPIC: {topic}
DIFFICULTY: {difficulty}
EXAM STYLE: {exam_style}
QUESTIONS TO GENERATE: {count}

{difficulty_guidance[difficulty]}

{exam_style_guidance[exam_style]}

CONTEXT FROM TEXTBOOKS:
{context[:8000]}

=== CRITICAL RULES ===
1. NO GIVEAWAY HINTS: Avoid words like "classic", "pathognomonic", "hallmark", "always", "never"
2. PLAUSIBLE DISTRACTORS: ALL 4 options must be clinically reasonable for the scenario
3. EQUAL LENGTH OPTIONS: All options should be similar in length (no length clues)
4. NO GRAMMATICAL HINTS: Options should not have a/an mismatches with the question
5. TRAP ANALYSIS: Include why each WRONG option is incorrect (common misconceptions)
6. SOURCE TRACKING: Reference the source from context when possible

=== OUTPUT FORMAT (STRICT JSON ARRAY) ===
Generate exactly {count} MCQs as a JSON array:
```json
[
  {{
    "question": "Clinical vignette or direct question text",
    "options": {{
      "A": "First option",
      "B": "Second option", 
      "C": "Third option",
      "D": "Fourth option"
    }},
    "correctAnswer": "A",
    "topic": "{topic}",
    "deepDiveExplanation": "Detailed explanation of why the correct answer is right and the clinical reasoning",
    "highYieldPearl": "Rio's Take: A memorable exam hook or mnemonic (1-2 sentences)",
    "examStyle": "{exam_style}",
    "difficulty": "{difficulty}",
    "trapAnalysis": {{
      "A": "Why this is correct (if correct) or why students might wrongly choose this",
      "B": "Why this option is wrong / common misconception",
      "C": "Why this option is wrong / what it actually indicates",
      "D": "Why this option is wrong / when it would be correct instead"
    }}
  }}
]
```

Generate {count} high-quality MCQs following the exact format above. Output ONLY the JSON array, no other text.
"""


def parse_mcq_response(response_text: str, topic: str, source_chunk: Optional[Dict] = None) -> List[Dict]:
    """Parse the MCQ response and add metadata"""
    try:
        # Extract JSON from response
        text = response_text.strip()
        if text.startswith('```json'):
            text = text[7:]
        if text.startswith('```'):
            text = text[3:]
        if text.endswith('```'):
            text = text[:-3]
        
        mcqs = json.loads(text.strip())
        
        if not isinstance(mcqs, list):
            mcqs = [mcqs]
        
        processed = []
        for mcq in mcqs:
            # Generate unique ID
            mcq_id = f"rag_{topic.replace(' ', '_').lower()}_{uuid.uuid4().hex[:8]}"
            
            # Build source location from chunk
            source_location = {}
            if source_chunk:
                metadata = source_chunk.get('metadata', {})
                source_location = {
                    'bookName': metadata.get('source', '').replace('_OCR_Complete', '').replace('.md', ''),
                    'chapter': metadata.get('chapter'),
                    'section': metadata.get('section'),
                    'pageNumber': metadata.get('pageNumber')
                }
            
            processed_mcq = {
                'id': mcq_id,
                'question': mcq.get('question', ''),
                'options': mcq.get('options', {}),
                'correctAnswer': mcq.get('correctAnswer', 'A'),
                'topic': mcq.get('topic', topic),
                'deepDiveExplanation': mcq.get('deepDiveExplanation', ''),
                'highYieldPearl': mcq.get('highYieldPearl', ''),
                'examStyle': mcq.get('examStyle', 'NEET-SS'),
                'difficulty': mcq.get('difficulty', 'moderate'),
                'trapAnalysis': mcq.get('trapAnalysis', {}),
                'sourceLocation': source_location,
                'bookId': source_location.get('bookName', 'rag'),
                'chunkId': source_chunk['id'] if source_chunk else 'unknown',
                'generatedAt': int(time.time() * 1000),
                'timesAttempted': 0,
                'correctAttempts': 0,
                'isBundled': True
            }
            processed.append(processed_mcq)
        
        return processed
    except json.JSONDecodeError as e:
        print(f"    ⚠️ JSON parse error: {e}")
        return []


def generate_mcqs_for_topic(
    topic_name: str, 
    mcq_count: int, 
    chunks: Dict[str, Dict]
) -> List[Dict]:
    """Generate MCQs for a single topic"""
    all_mcqs = []
    
    # Get relevant chunks for context
    relevant_chunks = search_relevant_chunks(topic_name, chunks, top_k=15)
    
    if not relevant_chunks:
        print(f"    ⚠️ No relevant chunks found for {topic_name}")
        return []
    
    # Build context from chunks
    context_parts = []
    for chunk in relevant_chunks[:10]:
        chunk_text = chunk.get('text', '')
        metadata = chunk.get('metadata', {})
        source = metadata.get('source', 'Unknown')
        page = metadata.get('pageNumber', '')
        
        context_parts.append(f"[Source: {source}, Page: {page}]\n{chunk_text}")
    
    context = "\n\n---\n\n".join(context_parts)
    primary_chunk = relevant_chunks[0] if relevant_chunks else None
    
    # Generate in batches of 5
    batch_size = 5
    remaining = mcq_count
    
    while remaining > 0:
        current_batch = min(batch_size, remaining)
        difficulty = get_difficulty()
        exam_style = get_exam_style()
        
        prompt = build_mcq_prompt(topic_name, context, difficulty, exam_style, current_batch)
        
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=8192
                )
            )
            
            if response.text:
                mcqs = parse_mcq_response(response.text, topic_name, primary_chunk)
                all_mcqs.extend(mcqs)
                remaining -= len(mcqs)
                print(f"      ✓ Generated {len(mcqs)} MCQs ({difficulty}/{exam_style})")
            else:
                print(f"      ⚠️ Empty response")
                remaining -= current_batch  # Skip this batch
                
        except Exception as e:
            print(f"      ✗ Error: {e}")
            remaining -= current_batch  # Skip this batch
        
        time.sleep(RATE_LIMIT_DELAY)
    
    return all_mcqs


def main():
    print("🎓 Batch MCQ Generator (NEET-SS/INI-SS Style)\n")
    print(f"   Model: {MODEL}")
    print(f"   Difficulty: Easy {DIFFICULTY_DISTRIBUTION['easy']*100:.0f}% / Moderate {DIFFICULTY_DISTRIBUTION['moderate']*100:.0f}% / Difficult {DIFFICULTY_DISTRIBUTION['difficult']*100:.0f}%")
    print(f"   Exam Style: NEET-SS {EXAM_STYLE_DISTRIBUTION['NEET-SS']*100:.0f}% / INI-SS {EXAM_STYLE_DISTRIBUTION['INI-SS']*100:.0f}%\n")
    
    # Load data
    print("📚 Loading chunks and topic list...")
    chunks = load_chunks()
    topic_data = load_topic_list()
    topics = topic_data.get('topics', [])
    
    print(f"   Loaded {len(chunks)} chunks")
    print(f"   Loaded {len(topics)} topics")
    
    total_target = sum(t['mcqCount'] for t in topics)
    print(f"   Target MCQs: {total_target}\n")
    
    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate MCQs for each topic
    all_mcqs = []
    start_time = time.time()
    
    for i, topic in enumerate(topics):
        topic_name = topic['name']
        topic_id = topic['id']
        mcq_count = topic['mcqCount']
        priority = topic.get('priority', 'medium')
        
        print(f"\n📖 [{i+1}/{len(topics)}] {topic_name}")
        print(f"   Target: {mcq_count} MCQs | Priority: {priority}")
        
        mcqs = generate_mcqs_for_topic(topic_name, mcq_count, chunks)
        
        if mcqs:
            all_mcqs.extend(mcqs)
            print(f"   ✅ Generated {len(mcqs)} MCQs")
            
            # Save per-topic file
            topic_file = OUTPUT_DIR / f"{topic_id}.json"
            with open(topic_file, 'w', encoding='utf-8') as f:
                json.dump(mcqs, f, indent=2)
    
    elapsed = time.time() - start_time
    
    # Generate index file
    print("\n💾 Generating index...")
    index = {
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'totalMCQs': len(all_mcqs),
        'topics': [t['id'] for t in topics],
        'model': MODEL,
        'distribution': {
            'difficulty': DIFFICULTY_DISTRIBUTION,
            'examStyle': EXAM_STYLE_DISTRIBUTION
        }
    }
    
    with open(OUTPUT_DIR / 'index.json', 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2)
    
    print(f"\n✅ Generation Complete!")
    print(f"   Total MCQs: {len(all_mcqs)}")
    print(f"   Time: {elapsed/60:.1f} minutes")
    print(f"   Output: {OUTPUT_DIR}")


if __name__ == '__main__':
    main()
