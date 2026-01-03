import os
import json
import asyncio
from pathlib import Path
from typing import List, Dict
from dotenv import load_dotenv
from google import genai
import numpy as np

load_dotenv(Path('.env.local'))

# Configuration
GUIDELINE_CHUNKS = Path('data/rag/guidelines_processed/guideline_chunks.jsonl')
TEXTBOOK_EMBEDDINGS = Path('data/rag/embeddings.json') # Base truth
OUTPUT_TRENDS = Path('src/data/exam_forecast_trends.json')

client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

# Prompt for the "Diff Analysis"
DIFF_PROMPT = """
You are an expert NEET-SS Pulmonology Examiner. 
Task: Compare the "Recent Guideline" text with the "Standard Textbook" context.

GUIDELINE (Newer):
{guideline_text}

TEXTBOOK (Older/Standard):
{textbook_text}

Determine if the Guideline represents a SIGNIFICANT PARADIGM SHIFT or UPDATE that conflicts with or adds to the textbook.
Ignore minor phrasing differences. Focus on:
1. New Drug Approvals
2. Changed Numerical Cut-offs
3. Contraindications becoming Indications (or vice versa)
4. New Classification Systems

If there is a shift, output JSON:
{{
  "has_shift": true,
  "topic": "Short Topic Name",
  "old_concept": "Summary of old textbook view",
  "new_concept": "Summary of new guideline view",
  "exam_relevance_score": 1-10 (10 = Certain Exam Question),
  "reason": "Why is this high yield?"
}}

If NO significant shift, output:
{{ "has_shift": false }}
"""

# Load Standard Textbook Embeddings
def load_vector_db():
    if not TEXTBOOK_EMBEDDINGS.exists():
        print("❌ Embeddings not found. Cannot compare against textbooks.")
        return None
    
    with open(TEXTBOOK_EMBEDDINGS, 'r') as f:
        data = json.load(f)
    
    # Load mapping to get text content
    mapping_path = Path('data/rag/chunk_mapping.json')
    if not mapping_path.exists():
        return None
        
    with open(mapping_path, 'r') as f:
        mapping = json.load(f)
        
    # Create id-to-text map
    text_map = {m['id']: m['text'] for m in mapping}
    
    return {
        "ids": data['ids'],
        "embeddings": np.array(data['embeddings'], dtype='float32'),
        "texts": text_map
    }

VECTOR_DB = None

async def get_embedding(text: str) -> List[float]:
    try:
        result = client.models.embed_content(
            model='text-embedding-004',
            contents=text
        )
        return result.embeddings[0].values
    except Exception as e:
        print(f"Embedding error: {e}")
        return [0.0] * 768

async def find_relevant_textbook_chunks(guideline_chunk: Dict) -> str:
    global VECTOR_DB
    if VECTOR_DB is None:
        VECTOR_DB = load_vector_db()
        if VECTOR_DB is None:
            return "Reference textbook content unavailable."
            
    # Generate embedding for guideline chunk
    query_vec = await get_embedding(guideline_chunk['text'])
    query_vec = np.array(query_vec, dtype='float32')
    
    # Cosine Similarity
    # (A . B) / (|A| * |B|)
    # Since embeddings are usually normalized, just dot product works often, but let's be safe
    
    vectors = VECTOR_DB['embeddings']
    norms = np.linalg.norm(vectors, axis=1)
    query_norm = np.linalg.norm(query_vec)
    
    if query_norm == 0: return ""
    
    scores = np.dot(vectors, query_vec) / (norms * query_norm)
    
    # Get top 3
    top_indices = np.argsort(scores)[::-1][:3]
    
    context = []
    for idx in top_indices:
        chunk_id = VECTOR_DB['ids'][idx]
        text = VECTOR_DB['texts'].get(chunk_id, "")
        context.append(f"--- MATCH (Score: {scores[idx]:.2f}) ---\n{text}")
        
    return "\n\n".join(context)

async def analyze_chunk(chunk: Dict) -> Dict:
    # 1. Find standard text
    textbook_context = await find_relevant_textbook_chunks(chunk)
    
    if not textbook_context or "unavailable" in textbook_context:
        print(f"Skipping {chunk['id']} - No context")
        return {"has_shift": False}

    # 2. Call Gemini
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=DIFF_PROMPT.format(
                guideline_text=chunk['text'][:4000],
                textbook_text=textbook_context[:4000]
            )
        )
        return json.loads(response.text.strip().replace('```json', '').replace('```', ''))
    except Exception as e:
        print(f"Error analyzing chunk {chunk['id']}: {e}")
        return {"has_shift": False}

def detect_category(topic: str, text: str = "") -> str:
    """Auto-categorize a trend based on keywords."""
    combined = (topic + " " + text).lower()
    
    if any(kw in combined for kw in ['tuberculosis', ' tb ', 'dr-tb', 'mdr-tb', 'xdr-tb', 'ntep', 'rntcp', 'dots']):
        return 'TB'
    elif any(kw in combined for kw in ['asthma', 'gina', 'bronchodilator', 'ics-formoterol', 'inhaler']):
        return 'Asthma'
    elif any(kw in combined for kw in ['ards', 'acute respiratory distress', 'ventilation', 'plateau pressure']):
        return 'ARDS'
    elif any(kw in combined for kw in ['copd', 'gold report', 'emphysema', 'chronic obstructive']):
        return 'COPD'
    elif any(kw in combined for kw in ['pneumonia', 'cap ', 'community-acquired']):
        return 'Pneumonia'
    else:
        return 'Other'

async def main():
    if not GUIDELINE_CHUNKS.exists():
        print("❌ No processed guidelines found. Run guideline_ingester.py first.")
        return

    trends = []
    
    # Load guideline chunks
    chunks = []
    with open(GUIDELINE_CHUNKS, 'r') as f:
        for line in f:
            chunks.append(json.loads(line))
    
    print(f"🧠 Analyzing {len(chunks)} guideline chunks for Paradigm Shifts...")
    
    # Process ALL chunks (no limit)
    for i, chunk in enumerate(chunks):
        print(f"   Scanning chunk {i+1}/{len(chunks)}: {chunk['metadata']['topic']}...")
        result = await analyze_chunk(chunk)
        
        if result.get('has_shift'):
            topic = result.get('topic', '')
            category = detect_category(topic, result.get('new_concept', ''))
            print(f"      🚨 SHIFT DETECTED: {topic} [{category}] (Score: {result['exam_relevance_score']})")
            trends.append({
                **result,
                "source_guideline": chunk['metadata']['source'],
                "category": category
            })
            
    # Save Results with metadata
    from datetime import datetime, timezone
    output = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_trends": len(trends),
            "sources_analyzed": list(set(t['source_guideline'] for t in trends))
        },
        "trends": trends
    }
    
    with open(OUTPUT_TRENDS, 'w') as f:
        json.dump(output, f, indent=2)
        
    print(f"\n✅ Analysis Complete. Found {len(trends)} potential exam questions.")

if __name__ == "__main__":
    asyncio.run(main())
