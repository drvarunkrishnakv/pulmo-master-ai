#!/usr/bin/env python3
"""
Fast Batch Embedding Indexer for RAG
Uses Gemini's new google.genai SDK with batch embedding API

Usage:
    source .venv/bin/activate
    python scripts/rag/batch_indexer.py
"""

import os
import json
import time
from pathlib import Path
from typing import List, Dict, Any

# Load environment variables from .env.local
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(env_path)

from google import genai
from google.genai.types import EmbedContentConfig

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
METADATA_FILE = DATA_DIR / 'index_metadata.json'

# Embedding configuration
EMBEDDING_MODEL = 'text-embedding-004'
BATCH_SIZE = 100  # Max texts per API call
RATE_LIMIT_DELAY = 0.5  # 500ms between batches


def load_chunks() -> List[Dict[str, Any]]:
    """Load chunks from JSONL file"""
    chunks = []
    with open(CHUNKS_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                chunks.append(json.loads(line))
    return chunks


def generate_batch_embeddings(texts: List[str], retries: int = 3) -> List[List[float]]:
    """
    Generate embeddings for a batch of texts in a single API call.
    This is the key optimization - 100 texts = 1 API call instead of 100.
    """
    for attempt in range(retries):
        try:
            result = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=texts,
                config=EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT")
            )
            # Extract embeddings from result
            return [e.values for e in result.embeddings]
        except Exception as e:
            error_str = str(e).lower()
            if 'rate' in error_str or '429' in error_str or 'quota' in error_str:
                delay = (2 ** (attempt + 1)) * 1
                print(f"\n    ⏳ Rate limited, waiting {delay}s...")
                time.sleep(delay)
            elif attempt == retries - 1:
                raise e
            else:
                print(f"\n    ⚠️  Attempt {attempt+1} failed: {e}, retrying...")
                time.sleep(1)
    raise Exception("Failed after retries")


def main():
    print("🚀 Fast Batch Embedding Indexer (Python + google.genai)\n")
    
    # Check chunks file
    if not CHUNKS_FILE.exists():
        print("❌ Chunks file not found. Run chunker first:")
        print("   npm run rag:chunk")
        exit(1)
    
    # Load chunks
    print("📚 Loading chunks...")
    chunks = load_chunks()
    print(f"   Loaded {len(chunks)} chunks\n")
    
    # Initialize storage
    embeddings_data = {
        'ids': [],
        'embeddings': []
    }
    mapping = []
    
    # Process in batches
    total_batches = (len(chunks) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"🧠 Generating embeddings ({total_batches} batches of {BATCH_SIZE})...\n")
    
    start_time = time.time()
    
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        
        print(f"  Batch {batch_num}/{total_batches} ({len(batch)} chunks)...", end=" ", flush=True)
        
        try:
            # Extract texts
            texts = [chunk['text'] for chunk in batch]
            
            # Generate ALL embeddings in ONE API call
            batch_embeddings = generate_batch_embeddings(texts)
            
            # Store results
            for j, chunk in enumerate(batch):
                global_index = i + j
                embedding = batch_embeddings[j]
                
                embeddings_data['ids'].append(chunk['id'])
                embeddings_data['embeddings'].append(embedding)
                
                mapping.append({
                    'id': chunk['id'],
                    'text': chunk['text'],
                    'metadata': chunk['metadata'],
                    'embeddingIndex': global_index
                })
            
            processed = min(i + BATCH_SIZE, len(chunks))
            elapsed = time.time() - start_time
            rate = processed / elapsed if elapsed > 0 else 0
            eta = (len(chunks) - processed) / rate if rate > 0 else 0
            
            print(f"✓ ({processed}/{len(chunks)}) - {rate:.1f}/s - ETA: {eta/60:.1f}min")
            
        except Exception as e:
            print(f"✗ Error: {e}")
        
        # Brief delay between batches
        if i + BATCH_SIZE < len(chunks):
            time.sleep(RATE_LIMIT_DELAY)
    
    elapsed = time.time() - start_time
    print(f"\n⏱️  Total time: {elapsed/60:.1f} minutes")
    
    # Save embeddings
    print("\n💾 Saving index...")
    with open(EMBEDDINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(embeddings_data, f)
    print(f"   → {EMBEDDINGS_FILE}")
    
    # Save mapping
    with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=2)
    print(f"   → {MAPPING_FILE}")
    
    # Save metadata
    metadata = {
        'totalChunks': len(embeddings_data['ids']),
        'embeddingModel': EMBEDDING_MODEL,
        'embeddingDimension': len(embeddings_data['embeddings'][0]) if embeddings_data['embeddings'] else 768,
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'indexer': 'python-batch-genai'
    }
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    print(f"   → {METADATA_FILE}")
    
    print(f"\n✅ Indexing complete!")
    print(f"   Total chunks indexed: {len(embeddings_data['ids'])}")
    print(f"   Embedding dimension: {metadata['embeddingDimension']}")


if __name__ == '__main__':
    main()
