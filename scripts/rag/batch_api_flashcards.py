#!/usr/bin/env python3
"""
Gemini Batch API Flashcard Generator - 50% Cost Savings
Submits flashcard generation requests as a batch job (async processing)

Usage:
    1. Create batch job: python scripts/rag/batch_api_flashcards.py create
    2. Submit job: python scripts/rag/batch_api_flashcards.py submit
    3. Check status: python scripts/rag/batch_api_flashcards.py status
    4. Retrieve results: python scripts/rag/batch_api_flashcards.py results
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
BATCH_DIR = DATA_DIR / 'batch-flashcards'
CHUNKS_FILE = DATA_DIR / 'chunks.jsonl'
MAPPING_FILE = DATA_DIR / 'chunk_mapping.json'
TOPIC_LIST_FILE = DATA_DIR / 'topic-list.json'
REQUESTS_FILE = BATCH_DIR / 'flashcard_requests.jsonl'
OUTPUT_DIR = Path(__file__).parent.parent.parent / 'content' / 'generated-flashcards'

# Model configuration
MODEL = 'gemini-2.5-flash'

# Weighted flashcard distribution per topic priority
# Target: ~1,500 total flashcards
FLASHCARD_COUNTS = {
    'high': 22,      # 42 topics × 22 = 924
    'medium': 11,    # 42 topics × 11 = 462
    'low': 7         # 16 topics × 7 = 112
}                    # Total: ~1,498


def load_chunks() -> Dict[str, Dict]:
    """Load chunk mapping for RAG context"""
    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        chunks = json.load(f)
    return {c['id']: c for c in chunks}


def load_topic_list() -> Dict:
    """Load topic list with priorities"""
    with open(TOPIC_LIST_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_flashcard_count(priority: str) -> int:
    """Get flashcard count based on topic priority"""
    return FLASHCARD_COUNTS.get(priority, 11)


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


def build_flashcard_prompt(topic: str, context: str, count: int = 5) -> str:
    """Build the flashcard generation prompt - Anki-style (short & crisp)"""
    return f"""Generate {count} SHORT flashcards for pulmonology exam prep.

TOPIC: {topic}

CONTEXT:
{context[:5000]}

STRICT RULES:
1. FRONT: Max 8 words. Just the question/term. No full sentences.
2. BACK: Max 15 words. Numbers, lists, or 1-line answers only.
3. Style: Like Anki cards - instant recall, no explanations.

GOOD EXAMPLES:
- Front: "mPAP threshold for PH?" → Back: "≥20 mmHg at rest"  
- Front: "First-line ATT regimen?" → Back: "2HRZE + 4HR (DOTS Cat I)"
- Front: "Mantoux positive = ?" → Back: ">10mm induration at 48-72h"
- Front: "TB cavity - typical lobe?" → Back: "Upper lobe posterior segment"
- Front: "ADA cutoff for TB effusion?" → Back: "40-45 U/L"
- Front: "Light's criteria - exudate?" → Back: "Protein >0.5, LDH >0.6, LDH >⅔ ULN"

BAD EXAMPLES (too long - DO NOT generate like this):
- Front: "What is the first-line treatment regimen for pulmonary tuberculosis?"
- Back: "The first-line treatment consists of isoniazid, rifampicin, pyrazinamide..."

OUTPUT FORMAT (JSON array only, no markdown):
[{{"front": "...", "back": "...", "difficulty": "easy|moderate|hard"}}]

Generate exactly {count} flashcards:"""


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
    total_flashcards = 0
    
    for topic in topics:
        topic_name = topic['name']
        topic_id = topic['id']
        priority = topic.get('priority', 'medium')
        flashcard_count = get_flashcard_count(priority)
        total_flashcards += flashcard_count
        
        # Get context for topic
        relevant_chunks = search_relevant_chunks(topic_name, chunks, top_k=10)
        if not relevant_chunks:
            print(f"   ⚠️ No chunks found for: {topic_name}")
            continue
            
        context_parts = []
        for chunk in relevant_chunks[:8]:
            context_parts.append(chunk.get('text', ''))
        context = "\n---\n".join(context_parts)
        
        primary_chunk = relevant_chunks[0]
        
        # Create requests in batches of 5 flashcards
        batch_size = 5
        num_batches = (flashcard_count + batch_size - 1) // batch_size
        
        for batch_idx in range(num_batches):
            current_count = min(batch_size, flashcard_count - batch_idx * batch_size)
            
            prompt = build_flashcard_prompt(topic_name, context, current_count)
            
            # Create batch request format
            request = {
                "custom_id": f"fc_{topic_id}_{batch_idx}_{request_id}",
                "request": {
                    "model": MODEL,
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                },
                "metadata": {
                    "topic_id": topic_id,
                    "topic_name": topic_name,
                    "priority": priority,
                    "batch_idx": batch_idx,
                    "expected_count": current_count,
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
    print(f"   Estimated flashcards: {total_flashcards}")
    
    # Save metadata
    metadata = {
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'total_requests': len(requests),
        'estimated_flashcards': total_flashcards,
        'distribution': FLASHCARD_COUNTS
    }
    with open(BATCH_DIR / 'batch_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    return requests


def submit_batch_job():
    """Submit the batch job to Gemini API"""
    print("\n🚀 Submitting batch job...")
    
    if not REQUESTS_FILE.exists():
        print("❌ Requests file not found. Run: python batch_api_flashcards.py create")
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
        
        print(f"\n📝 To check status: python scripts/rag/batch_api_flashcards.py status")
        print(f"📥 To get results: python scripts/rag/batch_api_flashcards.py results")
        
        return batch_job
        
    except Exception as e:
        print(f"❌ Error submitting batch: {e}")
        import traceback
        traceback.print_exc()
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
        
        if hasattr(batch_job, 'succeeded_count'):
            print(f"   Succeeded: {batch_job.succeeded_count}")
        if hasattr(batch_job, 'failed_count'):
            print(f"   Failed: {batch_job.failed_count}")
            
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
    
    # Load original requests for metadata
    requests_metadata = {}
    with open(REQUESTS_FILE, 'r') as f:
        for i, line in enumerate(f):
            req = json.loads(line)
            requests_metadata[i] = req.get('metadata', {})
    
    try:
        batch_job = client.batches.get(name=job_name)
        
        if str(batch_job.state) != 'JobState.JOB_STATE_SUCCEEDED':
            print(f"   Job not complete. State: {batch_job.state}")
            return
        
        # Process results
        print("   Processing results...")
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        
        # Group flashcards by topic
        topic_flashcards = {}
        total_flashcards = 0
        errors = 0
        
        for i, response in enumerate(batch_job.dest.inlined_responses):
            metadata = requests_metadata.get(i, {})
            topic_id = metadata.get('topic_id', 'unknown')
            topic_name = metadata.get('topic_name', 'Unknown')
            source_location = metadata.get('source_location', {})
            
            if topic_id not in topic_flashcards:
                topic_flashcards[topic_id] = {
                    'topic_name': topic_name,
                    'flashcards': []
                }
            
            try:
                text = response.response.candidates[0].content.parts[0].text
                # Clean JSON
                text = text.strip()
                if text.startswith('```json'):
                    text = text[7:]
                if text.startswith('```'):
                    text = text[3:]
                if text.endswith('```'):
                    text = text[:-3]
                text = text.strip()
                
                flashcards = json.loads(text)
                
                for fc in flashcards:
                    flashcard_id = f"fc_{topic_id}_{uuid.uuid4().hex[:8]}"
                    processed = {
                        'id': flashcard_id,
                        'front': fc.get('front', ''),
                        'back': fc.get('back', ''),
                        'difficulty': fc.get('difficulty', 'moderate'),
                        'cardType': fc.get('cardType', 'definition'),
                        'conceptTags': fc.get('conceptTags', []),
                        'topic': topic_name,
                        'bookId': topic_id,
                        'sourceSection': source_location.get('section', topic_name),
                        'sourceLocation': source_location
                    }
                    topic_flashcards[topic_id]['flashcards'].append(processed)
                    total_flashcards += 1
                    
            except Exception as e:
                errors += 1
                print(f"   ⚠️ Error parsing response {i}: {e}")
        
        # Save flashcards by topic
        print(f"\n💾 Saving flashcards to {OUTPUT_DIR}")
        topic_list = []
        
        for topic_id, data in topic_flashcards.items():
            flashcards = data['flashcards']
            if not flashcards:
                continue
                
            output_file = OUTPUT_DIR / f"{topic_id}.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(flashcards, f, indent=2, ensure_ascii=False)
            
            topic_list.append(topic_id)
            print(f"   ✓ {topic_id}: {len(flashcards)} flashcards")
        
        # Update index
        index = {
            'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'totalFlashcards': total_flashcards,
            'topics': topic_list,
            'source': 'batch_api'
        }
        with open(OUTPUT_DIR / 'index.json', 'w') as f:
            json.dump(index, f, indent=2)
        
        print(f"\n✅ Flashcard generation complete!")
        print(f"   Total flashcards: {total_flashcards}")
        print(f"   Topics: {len(topic_list)}")
        print(f"   Errors: {errors}")
        
    except Exception as e:
        print(f"❌ Error retrieving results: {e}")
        import traceback
        traceback.print_exc()


def main():
    if len(sys.argv) < 2:
        print("Usage: python batch_api_flashcards.py [create|submit|status|results]")
        print("")
        print("Commands:")
        print("  create  - Create batch request file")
        print("  submit  - Create and submit batch job")
        print("  status  - Check batch job status")
        print("  results - Retrieve and process results")
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
