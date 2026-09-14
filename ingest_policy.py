import re
import logging
import argparse
import chromadb
from langchain_core.tools import tool

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s")
logger = logging.getLogger("caretrace.ingest")

SECTION_PATTERN = re.compile(r"^(Section\s+\d+\.?\d*.*?)\n", re.MULTILINE)
CHUNK_SIZE_WORDS = 400
CHUNK_OVERLAP_WORDS = 50

def extract_and_chunk_text(file_path: str):
    with open(file_path, 'r', encoding='utf-8') as f:
        full_text = f.read()

    if not full_text.strip():
        logger.warning("No extractable text found in %s.", file_path)
        return [], [], []

    raw_parts = SECTION_PATTERN.split(full_text)
    documents, metadatas, ids = [], [], []
    current_section_name = "General/Introduction"

    for part in raw_parts:
        if SECTION_PATTERN.match(part + "\n"):
            current_section_name = part.strip()
            continue
        if not part.strip():
            continue

        words = part.split()
        step = max(1, CHUNK_SIZE_WORDS - CHUNK_OVERLAP_WORDS)
        for j in range(0, len(words), step):
            sub_chunk = " ".join(words[j : j + CHUNK_SIZE_WORDS])
            if not sub_chunk.strip():
                continue
            documents.append(sub_chunk)
            metadatas.append({
                "source_file": file_path,
                "section": current_section_name,
            })
            ids.append(f"{file_path}::{current_section_name[:40]}::{len(documents)}")

    return documents, metadatas, ids

def ingest(text_file: str, collection_name: str = "clinical_guidelines", db_path: str = "./chroma_db"):
    chroma_client = chromadb.PersistentClient(path=db_path)
    collection = chroma_client.get_or_create_collection(name=collection_name)

    docs, metas, chunk_ids = extract_and_chunk_text(text_file)

    if not docs:
        logger.error("No text extracted. Nothing ingested.")
        return 0

    collection.upsert(documents=docs, metadatas=metas, ids=chunk_ids)
    logger.info("Loaded %d chunks into ChromaDB from %s (collection=%s).", len(docs), text_file, collection_name)
    return len(docs)

@tool
def retrieve_clinical_guidelines(query: str) -> str:
    """
    Searches the indexed clinical guidelines database for treatment protocols, 
    medication contraindications, and documentation requirements.
    """
    chroma_client = chromadb.PersistentClient(path="./chroma_db")
    collection = chroma_client.get_or_create_collection(name="clinical_guidelines")
    
    results = collection.query(query_texts=[query], n_results=2)
    
    if not results['documents'] or not results['documents'][0]:
        return "No relevant clinical guidelines found."
        
    retrieved_text = "\n\n---\n\n".join(results['documents'][0])
    return f"Retrieved Guidelines:\n{retrieved_text}"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest clinical guidelines into ChromaDB.")
    parser.add_argument("text_file", nargs="?", default="mock_clinical_guidelines.txt")
    parser.add_argument("--collection", default="clinical_guidelines")
    parser.add_argument("--db-path", default="./chroma_db")
    args = parser.parse_args()

    ingest(args.text_file, collection_name=args.collection, db_path=args.db_path)