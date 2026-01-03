import os
import json
import re
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv

# Try to import PyPDF2, handle missing dependency
try:
    import PyPDF2
except ImportError:
    print("❌ PyPDF2 not installed. Please run: pip install PyPDF2")
    exit(1)

load_dotenv(Path('.env.local'))

DATA_DIR = Path('data/guidelines')
OUTPUT_DIR = Path('data/rag/guidelines_processed')
OUTPUT_CHUNKS = OUTPUT_DIR / 'guideline_chunks.jsonl'

class GuidelineChunker:
    def __init__(self):
        self.chunks = []

    def load_pdf(self, file_path: Path) -> str:
        """Extract text from PDF"""
        text = ""
        try:
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
        return text

    def clean_text(self, text: str) -> str:
        """Clean guideline specific artifacts (headers, footers, page numbers)"""
        # Remove multiple newlines
        text = re.sub(r'\n{3,}', '\n\n', text)
        # Remove common page numbers "Page X of Y"
        text = re.sub(r'Page \d+ of \d+', '', text)
        return text.strip()

    def chunk_by_headers(self, text: str, source: str) -> List[Dict[str, Any]]:
        """
        Smart chunking for guidelines.
        Tries multiple patterns, falls back to fixed-size chunks.
        """
        # Try multiple header patterns
        patterns = [
            r'(?m)^(\d+\.\d+\s+[A-Z].+)$',           # 1.1 Topic Name
            r'(?m)^(Chapter\s+\d+[:\s-]+.+)$',       # Chapter 1: Topic
            r'(?m)^(CHAPTER\s+\d+[:\s-]+.+)$',       # CHAPTER 1: Topic
            r'(?m)^([A-Z][A-Z\s]{5,40})$',           # ALL CAPS HEADERS
            r'(?m)^(\d+\.\s+[A-Z].+)$',              # 1. Topic Name
            r'(?m)^(Key\s+Points?|Recommendations?|Summary|Definition|Management|Treatment|Diagnosis).*$'  # Common sections
        ]
        
        chunks = []
        
        for pattern in patterns:
            splits = re.split(pattern, text)
            current_header = "Introduction"
            
            for i, part in enumerate(splits):
                if i == 0: continue
                
                part = part.strip()
                if re.match(pattern, part):
                    current_header = part
                else:
                    if len(part) > 50:
                        chunk_id = f"guide_{os.path.basename(source).replace('.pdf', '')}_{len(chunks)}"
                        chunks.append({
                            "id": chunk_id,
                            "text": f"TOPIC: {current_header}\nSOURCE: {os.path.basename(source)}\n\n{part}",
                            "metadata": {
                                "source": os.path.basename(source),
                                "type": "guideline",
                                "topic": current_header
                            }
                        })
            
            # If we got chunks, stop trying other patterns
            if len(chunks) > 0:
                break
        
        # Fallback: fixed-size chunking if no patterns matched
        if len(chunks) == 0 and len(text) > 200:
            chunk_size = 2000  # ~500 words per chunk
            words = text.split()
            for i in range(0, len(words), chunk_size // 5):  # approx 400 words
                chunk_text = ' '.join(words[i:i + chunk_size // 5])
                if len(chunk_text) > 100:
                    chunk_id = f"guide_{os.path.basename(source).replace('.pdf', '')}_{len(chunks)}"
                    chunks.append({
                        "id": chunk_id,
                        "text": f"TOPIC: Section {len(chunks) + 1}\nSOURCE: {os.path.basename(source)}\n\n{chunk_text}",
                        "metadata": {
                            "source": os.path.basename(source),
                            "type": "guideline",
                            "topic": f"Section {len(chunks) + 1}"
                        }
                    })
        
        return chunks


    def process_directory(self):
        if not DATA_DIR.exists():
            print(f"❌ {DATA_DIR} does not exist.")
            return

        if not OUTPUT_DIR.exists():
            OUTPUT_DIR.mkdir(parents=True)

        all_chunks = []
        
        print(f"📂 Scanning {DATA_DIR}...")
        for pdf_file in DATA_DIR.glob('*.pdf'):
            print(f"   📄 Processing {pdf_file.name}...")
            text = self.load_pdf(pdf_file)
            cleaned = self.clean_text(text)
            chunks = self.chunk_by_headers(cleaned, str(pdf_file))
            all_chunks.extend(chunks)
            print(f"      → {len(chunks)} chunks extracted")

        with open(OUTPUT_CHUNKS, 'w') as f:
            for chunk in all_chunks:
                f.write(json.dumps(chunk) + '\n')
        
        print(f"\n✅ Saved {len(all_chunks)} guideline chunks to {OUTPUT_CHUNKS}")

if __name__ == "__main__":
    chunker = GuidelineChunker()
    chunker.process_directory()
