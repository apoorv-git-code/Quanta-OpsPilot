"""Small, auditable policy index used by CareTrace's retrieval tool.

The demo deliberately uses SQLite and deterministic lexical scoring instead of a
black-box vector service. Every retrieved chunk, score, section, and source file
can therefore be shown to judges and reproduced offline.
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
from pathlib import Path
from typing import Iterable


SECTION_PATTERN = re.compile(r"(?m)^(Section\s+\d+(?:\.\d+)?[^\n]*)$")
TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
STOP_WORDS = {
    "a", "all", "an", "and", "are", "as", "at", "be", "by", "for",
    "from", "in", "is", "it", "of", "on", "or", "the", "this", "to",
    "with", "within",
}


def _tokens(value: str) -> set[str]:
    return {token for token in TOKEN_PATTERN.findall(value.lower()) if token not in STOP_WORDS}


def _sections(text: str) -> Iterable[tuple[str, str]]:
    matches = list(SECTION_PATTERN.finditer(text))
    if not matches:
        yield "General", text.strip()
        return
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        if content:
            yield match.group(1).strip(), content


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
          id TEXT PRIMARY KEY,
          source_name TEXT NOT NULL,
          source_type TEXT NOT NULL,
          section TEXT NOT NULL,
          content TEXT NOT NULL,
          authority TEXT NOT NULL,
          ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def ingest_text(
    connection: sqlite3.Connection,
    *,
    source_name: str,
    source_type: str,
    authority: str,
    text: str,
) -> int:
    ensure_schema(connection)
    written = 0
    for section, content in _sections(text):
        identifier = hashlib.sha256(f"{source_name}|{section}|{content}".encode()).hexdigest()[:24]
        connection.execute(
            """
            INSERT INTO knowledge_chunks(id,source_name,source_type,section,content,authority)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              source_name=excluded.source_name,
              source_type=excluded.source_type,
              section=excluded.section,
              content=excluded.content,
              authority=excluded.authority
            """,
            (identifier, source_name, source_type, section, content, authority),
        )
        written += 1
    return written


def ingest_file(connection: sqlite3.Connection, path: Path) -> int:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("PDF ingestion requires pypdf; install requirements.txt") from exc
        text = "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
        source_type = "insurance_policy"
        authority = "administrative_only"
    else:
        text = path.read_text(encoding="utf-8")
        source_type = "clinical_guideline"
        authority = "documentation_support_only"
    return ingest_text(
        connection,
        source_name=path.name,
        source_type=source_type,
        authority=authority,
        text=text,
    )


def ingest_directory(connection: sqlite3.Connection, directory: Path) -> int:
    total = 0
    if not directory.exists():
        return total
    for path in sorted(directory.iterdir()):
        if path.suffix.lower() in {".txt", ".pdf"}:
            total += ingest_file(connection, path)
    return total


def search(connection: sqlite3.Connection, query: str, limit: int = 3) -> list[dict]:
    ensure_schema(connection)
    query_tokens = _tokens(query)
    rows = connection.execute(
        "SELECT id,source_name,source_type,section,content,authority FROM knowledge_chunks"
    ).fetchall()
    ranked = []
    for row in rows:
        item = dict(row)
        section_tokens = _tokens(item["section"])
        content_tokens = _tokens(item["content"])
        overlap = query_tokens & content_tokens
        section_overlap = query_tokens & section_tokens
        score = len(overlap) + (2 * len(section_overlap))
        if score:
            item["matched_terms"] = sorted(overlap | section_overlap)
            item["score"] = round(score / max(len(query_tokens), 1), 3)
            ranked.append(item)
    ranked.sort(key=lambda item: (-item["score"], item["source_name"], item["section"]))
    return ranked[: max(1, min(limit, 10))]
