import re
import logging
import argparse

import chromadb
from pypdf import PdfReader

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s")
logger = logging.getLogger("opspilot.ingest")

# Matches "Section 1.", "Section 4.2", etc. at the start of a line. The old
# pattern also matched this even inside the middle of a sentence that
# happened to contain the word "Section" — anchoring to line start with
# MULTILINE avoids splitting on stray mentions of the word.
SECTION_PATTERN = re.compile(r"^(Section\s+\d+\.?\d*.*?)\n", re.MULTILINE)

CHUNK_SIZE_WORDS = 400
CHUNK_OVERLAP_WORDS = 50


def extract_and_chunk_pdf(file_path: str):
    reader = PdfReader(file_path)
    pages_text = []
    for page_num, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages_text.append((page_num, text))

    full_text = "\n".join(t for _, t in pages_text)
    if not full_text.strip():
        logger.warning("No extractable text found in %s (scanned/image PDF? consider OCR).", file_path)
        return [], [], []

    # Split on section headers, keeping the headers themselves via the
    # capturing group so re.split returns [pre-text, header, body, header, body, ...]
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
            # Stable, content-independent id so re-running ingestion on the
            # same file upserts in place instead of erroring on duplicate
            # IDs or silently piling up duplicate chunks.
            ids.append(f"{file_path}::{current_section_name[:40]}::{len(documents)}")

    return documents, metadatas, ids


def ingest(pdf_file: str, collection_name: str = "clinical_pa_real_data", db_path: str = "./chroma_db"):
    chroma_client = chromadb.PersistentClient(path=db_path)
    collection = chroma_client.get_or_create_collection(name=collection_name)

    docs, metas, chunk_ids = extract_and_chunk_pdf(pdf_file)

    if not docs:
        logger.error("No text extracted from %s — nothing ingested. Check the PDF and section regex.", pdf_file)
        return 0

    # upsert (not add): reruns during iteration on the same policy file
    # won't raise on duplicate IDs and will refresh content in place.
    collection.upsert(documents=docs, metadatas=metas, ids=chunk_ids)
    logger.info("Loaded %d chunks into ChromaDB from %s (collection=%s).", len(docs), pdf_file, collection_name)
    return len(docs)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest a clinical policy PDF into ChromaDB for RAG.")
    parser.add_argument("pdf_file", nargs="?", default="real_insurance_policy.pdf")
    parser.add_argument("--collection", default="clinical_pa_real_data")
    parser.add_argument("--db-path", default="./chroma_db")
    args = parser.parse_args()

    ingest(args.pdf_file, collection_name=args.collection, db_path=args.db_path)
