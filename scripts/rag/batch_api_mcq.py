#!/usr/bin/env python3
"""
Gemini Batch API MCQ Generator - 50% Cost Savings
Submits MCQ generation requests as a batch job (24hr processing)

Usage:
    1. Create batch job: python scripts/rag/batch_api_mcq.py create
    2. Check status: python scripts/rag/batch_api_mcq.py status
    3. Retrieve results: python scripts/rag/batch_api_mcq.py results
"""

import os
import json
import time
import random
import uuid
import sys
from pathlib import Path
from typing import List, Dict, Any

# Load environment variables
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(env_path)

from google import genai
from google.genai import types

# Configuration
API_KEY = os.getenv('GEMINI_API_KEY') or os.getenv('API_KEY')
if not API_KEY:
    print("❌ API key not found. Set GEMINI_API_KEY in .env.local")
    exit(1)

# Initialize client
client = genai.Client(api_key=API_KEY)

# Paths
DATA_DIR = Path(__file__).parent.parent.parent / 'data' / 'rag'
BATCH_DIR = DATA_DIR / 'batch'
CHUNKS_FILE = DATA_DIR / 'chunks.jsonl'
MAPPING_FILE = DATA_DIR / 'chunk_mapping.json'
TOPIC_LIST_FILE = DATA_DIR / 'topic-list.json'
REQUESTS_FILE = BATCH_DIR / 'batch_requests.jsonl'
OUTPUT_DIR = Path(__file__).parent.parent.parent / 'content' / 'generated-mcqs'

# Model configuration
MODEL = 'gemini-2.5-flash'

# Distribution targets (from NEET SS 2025)
DIFFICULTY_DISTRIBUTION = {
    'easy': 0.22,
    'moderate': 0.48,
    'difficult': 0.30
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
    """Simple keyword-based search for relevant chunks."""
    topic_lower = topic.lower()
    keywords = topic_lower.replace('-', ' ').replace('_', ' ').split()
    
    scored_chunks = []
    for chunk_id, chunk in chunks.items():
        text = chunk.get('text', '').lower()
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scored_chunks.append((score, chunk))
    
    scored_chunks.sort(key=lambda x: -x[0])
    return [c[1] for c in scored_chunks[:top_k]]


def build_mcq_prompt(topic: str, context: str, difficulty: str, exam_style: str, count: int = 3) -> str:
    """Build the MCQ generation prompt"""
    difficulty_guidance = {
        'easy': "EASY: Direct recall, definitions, basic guidelines. Single-step reasoning.",
        'moderate': "MODERATE: Clinical vignettes, 2-step reasoning, standard management protocols.",
        'difficult': "DIFFICULT: Complex scenarios, recent advances, ambiguous options, rare syndromes."
    }
    
    exam_guidance = {
        'NEET-SS': "NEET-SS: Clinical vignette → single best answer. Focus on practical application.",
        'INI-SS': "INI-SS: Can use EXCEPT format, assertion-reason, conceptual questions."
    }
    
    return f"""Generate {count} high-quality MCQs for NEET-SS/INI-SS pulmonology exam.

TOPIC: {topic}
DIFFICULTY: {difficulty} - {difficulty_guidance[difficulty]}
EXAM STYLE: {exam_style} - {exam_guidance[exam_style]}

CONTEXT:
{context[:6000]}

RULES:
1. NO giveaway hints (classic, pathognomonic, always, never)
2. ALL options must be plausible
3. Include trap analysis for wrong options

OUTPUT FORMAT (JSON array only):
[{{"question": "...", "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}}, "correctAnswer": "A", "topic": "{topic}", "deepDiveExplanation": "...", "highYieldPearl": "Rio's Take: ...", "examStyle": "{exam_style}", "difficulty": "{difficulty}", "trapAnalysis": {{"A": "...", "B": "...", "C": "...", "D": "..."}}}}]
"""


def create_batch_requests():
    """Create JSONL file with all batch requests"""
    print("📚 Loading data...")
    chunks = load_chunks()
    topic_data = load_topic_list()
    topics = topic_data.get('topics', [])
    
    print(f"   Loaded {len(chunks)} chunks, {len(topics)} topics")
    
    # Create batch directory
    BATCH_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate requests
    requests = []
    request_id = 0
    
    for topic in topics:
        topic_name = topic['name']
        topic_id = topic['id']
        mcq_count = topic['mcqCount']
        
        # Get context for topic
        relevant_chunks = search_relevant_chunks(topic_name, chunks, top_k=10)
        if not relevant_chunks:
            continue
            
        context_parts = []
        for chunk in relevant_chunks[:8]:
            context_parts.append(chunk.get('text', ''))
        context = "\n---\n".join(context_parts)
        
        primary_chunk = relevant_chunks[0]
        
        # Create requests in batches of 3 MCQs
        batch_size = 3
        num_batches = (mcq_count + batch_size - 1) // batch_size
        
        for batch_idx in range(num_batches):
            current_count = min(batch_size, mcq_count - batch_idx * batch_size)
            difficulty = get_difficulty()
            exam_style = get_exam_style()
            
            prompt = build_mcq_prompt(topic_name, context, difficulty, exam_style, current_count)
            
            # Create batch request format
            request = {
                "custom_id": f"req_{topic_id}_{batch_idx}_{request_id}",
                "request": {
                    "model": MODEL,
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 4096
                    }
                },
                "metadata": {
                    "topic_id": topic_id,
                    "topic_name": topic_name,
                    "difficulty": difficulty,
                    "exam_style": exam_style,
                    "batch_idx": batch_idx,
                    "chunk_id": primary_chunk.get('id'),
                    "source_location": {
                        "bookName": primary_chunk.get('metadata', {}).get('source', '').replace('_OCR_Complete', '').replace('.md', ''),
                        "chapter": primary_chunk.get('metadata', {}).get('chapter'),
                        "section": primary_chunk.get('metadata', {}).get('section'),
                        "pageNumber": primary_chunk.get('metadata', {}).get('pageNumber')
                    }
                }
            }
            requests.append(request)
            request_id += 1
    
    # Write JSONL file
    print(f"\n📝 Writing {len(requests)} batch requests to {REQUESTS_FILE}")
    with open(REQUESTS_FILE, 'w', encoding='utf-8') as f:
        for req in requests:
            f.write(json.dumps(req) + '\n')
    
    print(f"✅ Created batch requests file")
    print(f"   Total requests: {len(requests)}")
    print(f"   Estimated MCQs: {len(requests) * 3}")
    
    return requests


def submit_batch_job():
    """Submit the batch job to Gemini API"""
    print("\n🚀 Submitting batch job...")
    
    if not REQUESTS_FILE.exists():
        print("❌ Requests file not found. Run: python batch_api_mcq.py create")
        return
    
    # Read requests
    requests = []
    with open(REQUESTS_FILE, 'r') as f:
        for line in f:
            requests.append(json.loads(line))
    
    print(f"   Loaded {len(requests)} requests")
    
    # Convert to batch format - use simple dict format (contents only)
    batch_requests = []
    for req in requests:
        batch_requests.append({
            'contents': req['request']['contents']
        })
    
    # Submit batch job
    try:
        print(f"   Submitting {len(batch_requests)} requests to Gemini Batch API...")
        
        batch_job = client.batches.create(
            model=MODEL,
            src=batch_requests
        )
        
        print(f"✅ Batch job submitted!")
        print(f"   Job name: {batch_job.name}")
        print(f"   Status: {batch_job.state}")
        
        # Save job info
        job_info = {
            'name': batch_job.name,
            'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'request_count': len(batch_requests),
            'requests_file': str(REQUESTS_FILE)
        }
        with open(BATCH_DIR / 'current_job.json', 'w') as f:
            json.dump(job_info, f, indent=2)
        
        print(f"\n📝 To check status: python scripts/rag/batch_api_mcq.py status")
        print(f"📥 To get results: python scripts/rag/batch_api_mcq.py results")
        
        return batch_job
        
    except Exception as e:
        print(f"❌ Error submitting batch: {e}")
        return None


def check_batch_status():
    """Check status of current batch job"""
    job_file = BATCH_DIR / 'current_job.json'
    if not job_file.exists():
        print("❌ No active batch job found")
        return
    
    with open(job_file, 'r') as f:
        job_info = json.load(f)
    
    job_name = job_info['name']
    print(f"📊 Checking batch job: {job_name}")
    
    try:
        batch_job = client.batches.get(name=job_name)
        print(f"   State: {batch_job.state}")
        return batch_job
    except Exception as e:
        print(f"❌ Error checking status: {e}")


def retrieve_results():
    """Retrieve and process batch results"""
    job_file = BATCH_DIR / 'current_job.json'
    if not job_file.exists():
        print("❌ No active batch job found")
        return
    
    with open(job_file, 'r') as f:
        job_info = json.load(f)
    
    job_name = job_info['name']
    print(f"📥 Retrieving results for: {job_name}")
    
    try:
        batch_job = client.batches.get(name=job_name)
        
        if batch_job.state != 'JOB_STATE_SUCCEEDED':
            print(f"   Job not complete. State: {batch_job.state}")
            return
        
        # Process results
        print("   Processing results...")
        # Results would be in batch_job.response_file
        
    except Exception as e:
        print(f"❌ Error retrieving results: {e}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python batch_api_mcq.py [create|submit|status|results]")
        return
    
    command = sys.argv[1]
    
    if command == 'create':
        create_batch_requests()
    elif command == 'submit':
        create_batch_requests()
        submit_batch_job()
    elif command == 'status':
        check_batch_status()
    elif command == 'results':
        retrieve_results()
    else:
        print(f"Unknown command: {command}")


if __name__ == '__main__':
    main()
