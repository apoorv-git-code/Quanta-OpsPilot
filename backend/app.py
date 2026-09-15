"""CareTrace clinical documentation agent API.

The service uses synthetic records only. It imports a bounded mock-EHR cohort,
builds a longitudinal state, drafts documentation, blocks unsafe prescription
candidates, persists an auditable state-graph trace, and reserves consequential
clinical decisions for an authenticated clinician role.
"""

from __future__ import annotations

import asyncio
import csv
import difflib
import hashlib
import io
import json
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional, TypedDict

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .knowledge import ingest_directory, search as search_knowledge
from .reports import build_clinical_report_pdf

try:
    from langgraph.graph import END, StateGraph
except ImportError:  # The explicit fallback keeps setup survivable offline.
    END = None
    StateGraph = None


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
DB_PATH = Path(os.getenv("CAIRN_DB_PATH", ROOT / "backend" / "cairn.db"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
AI_PROVIDER = os.getenv("AI_PROVIDER", "auto").lower()
KNOWLEDGE_DIR = Path(os.getenv("CAIRN_KNOWLEDGE_DIR", ROOT / "backend" / "knowledge"))
TRACE_DELAY = float(os.getenv("CAIRN_TRACE_DELAY", "0.55"))
EHR_IMPORT_LIMIT = int(os.getenv("CAIRN_EHR_IMPORT_LIMIT", "20000"))
CASE_REGISTRY_LIMIT = 50
CASE_ID = "SIM-0427"
EHR_PATIENT_ID = "UKP189058"

CASE_NAMES = [
    "Ananya Rao", "Vikram Singh", "Meera Iyer", "Kabir Shah", "Diya Nair",
    "Arjun Verma", "Ishita Bose", "Rohan Gupta", "Saanvi Joshi", "Aditya Menon",
    "Nisha Kapoor", "Reyansh Malik", "Kavya Reddy", "Dev Khanna", "Tara Desai",
    "Vihaan Das", "Myra Kulkarni", "Ayaan Bhat", "Riya Chawla", "Krish Sethi",
    "Aditi Pillai", "Dhruv Arora", "Navya Jain", "Samar Roy", "Pihu Mathur",
    "Yash Mehta", "Aarav Patel", "Zoya Khan", "Nakul Anand", "Avni Mishra",
    "Manav Saxena", "Ira Banerjee", "Shaurya Gill", "Siya Tripathi", "Arnav Rao",
    "Mira Prasad", "Atharv Sen", "Kiara Dutta", "Vivaan Suri", "Anika Ghosh",
    "Parth Bansal", "Ahana Seth", "Rudra Naik", "Prisha Kohli", "Neil Grover",
    "Tanvi Oberoi", "Om Patil", "Sara Qureshi", "Kunal Wadhwa", "Leela Raman",
]


app = FastAPI(title="CareTrace Clinical Intelligence API", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    case_id: str = Field(default=CASE_ID, alias="caseId")
    failure_demo: bool = Field(default=True, alias="failureDemo")


class InjectRequest(BaseModel):
    potassium: float = 4.7
    source: str = "Repeat rural-clinic laboratory update"


class ResolveRequest(BaseModel):
    case_id: str = Field(default=CASE_ID, alias="caseId")
    action: str = "acknowledge_escalation"
    reviewer: str = "Dr. Abhinav"
    comment: str = "Lisinopril order remains blocked; repeat potassium and reassess."


class ReviewAcknowledgeRequest(BaseModel):
    case_id: str = Field(alias="caseId")
    action: str = "acknowledge_risk_review"
    reviewer: str = "Dr. Abhinav"
    comment: str = "Patient-specific longitudinal risk reviewed; follow-up remains clinician-owned."


class InitialConsultRequest(BaseModel):
    transcript: str
    prior_records: str


class InjectFactRequest(InitialConsultRequest):
    new_injected_fact: str


class GraphState(TypedDict, total=False):
    run_id: str
    case_id: str
    actor_id: str
    actor_role: str
    failure_demo: bool
    normalized: dict[str, Any]
    preconsult_summary: str
    assessment: dict[str, Any]
    evidence: list[dict[str, Any]]
    knowledge: list[dict[str, Any]]
    prescription: dict[str, Any]
    draft: str
    draft_provider: str
    verdict: dict[str, Any]
    note: str
    checks: list[dict[str, Any]]
    passed: int
    elapsed: float
    workflow_engine: str
    providers: dict[str, str]


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: Any) -> str:
    raw = json.dumps(value, sort_keys=True, default=str).encode()
    return hashlib.sha256(raw).hexdigest()[:20]


def actor_from_request(request: Request) -> tuple[str, str]:
    actor_id = request.headers.get("X-User-Id") or request.query_params.get("actorId") or "anonymous"
    role = (request.headers.get("X-Role") or request.query_params.get("role") or "viewer").lower()
    return actor_id, role


def require_role(request: Request, allowed: set[str]) -> tuple[str, str]:
    actor_id, role = actor_from_request(request)
    if role not in allowed:
        raise HTTPException(403, f"Role '{role}' is not permitted; required: {', '.join(sorted(allowed))}")
    return actor_id, role


def audit(
    connection: sqlite3.Connection,
    *,
    actor_id: str,
    actor_role: str,
    action: str,
    resource_type: str,
    resource_id: str,
    run_id: Optional[str] = None,
    node_name: Optional[str] = None,
    before: Any = None,
    after: Any = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    connection.execute(
        """INSERT INTO audit_log(
             actor_id,actor_role,action,resource_type,resource_id,run_id,node_name,
             before_hash,after_hash,metadata_json,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (
            actor_id, actor_role, action, resource_type, resource_id, run_id, node_name,
            stable_hash(before) if before is not None else None,
            stable_hash(after) if after is not None else None,
            json.dumps(metadata or {}), utc_now(),
        ),
    )


def locate_ehr_csv() -> Optional[Path]:
    configured = os.getenv("CAIRN_EHR_CSV")
    candidates = [
        Path(configured) if configured else None,
        ROOT / "data" / "demo_english.csv",
        ROOT / "demo_english.csv",
        ROOT / "backend" / "data" / "demo_english.csv",
        Path(__file__).resolve().parent / "demo_english.csv",
    ]
    return next((path for path in candidates if path and path.exists()), None)


def import_ehr_csv(connection: sqlite3.Connection, limit: int = EHR_IMPORT_LIMIT) -> int:
    """Idempotently import the first `limit` mock-EHR patients into SQLite."""
    path = locate_ehr_csv()
    if not path:
        return 0
    imported = 0
    with path.open(newline="", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            if imported >= limit:
                break
            patient_id = (row.get("patient_id") or "").strip()
            if not patient_id:
                continue
            connection.execute(
                """INSERT INTO patients(patient_id,profile_json,source_file,imported_at)
                   VALUES(?,?,?,?) ON CONFLICT(patient_id) DO UPDATE SET
                   profile_json=excluded.profile_json,source_file=excluded.source_file""",
                (patient_id, json.dumps(row), path.name, utc_now()),
            )
            imported += 1
    return imported


def _split_values(value: str) -> list[str]:
    return [item.strip() for item in re.split(r"[,;|]", value or "") if item.strip()]


def case_insights_from_profile(profile: dict[str, Any], index: int) -> dict[str, Any]:
    """Create deterministic, patient-specific synthetic encounter insights."""
    diagnosis = profile.get("primary_diagnosis") or "General medicine"
    condition = profile.get("condition_status") or "Under review"
    lab_status = profile.get("lab_results") or "Pending"
    medication = profile.get("current_medications") or "No active medication recorded"
    allergies = _split_values(profile.get("allergies", ""))
    bmi = float(profile.get("bmi") or 0)
    visits = int(float(profile.get("hospital_visits_past_year") or 0))
    risk_flags: list[str] = []
    if condition.lower() == "critical":
        risk_flags.append("Critical condition status")
    if lab_status.lower() == "abnormal":
        risk_flags.append("Abnormal diagnostic result")
    if bmi >= 30:
        risk_flags.append(f"BMI {bmi:.1f}")
    if str(profile.get("smoker", "")).lower() == "yes":
        risk_flags.append("Current smoker")
    if visits >= 4:
        risk_flags.append(f"{visits} hospital visits in the past year")
    if profile.get("disability"):
        risk_flags.append(f"{profile['disability']} disability support")
    risk_level = "High" if condition.lower() == "critical" or len(risk_flags) >= 3 else "Moderate" if risk_flags else "Routine"
    status = "Needs review" if risk_level == "High" or lab_status.lower() == "abnormal" else "Draft" if lab_status.lower() == "pending" else "Running" if index % 5 == 0 else "Complete"
    objective_by_diagnosis = {
        "hypertension": "Hypertension follow-up and medication reconciliation",
        "diabetes": "Diabetes monitoring and metabolic-risk review",
        "copd": "COPD symptom, inhaler, and smoking-risk review",
        "cancer": "Oncology surveillance and care-plan continuity",
        "arthritis": "Pain, mobility, and medication-safety review",
        "asthma": "Asthma control and rescue-medication review",
        "heart disease": "Cardiovascular follow-up and risk reconciliation",
    }
    objective = objective_by_diagnosis.get(diagnosis.lower(), f"{diagnosis} longitudinal follow-up")
    signal = risk_flags[0] if risk_flags else f"{lab_status} labs · {condition} condition"
    return {
        "objective": objective,
        "status": status,
        "key_signal": signal,
        "risk_level": risk_level,
        "risk_flags": risk_flags,
        "diagnosis": diagnosis,
        "condition_status": condition,
        "lab_status": lab_status,
        "medication": medication,
        "allergies": allergies,
        "bmi": bmi,
        "hospital_visits": visits,
        "recent_care_type": profile.get("recent_care_type") or "Outpatient",
        "annual_followups": int(float(profile.get("annual_followup_frequency") or 0)),
    }


def seed_case_registry(connection: sqlite3.Connection) -> None:
    rows = connection.execute(
        "SELECT patient_id,profile_json FROM patients WHERE patient_id != ? ORDER BY patient_id LIMIT ?",
        (EHR_PATIENT_ID, CASE_REGISTRY_LIMIT - 1),
    ).fetchall()
    demo = connection.execute("SELECT patient_id,profile_json FROM patients WHERE patient_id=?", (EHR_PATIENT_ID,)).fetchone()
    patients = list(rows)
    if demo:
        patients.insert(26, demo)
    patients = patients[:CASE_REGISTRY_LIMIT]
    now = utc_now()
    for index, patient in enumerate(patients):
        case_number = 401 + index
        case_id = CASE_ID if index == 26 else f"SIM-{case_number:04d}"
        profile = json.loads(patient["profile_json"])
        display_name = CASE_NAMES[index]
        insight = case_insights_from_profile(profile, index)
        setting = f"{insight['recent_care_type']} · {profile.get('hospital') or 'Community clinic'}"
        connection.execute(
            """INSERT INTO cases(id,patient_id,display_name,care_setting,objective,status,key_signal,updated_at,created_at)
               VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
               patient_id=excluded.patient_id,display_name=excluded.display_name,
               care_setting=excluded.care_setting,objective=excluded.objective,
               status=CASE
                 WHEN EXISTS(
                   SELECT 1 FROM review_acknowledgements acknowledgement
                   WHERE acknowledgement.case_id=cases.id
                 ) THEN 'Complete'
                 WHEN cases.status='Review gate' THEN cases.status
                 ELSE excluded.status
               END,
               key_signal=excluded.key_signal,updated_at=excluded.updated_at""",
            (case_id, patient["patient_id"], display_name, setting, insight["objective"], insight["status"], insight["key_signal"], now, now),
        )
        if case_id == CASE_ID:
            continue
        medications = [{"drug": item, "status": "active"} for item in _split_values(profile.get("current_medications", ""))]
        allergies = insight["allergies"]
        systolic = 118 + (index * 7) % 55
        diastolic = 72 + (index * 5) % 28
        potassium = round(3.6 + (index % 8) * 0.18, 1)
        record_seed = [
            ("transcript", "Current consultation transcript", "2026-09-12T09:42:00Z", .86, {
                "excerpt": f"Follow-up for {insight['diagnosis']}. Review symptoms, current therapy, recent investigations, and continuity plan.",
                "chief_concern": insight["objective"], "proposed_medication": "", "dose": "", "frequency": "",
            }),
            ("medication_list", "Active medication list", "2026-09-01T08:30:00Z", .94, {"medications": medications}),
            ("laboratory", "Latest diagnostic report", "2026-09-11T07:20:00Z", .97, {
                "result_summary": insight["lab_status"], "potassium_mEq_L": potassium,
                "bmi": insight["bmi"], "report_id": f"LAB-{case_number:04d}",
            }),
            ("allergy", "Allergy registry", "2026-08-18T10:00:00Z", .98, {
                "allergies": allergies, "no_known_allergies": not allergies,
                "ace_inhibitor_allergy": False, "angioedema_history": False,
            }),
            ("prior_note", "Previous consultation", "2026-06-14T08:40:00Z", .91, {
                "diagnosis": insight["diagnosis"],
                "history": f"First documented {profile.get('first_diagnosis_date') or 'date unavailable'}; current status {insight['condition_status'].lower()}",
                "plan": f"Continue longitudinal {insight['diagnosis'].lower()} monitoring with {insight['annual_followups']} planned follow-ups per year",
            }),
            ("vitals", "Latest clinical observations", "2026-09-12T09:38:00Z", .96, {
                "blood_pressure": f"{systolic}/{diastolic} mmHg", "bmi": insight["bmi"],
                "smoker": profile.get("smoker") or "Unknown", "alcohol_use": profile.get("alcohol_use") or "Unknown",
            }),
            ("care_insight", "Longitudinal risk synthesis", "2026-09-12T09:40:00Z", .95, insight),
        ]
        connection.executemany(
            """INSERT INTO records(case_id,source_type,source_name,observed_at,reliability,payload_json)
               VALUES(?,?,?,?,?,?) ON CONFLICT(case_id,source_name) DO UPDATE SET
               source_type=excluded.source_type,observed_at=excluded.observed_at,
               reliability=excluded.reliability,payload_json=excluded.payload_json""",
            [(case_id, *item[:-1], json.dumps(item[-1])) for item in record_seed],
        )


def provision_patient_case(connection: sqlite3.Connection, patient_id: str) -> str:
    """Create a persistent, patient-specific workspace for any CSV EHR row."""
    existing = connection.execute("SELECT id FROM cases WHERE patient_id=? ORDER BY created_at LIMIT 1", (patient_id,)).fetchone()
    if existing:
        return existing["id"]
    patient = connection.execute("SELECT profile_json FROM patients WHERE patient_id=?", (patient_id,)).fetchone()
    if not patient:
        raise HTTPException(404, "Synthetic patient not found")
    profile = json.loads(patient["profile_json"])
    numeric = int(hashlib.sha256(patient_id.encode("utf-8")).hexdigest()[:8], 16)
    case_id = f"EHR-{patient_id}"
    insight = case_insights_from_profile(profile, numeric)
    display_name = f"Synthetic Patient {patient_id[-6:]}"
    setting = f"{insight['recent_care_type']} · {profile.get('hospital') or 'Community clinic'}"
    now = utc_now()
    connection.execute(
        """INSERT INTO cases(id,patient_id,display_name,care_setting,objective,status,key_signal,updated_at,created_at)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (case_id, patient_id, display_name, setting, insight["objective"], insight["status"], insight["key_signal"], now, now),
    )
    medications = [{"drug": item, "status": "active"} for item in _split_values(profile.get("current_medications", ""))]
    allergies = insight["allergies"]
    systolic = 118 + numeric % 55
    diastolic = 72 + numeric % 28
    potassium = round(3.6 + (numeric % 8) * 0.18, 1)
    record_seed = [
        ("transcript", "Current consultation transcript", now, .86, {
            "excerpt": f"Follow-up for {insight['diagnosis']}. Review symptoms, current therapy, recent investigations, and continuity plan.",
            "chief_concern": insight["objective"], "proposed_medication": "", "dose": "", "frequency": "",
        }),
        ("medication_list", "Active medication list", "2026-09-01T08:30:00Z", .94, {"medications": medications}),
        ("laboratory", "Latest diagnostic report", "2026-09-11T07:20:00Z", .97, {
            "result_summary": insight["lab_status"], "potassium_mEq_L": potassium,
            "bmi": insight["bmi"], "report_id": f"LAB-{patient_id}",
        }),
        ("allergy", "Allergy registry", "2026-08-18T10:00:00Z", .98, {
            "allergies": allergies, "no_known_allergies": not allergies,
            "ace_inhibitor_allergy": False, "angioedema_history": False,
        }),
        ("prior_note", "Previous consultation", "2026-06-14T08:40:00Z", .91, {
            "diagnosis": insight["diagnosis"],
            "history": f"First documented {profile.get('first_diagnosis_date') or 'date unavailable'}; current status {insight['condition_status'].lower()}",
            "plan": f"Continue longitudinal {insight['diagnosis'].lower()} monitoring with {insight['annual_followups']} planned follow-ups per year",
        }),
        ("vitals", "Latest clinical observations", now, .96, {
            "blood_pressure": f"{systolic}/{diastolic} mmHg", "bmi": insight["bmi"],
            "smoker": profile.get("smoker") or "Unknown", "alcohol_use": profile.get("alcohol_use") or "Unknown",
        }),
        ("care_insight", "Longitudinal risk synthesis", now, .95, insight),
    ]
    connection.executemany(
        """INSERT INTO records(case_id,source_type,source_name,observed_at,reliability,payload_json)
           VALUES(?,?,?,?,?,?)""",
        [(case_id, *item[:-1], json.dumps(item[-1])) for item in record_seed],
    )
    return case_id


def seed_accountable_triage(connection: sqlite3.Connection, target: int = 20) -> int:
    """Assign a fixed cohort of 20 review gates until each gate is acknowledged."""
    candidates = connection.execute(
        """SELECT c.id
           FROM cases c
           WHERE c.id != ?
           ORDER BY c.id
           LIMIT ?""",
        (CASE_ID, max(0, target)),
    ).fetchall()
    cohort_ids = [row["id"] for row in candidates]
    if cohort_ids:
        placeholders = ",".join("?" for _ in cohort_ids)
        connection.execute(
            f"""UPDATE cases SET status='Complete',updated_at=?
                WHERE id LIKE 'SIM-%' AND id != ? AND status='Needs review'
                  AND id NOT IN ({placeholders})""",
            (utc_now(), CASE_ID, *cohort_ids),
        )
    opened = 0
    for row in candidates:
        cursor = connection.execute(
            """UPDATE cases SET status='Needs review',updated_at=? WHERE id=?
               AND NOT EXISTS(SELECT 1 FROM review_acknowledgements a WHERE a.case_id=cases.id)""",
            (utc_now(), row["id"]),
        )
        opened += cursor.rowcount
    return opened


def init_database() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS patients (
              patient_id TEXT PRIMARY KEY,
              profile_json TEXT NOT NULL,
              source_file TEXT NOT NULL,
              imported_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cases (
              id TEXT PRIMARY KEY,
              patient_id TEXT NOT NULL,
              display_name TEXT NOT NULL,
              care_setting TEXT NOT NULL,
              objective TEXT,
              status TEXT,
              key_signal TEXT,
              updated_at TEXT,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS records (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              case_id TEXT NOT NULL,
              source_type TEXT NOT NULL,
              source_name TEXT NOT NULL,
              observed_at TEXT NOT NULL,
              reliability REAL NOT NULL,
              payload_json TEXT NOT NULL,
              UNIQUE(case_id, source_name)
            );
            CREATE TABLE IF NOT EXISTS runs (
              id TEXT PRIMARY KEY,
              case_id TEXT NOT NULL,
              actor_id TEXT NOT NULL,
              actor_role TEXT NOT NULL,
              status TEXT NOT NULL,
              current_stage TEXT NOT NULL,
              state_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id TEXT NOT NULL,
              sequence INTEGER NOT NULL,
              event_type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              UNIQUE(run_id, sequence)
            );
            CREATE TABLE IF NOT EXISTS notes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id TEXT NOT NULL,
              case_id TEXT NOT NULL,
              version INTEGER NOT NULL,
              body TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS note_diffs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id TEXT NOT NULL,
              from_label TEXT NOT NULL,
              to_label TEXT NOT NULL,
              diff_text TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS prescriptions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id TEXT NOT NULL,
              case_id TEXT NOT NULL,
              medication TEXT NOT NULL,
              dose TEXT NOT NULL,
              route TEXT NOT NULL,
              frequency TEXT NOT NULL,
              status TEXT NOT NULL,
              block_reason TEXT,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conflicts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              case_id TEXT NOT NULL,
              run_id TEXT,
              field TEXT NOT NULL,
              status TEXT NOT NULL,
              inferred_value TEXT,
              resolved_value TEXT,
              reviewer TEXT,
              resolved_at TEXT
            );
            CREATE TABLE IF NOT EXISTS review_acknowledgements (
              case_id TEXT PRIMARY KEY,
              action TEXT NOT NULL,
              reviewer TEXT NOT NULL,
              comment TEXT NOT NULL,
              acknowledged_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS care_orders (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              case_id TEXT NOT NULL,
              order_type TEXT NOT NULL,
              description TEXT NOT NULL,
              status TEXT NOT NULL,
              issued_by TEXT NOT NULL,
              issued_at TEXT NOT NULL,
              UNIQUE(case_id, order_type)
            );
            CREATE TABLE IF NOT EXISTS audit_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              actor_id TEXT NOT NULL,
              actor_role TEXT NOT NULL,
              action TEXT NOT NULL,
              resource_type TEXT NOT NULL,
              resource_id TEXT NOT NULL,
              run_id TEXT,
              node_name TEXT,
              before_hash TEXT,
              after_hash TEXT,
              metadata_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            """
        )
        run_columns = {row["name"] for row in connection.execute("PRAGMA table_info(runs)").fetchall()}
        if "actor_id" not in run_columns:
            connection.execute("ALTER TABLE runs ADD COLUMN actor_id TEXT NOT NULL DEFAULT 'system'")
        if "actor_role" not in run_columns:
            connection.execute("ALTER TABLE runs ADD COLUMN actor_role TEXT NOT NULL DEFAULT 'agent'")
        case_columns = {row["name"] for row in connection.execute("PRAGMA table_info(cases)").fetchall()}
        for column in ("objective", "status", "key_signal", "updated_at"):
            if column not in case_columns:
                connection.execute(f"ALTER TABLE cases ADD COLUMN {column} TEXT")
        connection.execute(
            """INSERT OR IGNORE INTO care_orders(case_id,order_type,description,status,issued_by,issued_at)
               SELECT case_id,
                      CASE WHEN action='request_record_update' THEN 'record_update' ELSE 'continued_follow_up' END,
                      CASE WHEN action='request_record_update'
                           THEN 'Obtain updated clinical records before the next documentation cycle'
                           ELSE 'Continue the clinician-owned longitudinal follow-up plan' END,
                      'issued',reviewer,acknowledged_at
               FROM review_acknowledgements"""
        )
        connection.execute(
            """INSERT OR IGNORE INTO care_orders(case_id,order_type,description,status,issued_by,issued_at)
               SELECT case_id,'repeat_potassium',
                      'Repeat serum potassium and reassess the blocked prescription candidate',
                      'issued',COALESCE(reviewer,'Clinician'),COALESCE(resolved_at,?)
               FROM conflicts
               WHERE status='acknowledged' AND resolved_value LIKE 'order_repeat_lab:%'""",
            (utc_now(),),
        )
        imported = import_ehr_csv(connection)
        seed_case_registry(connection)
        profile = connection.execute("SELECT 1 FROM patients WHERE patient_id=?", (EHR_PATIENT_ID,)).fetchone()
        first_patient = connection.execute("SELECT patient_id FROM patients ORDER BY patient_id LIMIT 1").fetchone()
        linked_id = EHR_PATIENT_ID if profile else first_patient["patient_id"] if first_patient else EHR_PATIENT_ID
        connection.execute(
            """INSERT INTO cases(id,patient_id,display_name,care_setting,objective,status,key_signal,updated_at,created_at)
               VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
               patient_id=excluded.patient_id,display_name=excluded.display_name,care_setting=excluded.care_setting,
               objective=excluded.objective,
               status=CASE WHEN cases.status='Complete' THEN cases.status ELSE excluded.status END,
               key_signal=excluded.key_signal,updated_at=excluded.updated_at""",
            (CASE_ID, linked_id, "Aarav Patel", "Rural primary health centre", "Hypertension follow-up and medication reconciliation", "Review gate", "Lisinopril blocked · K 5.2", utc_now(), utc_now()),
        )
        seed = [
                ("transcript", "Consultation transcript", "2026-09-12T09:42:00Z", 0.86, {
                    "excerpt": "Blood pressure remains high. Start lisinopril 10 milligrams once daily and review in two weeks.",
                    "proposed_medication": "Lisinopril", "dose": "10 mg", "frequency": "once daily", "assertion": "clinician_spoken_order",
                }),
                ("medication_list", "Active medication list", "2026-09-01T08:30:00Z", 0.94, {
                    "medications": [{"drug": "Amlodipine", "dose": "10 mg", "frequency": "daily", "status": "active"}],
                }),
                ("laboratory", "Digital laboratory report", "2026-09-11T07:20:00Z", 0.99, {
                    "potassium_mEq_L": 5.2, "potassium_flag": "HIGH", "creatinine_clearance_mL_min": 74, "report_id": "LAB-K-0911",
                }),
                ("allergy", "Allergy registry", "2026-08-18T10:00:00Z", 0.98, {
                    "allergies": ["Penicillin"], "ace_inhibitor_allergy": False, "angioedema_history": False,
                }),
                ("prior_note", "Previous hypertension consultation", "2026-06-14T08:40:00Z", 0.91, {
                    "diagnosis": "Hypertension", "history": "Diagnosed 2008; control remains suboptimal", "plan": "Continue amlodipine and review blood pressure",
                }),
                ("vitals", "Rural clinic observations", "2026-09-12T09:38:00Z", 0.97, {
                    "blood_pressure": "168/96 mmHg", "pulse": "82 bpm", "spo2": "97%", "temperature": "36.8 C",
                }),
        ]
        connection.executemany(
            """INSERT INTO records(case_id,source_type,source_name,observed_at,reliability,payload_json)
               VALUES(?,?,?,?,?,?) ON CONFLICT(case_id,source_name) DO UPDATE SET
               source_type=excluded.source_type,observed_at=excluded.observed_at,
               reliability=excluded.reliability,payload_json=excluded.payload_json""",
            [(CASE_ID, *row[:-1], json.dumps(row[-1])) for row in seed],
        )
        triage_seeded = seed_accountable_triage(connection, 20)
        ingest_directory(connection, KNOWLEDGE_DIR)
        audit(
            connection, actor_id="system", actor_role="system", action="ehr_import",
            resource_type="cohort", resource_id="demo_english.csv", after={"patients": imported},
            metadata={"limit": EHR_IMPORT_LIMIT, "source_found": locate_ehr_csv() is not None, "accountable_triage_seeded": triage_seeded},
        )


@app.on_event("startup")
def startup() -> None:
    init_database()


def get_records(case_id: str, *, include_transcript: bool = True) -> list[dict[str, Any]]:
    clause = "" if include_transcript else "AND source_type != 'transcript'"
    with db() as connection:
        rows = connection.execute(
            f"SELECT source_type,source_name,observed_at,reliability,payload_json FROM records WHERE case_id=? {clause} ORDER BY observed_at DESC",
            (case_id,),
        ).fetchall()
    return [{**dict(row), "payload": json.loads(row["payload_json"])} for row in rows]


def get_case(case_id: str) -> dict[str, Any]:
    with db() as connection:
        row = connection.execute(
            """SELECT c.id,c.patient_id,c.display_name,c.care_setting,c.objective,c.status,
                      c.key_signal,c.updated_at,p.profile_json
               FROM cases c LEFT JOIN patients p ON p.patient_id=c.patient_id WHERE c.id=?""",
            (case_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Synthetic case not found")
    result = dict(row)
    result["profile"] = json.loads(result.pop("profile_json") or "{}")
    case_records = get_records(case_id)
    insight_record = next((record for record in case_records if record["source_type"] == "care_insight"), None)
    result["insights"] = insight_record["payload"] if insight_record else case_insights_from_profile(result["profile"], 26 if case_id == CASE_ID else 0)
    if case_id == CASE_ID:
        latest_lab = next((record for record in case_records if record["source_type"] in {"external_update", "laboratory"}), None)
        potassium = float((latest_lab or {"payload": {}})["payload"].get("potassium_mEq_L", 5.2))
        result["insights"].update({
            "objective": "Hypertension follow-up and medication reconciliation",
            "status": result.get("status") or "Review gate", "key_signal": f"Lisinopril blocked · K {potassium:.1f}",
            "risk_level": "High", "risk_flags": [f"Potassium {potassium:.1f} mEq/L", "Unsafe Lisinopril candidate", "Blood pressure 168/96 mmHg"],
            "diagnosis": "Hypertension", "condition_status": "Suboptimal control", "lab_status": "Abnormal",
            "medication": "Amlodipine 10 mg", "allergies": ["Penicillin"], "bmi": result["profile"].get("bmi", "—"),
        })
    return result


def normalize_records(case_id: str) -> dict[str, Any]:
    case = get_case(case_id)
    records = get_records(case_id)
    facts = [
        {"field": key, "value": value, "source": record["source_name"], "source_type": record["source_type"], "observed_at": record["observed_at"]}
        for record in records for key, value in record["payload"].items()
    ]
    return {"case": case, "records": records, "facts": facts, "source_count": len(records), "fact_count": len(facts)}


def preconsult_summary(case_id: str) -> str:
    """Summarize prior care before processing the new transcript."""
    case = get_case(case_id)
    records = get_records(case_id, include_transcript=False)
    prior = next((x for x in records if x["source_type"] == "prior_note"), None)
    meds = next((x for x in records if x["source_type"] == "medication_list"), None)
    lab = next((x for x in records if x["source_type"] in {"external_update", "laboratory"}), None)
    allergy = next((x for x in records if x["source_type"] == "allergy"), None)
    profile = case["profile"]
    diagnosis = (prior or {"payload": {}})["payload"].get("diagnosis", "Hypertension")
    history = (prior or {"payload": {}})["payload"].get("history", "documented chronic condition")
    return (
        f"{case['display_name']} ({case['patient_id']}), {profile.get('age', 57)}-year-old {profile.get('sex', 'M')} "
        f"patient receiving care through a {case['care_setting']}. Longitudinal history: "
        f"{diagnosis}; {history}. "
        f"Current medication record: {json.dumps((meds or {'payload': {}})['payload'].get('medications', []))}. "
        f"Allergies: {', '.join((allergy or {'payload': {}})['payload'].get('allergies', [])) or 'none recorded'}. "
        f"Most recent potassium: {(lab or {'payload': {}})['payload'].get('potassium_mEq_L', 'unknown')} mEq/L."
    )


def evidence_retrieve(case_id: str, topic: str = "lisinopril") -> list[dict[str, Any]]:
    matches = []
    for record in get_records(case_id):
        searchable = json.dumps(record["payload"]).lower()
        if topic.lower() in searchable or record["source_type"] in {"laboratory", "allergy", "medication_list", "prior_note", "vitals", "transcript"}:
            matches.append({key: value for key, value in record.items() if key != "payload_json"})
    return matches


def policy_retrieve(query: str, limit: int = 3) -> list[dict[str, Any]]:
    with db() as connection:
        return search_knowledge(connection, query, limit)


def clinical_assessment(case_id: str) -> dict[str, Any]:
    records = get_records(case_id)
    # Records are newest-first. Preserve the newest value for each source class;
    # a normal dict comprehension would accidentally let an older lab overwrite
    # a newly uploaded result of the same type.
    payloads: dict[str, dict[str, Any]] = {}
    for record in records:
        payloads.setdefault(record["source_type"], record["payload"])
    transcript = payloads.get("transcript", {})
    lab = payloads.get("external_update") or payloads.get("laboratory", {})
    allergy = payloads.get("allergy", {})
    medication = transcript.get("proposed_medication", "")
    potassium = float(lab.get("potassium_mEq_L", 0) or 0)
    crcl = float(lab.get("creatinine_clearance_mL_min", 74) or 74)
    ace_allergy = bool(allergy.get("ace_inhibitor_allergy") or allergy.get("angioedema_history"))
    reasons = []
    if medication.lower() == "lisinopril" and potassium > 5.0:
        reasons.append(f"Potassium {potassium:.1f} mEq/L exceeds the 5.0 mEq/L contraindication threshold")
    if medication.lower() == "lisinopril" and crcl < 30:
        reasons.append(f"Creatinine clearance {crcl:.0f} mL/min is below 30 mL/min")
    if medication.lower() == "lisinopril" and ace_allergy:
        reasons.append("ACE-inhibitor allergy or angioedema history is documented")
    blocked = bool(reasons)
    return {
        "field": "prescription.lisinopril.safety",
        "conflict": blocked,
        "values": [f"Transcript proposes {medication} {transcript.get('dose', '')} {transcript.get('frequency', '')}".strip(), f"Lab potassium {potassium:.1f} mEq/L"],
        "observations": evidence_retrieve(case_id),
        "inferred_value": "BLOCKED — clinician review" if blocked else "eligible for clinician review",
        "confidence": 0.99 if blocked else 0.86,
        "potassium_mEq_L": potassium,
        "threshold_mEq_L": 5.0,
        "high_risk": blocked,
        "abnormal_diagnostic_alert": potassium > 5.0,
        "contraindications": reasons,
        "adapted_to_new_source": any(r["source_type"] == "external_update" for r in records),
    }


def prescription_candidate(case_id: str, assessment: dict[str, Any]) -> dict[str, Any]:
    transcript = next(x["payload"] for x in get_records(case_id) if x["source_type"] == "transcript")
    medication = transcript.get("proposed_medication") or "No new medication"
    proposed = medication != "No new medication"
    return {
        "medication": medication,
        "dose": transcript.get("dose") or "N/A",
        "route": "oral",
        "frequency": transcript.get("frequency") or "N/A",
        "status": "blocked" if assessment["high_risk"] else "pending_clinician_signature" if proposed else "not_proposed",
        "block_reason": "; ".join(assessment["contraindications"]) or None,
        "electronically_recorded": True,
        "issued": False,
    }


async def ollama_chat(system: str, prompt: str, *, temperature: float = 0.0) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={"model": OLLAMA_MODEL, "stream": False, "options": {"temperature": temperature}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]},
            )
            response.raise_for_status()
            return response.json()["message"]["content"].strip()
    except (httpx.HTTPError, KeyError, TypeError):
        return None


async def gemini_chat(system: str, prompt: str, *, temperature: float = 0.0) -> Optional[str]:
    if not GOOGLE_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                params={"key": GOOGLE_API_KEY},
                json={"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": temperature}},
            )
            response.raise_for_status()
            return response.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (httpx.HTTPError, KeyError, IndexError, TypeError):
        return None


async def ai_chat(system: str, prompt: str, *, temperature: float = 0.0) -> tuple[Optional[str], str]:
    if AI_PROVIDER in {"auto", "gemini"} and GOOGLE_API_KEY:
        result = await gemini_chat(system, prompt, temperature=temperature)
        if result:
            return result, "gemini"
        if AI_PROVIDER == "gemini":
            return None, "deterministic"
    if AI_PROVIDER in {"auto", "ollama"}:
        result = await ollama_chat(system, prompt, temperature=temperature)
        if result:
            return result, "ollama"
    return None, "deterministic"


UNSAFE_DRAFT = """SUBJECTIVE: Blood pressure remains elevated despite reported amlodipine use.
OBJECTIVE: Blood pressure 168/96 mmHg. Potassium 5.2 mEq/L. Creatinine clearance 74 mL/min.
ASSESSMENT: Follow-up for documented hypertension. No new diagnosis is asserted.
DIGITAL PRESCRIPTION: Start lisinopril 10 mg orally once daily.
FOLLOW-UP: Review blood pressure and medication tolerance in two weeks."""

SAFE_DRAFT = """PRE-CONSULTATION SUMMARY: Longstanding hypertension has been managed with amlodipine; control remains suboptimal.
SUBJECTIVE: Patient attended a rural primary health centre for chronic hypertension follow-up and reports taking amlodipine.
OBJECTIVE: Blood pressure 168/96 mmHg. Digital laboratory report LAB-K-0911 shows potassium 5.2 mEq/L and creatinine clearance 74 mL/min. Allergy registry records Penicillin and no known ACE-inhibitor allergy or angioedema.
ASSESSMENT: Follow-up for previously documented hypertension. No new diagnosis is asserted. Potassium is abnormally high and contradicts the spoken Lisinopril plan.
DIGITAL PRESCRIPTION CANDIDATE: Lisinopril 10 mg orally once daily was extracted from the transcript and electronically recorded as BLOCKED; it was not issued. ESCALATION: potassium exceeds the guideline threshold of 5.0 mEq/L. Clinician acknowledgement and repeat laboratory review are required.
FOLLOW-UP: Recheck potassium, review blood pressure, and reassess the treatment plan within two weeks. No autonomous treatment change initiated."""


async def documentation_agent(context: dict[str, Any], *, revision: bool = False, violation: str = "") -> tuple[str, str]:
    potassium = context.get("assessment", {}).get("potassium_mEq_L", 5.2)
    safe_fallback = SAFE_DRAFT.replace("5.2", f"{potassium:.1f}")
    unsafe_fallback = UNSAFE_DRAFT.replace("5.2", f"{potassium:.1f}")
    if revision and not context.get("assessment", {}).get("high_risk"):
        # A defensive escape hatch: even if a caller requests a rewrite for a
        # normal case, regenerate from that patient's facts instead of using the
        # special Lisinopril demo template.
        return await documentation_agent({**context, "assessment": context.get("assessment", {})})
    if revision:
        system = f"Rewrite synthetic clinical documentation only. Never prescribe. Explicitly mark the Lisinopril candidate BLOCKED, cite potassium {potassium:.1f}, preserve the ESCALATION, and require clinician acknowledgement."
        prompt = f"Evidence:\n{json.dumps(context, indent=2)}\nVerifier finding: {violation}\nReturn a concise structured follow-up note."
        result, provider = await ai_chat(system, prompt)
        required = ["blocked", f"{potassium:.1f}", "escalation", "clinician"]
        return (result if result and all(term in result.lower() for term in required) else safe_fallback), provider
    system = "Draft a first-pass note from synthetic records. Extract spoken prescription candidates, but do not independently authorize treatment."
    result, provider = await ai_chat(system, f"Create a structured follow-up draft:\n{json.dumps(context, indent=2)}")
    if not context.get("assessment", {}).get("high_risk"):
        facts = context.get("facts", [])
        values: dict[str, Any] = {}
        for fact in facts:
            values.setdefault(fact.get("field", ""), fact.get("value"))
        diagnosis = values.get("diagnosis") or "documented chronic condition"
        medications = values.get("medications") or []
        medication_text = ", ".join(item.get("drug", str(item)) if isinstance(item, dict) else str(item) for item in medications) or "none recorded"
        allergies = values.get("allergies") or []
        allergy_text = ", ".join(allergies) if allergies else "none recorded"
        blood_pressure = values.get("blood_pressure") or "not recorded"
        lab_summary = values.get("result_summary") or "reviewed"
        generic = f"""PRE-CONSULTATION SUMMARY: {context.get('preconsult_summary', 'Prior longitudinal records reviewed.')}\nSUBJECTIVE: Patient attended follow-up for {diagnosis}. No new diagnosis is asserted.\nOBJECTIVE: Blood pressure {blood_pressure}. Latest diagnostic status: {lab_summary}. Medication history: {medication_text}. Allergies: {allergy_text}.\nASSESSMENT: Follow-up for previously documented {diagnosis}; patient-specific risk factors and care continuity were reconciled.\nMEDICATION RECONCILIATION: Existing therapy was documented. No new prescription candidate was extracted or issued.\nFOLLOW-UP: Clinician to verify the record, review pending or abnormal investigations, and continue the documented follow-up plan. No autonomous treatment change initiated."""
        required = ["subjective", "objective", "assessment", "follow-up", "no new diagnosis", "no autonomous treatment change"]
        return (result if result and all(term in result.lower() for term in required) and "lisinopril" not in result.lower() else generic), provider
    return result or unsafe_fallback, provider


async def verifier_agent(note: str, assessment: dict[str, Any]) -> dict[str, Any]:
    system = 'You are a separate clinical safety verifier. Answer JSON only: {"violation": true|false, "reason": "..."}.'
    prompt = f"Does this note authorize Lisinopril despite a contraindication, omit the abnormal potassium alert, or lack clinician escalation?\n{json.dumps(assessment)}\n\n{note}"
    result, provider = await ai_chat(system, prompt)
    model_violation = False
    potassium = f"{assessment.get('potassium_mEq_L', 5.2):.1f}"
    reason = f"Lisinopril was presented as an active order despite potassium {potassium} mEq/L."
    if result:
        try:
            parsed = json.loads(re.search(r"\{.*\}", result, re.S).group(0))
            model_violation = parsed.get("violation") is True
            reason = parsed.get("reason") or reason
        except (AttributeError, json.JSONDecodeError):
            model_violation = result.lower().startswith("yes")
    lowered = note.lower()
    unsafe_order = any(
        re.search(r"(?:start|prescribe|issue)\s+lisinopril", line)
        and "blocked" not in line
        and "not issued" not in line
        for line in lowered.splitlines()
    )
    missing_safety = assessment["high_risk"] and not all(x in lowered for x in [potassium, "escalation", "clinician"])
    # The LLM is advisory to the safety rule. A malformed or contradictory model
    # verdict must never route an unrelated patient into the Lisinopril replan.
    if not assessment["high_risk"]:
        model_violation = False
        reason = "No evidence-backed Lisinopril contraindication exists for this patient."
    model = GEMINI_MODEL if provider == "gemini" else OLLAMA_MODEL if provider == "ollama" else "rule-based fallback"
    return {"violation": model_violation or unsafe_order or missing_safety, "reason": reason, "provider": provider, "model": model, "model_available": result is not None}


def validation_checks(note: str, assessment: dict[str, Any], prescription: dict[str, Any], case_id: str = CASE_ID) -> list[dict[str, Any]]:
    lowered = note.lower()
    if not assessment["high_risk"]:
        case = get_case(case_id)
        generic_checks = [
            ("Patient identity linkage", case["patient_id"] in preconsult_summary(case_id)),
            ("Prior-condition continuity", "previously documented" in lowered),
            ("Medication history", "medication" in lowered),
            ("Allergy cross-check", "allerg" in lowered),
            ("Vital-sign grounding", "blood pressure" in lowered),
            ("Diagnostic result review", "diagnostic" in lowered),
            ("Risk-factor synthesis", bool(case["insights"].get("risk_level"))),
            ("No unsupported prescription", prescription["status"] == "not_proposed"),
            ("No medication execution", not prescription["issued"]),
            ("Clinician verification", "clinician" in lowered),
            ("Diagnostic restraint", "no new diagnosis" in lowered),
            ("Required sections", all(x in lowered for x in ["subjective", "objective", "assessment", "follow-up"])),
            ("Follow-up continuity", "follow-up" in lowered),
            ("Action authority", "no autonomous treatment change" in lowered),
        ]
        return [{"name": name, "passed": passed} for name, passed in generic_checks]
    potassium = f"{assessment['potassium_mEq_L']:.1f}"
    return [
        {"name": "Patient identity linkage", "passed": get_case(case_id)["patient_id"] in preconsult_summary(case_id)},
        {"name": "Prior-condition continuity", "passed": "previously documented hypertension" in lowered},
        {"name": "Medication history", "passed": "amlodipine" in lowered},
        {"name": "Allergy cross-check", "passed": "allergy" in lowered and "angioedema" in lowered},
        {"name": "Vital-sign grounding", "passed": "168/96" in lowered},
        {"name": "Abnormal lab alert", "passed": assessment["abnormal_diagnostic_alert"] and potassium in lowered},
        {"name": "Contraindication rule", "passed": assessment["high_risk"] and "5.0" in lowered},
        {"name": "Prescription extraction", "passed": prescription["electronically_recorded"] and "lisinopril 10 mg" in lowered},
        {"name": "Prescription execution block", "passed": prescription["status"] == "blocked" and "not issued" in lowered},
        {"name": "Escalation language", "passed": "escalation" in lowered},
        {"name": "Review owner", "passed": "clinician acknowledgement" in lowered},
        {"name": "Diagnostic restraint", "passed": "no new diagnosis" in lowered},
        {"name": "Required sections", "passed": all(x in lowered for x in ["subjective", "objective", "assessment", "follow-up"])},
        {"name": "Action authority", "passed": "no autonomous treatment change" in lowered},
    ]


def unified_diff(before: str, after: str, before_label: str, after_label: str) -> str:
    return "\n".join(difflib.unified_diff(before.splitlines(), after.splitlines(), fromfile=before_label, tofile=after_label, lineterm=""))


def create_run(case_id: str, actor_id: str, actor_role: str) -> str:
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    now = utc_now()
    with db() as connection:
        connection.execute(
            "INSERT INTO runs(id,case_id,actor_id,actor_role,status,current_stage,state_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (run_id, case_id, actor_id, actor_role, "queued", "normalize", "{}", now, now),
        )
        audit(connection, actor_id=actor_id, actor_role=actor_role, action="create", resource_type="run", resource_id=run_id, run_id=run_id, after={"case_id": case_id})
    return run_id


def emit(run_id: str, sequence: int, payload: dict[str, Any], event_type: str = "trace") -> None:
    with db() as connection:
        connection.execute("INSERT INTO events(run_id,sequence,event_type,payload_json,created_at) VALUES(?,?,?,?,?)", (run_id, sequence, event_type, json.dumps(payload), utc_now()))
        if event_type == "trace":
            connection.execute("UPDATE runs SET current_stage=?,updated_at=? WHERE id=?", (payload.get("stage_name", "running"), utc_now(), run_id))


async def execute_run(run_id: str, case_id: str, failure_demo: bool, actor_id: str, actor_role: str) -> None:
    sequence = 0
    started = datetime.now(timezone.utc)
    with db() as connection:
        connection.execute("UPDATE runs SET status='running',updated_at=? WHERE id=?", (utc_now(), run_id))

    async def push(payload: dict[str, Any]) -> None:
        nonlocal sequence
        sequence += 1
        occurred_at = utc_now()
        payload["occurred_at"] = occurred_at
        payload["at"] = occurred_at
        emit(run_id, sequence, payload)
        await asyncio.sleep(TRACE_DELAY)

    async def logged_node(name: str, state: GraphState, operation) -> GraphState:
        before = {k: v for k, v in state.items() if k not in {"draft", "note"}}
        with db() as connection:
            audit(connection, actor_id="ai-agent", actor_role="agent", action="node_start", resource_type="workflow", resource_id=run_id, run_id=run_id, node_name=name, before=before)
        result = await operation(state)
        with db() as connection:
            audit(connection, actor_id="ai-agent", actor_role="agent", action="node_complete", resource_type="workflow", resource_id=run_id, run_id=run_id, node_name=name, before=before, after=result)
        return result

    async def normalize_node(state: GraphState) -> GraphState:
        normalized = normalize_records(case_id)
        await push({"kind": "action", "stage": 0, "stage_name": "normalize", "title": "Constructed longitudinal patient state", "text": f"Linked CSV patient {normalized['case']['patient_id']} and mapped {normalized['fact_count']} facts across {normalized['source_count']} records.", "insight": f"{EHR_IMPORT_LIMIT:,}-patient registry available in SQLite", "tool": "record.normalize()", "score": "0.98"})
        return {**state, "normalized": normalized}

    async def summary_node(state: GraphState) -> GraphState:
        summary = preconsult_summary(case_id)
        await push({"kind": "action", "stage": 0, "stage_name": "pre_summary", "title": "Generated pre-consultation patient summary", "text": summary, "insight": "Built before processing today's transcript", "tool": "summary.preconsult()", "score": "0.96"})
        return {**state, "preconsult_summary": summary}

    async def reconcile_node(state: GraphState) -> GraphState:
        assessment = clinical_assessment(case_id)
        await push({"kind": "conflict" if assessment["high_risk"] else "action", "stage": 1, "stage_name": "reconcile", "title": "High-risk Lisinopril contraindication detected" if assessment["high_risk"] else "Longitudinal risks reconciled", "text": "; ".join(assessment["contraindications"]) if assessment["high_risk"] else "No medication contradiction was found; patient-specific condition, laboratory, medication and allergy facts were retained.", "insight": "Abnormal diagnostic result contradicts transcript" if assessment["high_risk"] else "No accountable review gate required", "tool": "clinical_rules.reconcile()", "score": f"{assessment['confidence']:.2f}", "data": assessment})
        return {**state, "assessment": assessment}

    async def ground_node(state: GraphState) -> GraphState:
        evidence = evidence_retrieve(case_id)
        knowledge = policy_retrieve("Lisinopril potassium renal allergy contraindication follow-up documentation", 3)
        await push({"kind": "evidence", "stage": 2, "stage_name": "ground", "title": "Retrieved clinical and policy evidence", "text": f"{len(evidence)} longitudinal records and {len(knowledge)} ranked policy sections returned with provenance.", "insight": "Lab, allergy, medication, prior note, transcript and guideline linked", "tool": "evidence.retrieve() + policy.retrieve()", "score": "0.99", "data": {"evidence": evidence, "knowledge": knowledge}})
        return {**state, "evidence": evidence, "knowledge": knowledge}

    async def compose_node(state: GraphState) -> GraphState:
        prescription = prescription_candidate(case_id, state["assessment"])
        draft, provider = await documentation_agent({"preconsult_summary": state["preconsult_summary"], "case": state["normalized"]["case"], "facts": state["normalized"]["facts"], "assessment": state["assessment"], "policy_evidence": state["knowledge"]})
        if failure_demo:
            draft += "\nORDER: Start Lisinopril 10 mg orally once daily."
        with db() as connection:
            connection.execute("INSERT INTO prescriptions(run_id,case_id,medication,dose,route,frequency,status,block_reason,created_at) VALUES(?,?,?,?,?,?,?,?,?)", (run_id, case_id, prescription["medication"], prescription["dose"], prescription["route"], prescription["frequency"], prescription["status"], prescription["block_reason"], utc_now()))
            connection.execute("INSERT INTO notes(run_id,case_id,version,body,status,created_at) VALUES(?,?,?,?,?,?)", (run_id, case_id, 1, draft, "candidate", utc_now()))
        await push({"kind": "action", "stage": 3, "stage_name": "compose", "title": "Drafted note and electronic prescription candidate" if state["assessment"]["high_risk"] else "Drafted patient-specific longitudinal note", "text": f"{prescription['medication']} {prescription['dose']} was extracted and stored with status {prescription['status'].upper()}." if state["assessment"]["high_risk"] else "The selected patient’s diagnosis, investigations, medication, allergies and follow-up context were assembled without proposing a new order.", "insight": "Digital order recorded but not issued" if state["assessment"]["high_risk"] else "Individual EHR context preserved", "tool": f"{provider}.documentation()", "score": "0.93", "data": {"draft": draft, "prescription": prescription}})
        return {**state, "prescription": prescription, "draft": draft, "draft_provider": provider}

    async def verify_node(state: GraphState) -> GraphState:
        verdict = await verifier_agent(state["draft"], state["assessment"])
        if verdict["violation"]:
            await push({"kind": "failure", "stage": 4, "stage_name": "verify", "title": "Verifier blocked unsafe Lisinopril order", "text": verdict["reason"], "insight": "ACE-K-01 failed · replan required", "tool": f"{verdict['provider']}.verifier()", "score": "BLOCK", "data": verdict})
        return {**state, "verdict": verdict}

    async def replan_node(state: GraphState) -> GraphState:
        revised, provider = await documentation_agent({
            "draft": state["draft"],
            "assessment": state["assessment"],
            "evidence": state["evidence"],
            "policy_evidence": state["knowledge"],
            "preconsult_summary": state["preconsult_summary"],
            "case": state["normalized"]["case"],
            "facts": state["normalized"]["facts"],
        }, revision=True, violation=state["verdict"]["reason"])
        with db() as connection:
            connection.execute("UPDATE notes SET status='rejected' WHERE run_id=? AND version=1", (run_id,))
            connection.execute("INSERT INTO notes(run_id,case_id,version,body,status,created_at) VALUES(?,?,?,?,?,?)", (run_id, case_id, 2, revised, "verified_with_escalation", utc_now()))
            connection.execute("INSERT INTO note_diffs(run_id,from_label,to_label,diff_text,created_at) VALUES(?,?,?,?,?)", (run_id, "draft-v1", "draft-v2", unified_diff(state["draft"], revised, "draft-v1", "draft-v2"), utc_now()))
            transcript = next(x["payload"]["excerpt"] for x in state["evidence"] if x["source_type"] == "transcript")
            connection.execute("INSERT INTO note_diffs(run_id,from_label,to_label,diff_text,created_at) VALUES(?,?,?,?,?)", (run_id, "raw-transcript", "final-draft", unified_diff(transcript, revised, "raw-transcript", "final-draft"), utc_now()))
            connection.execute("INSERT INTO conflicts(case_id,run_id,field,status,inferred_value) VALUES(?,?,?,?,?)", (case_id, run_id, state["assessment"]["field"], "open", state["assessment"]["inferred_value"]))
        await push({"kind": "replan", "stage": 4, "stage_name": "replan", "title": "Replanned note with blocked prescription and escalation", "text": "The unsafe order became a non-issued electronic candidate; abnormal potassium, guideline threshold and clinician-owned follow-up were added.", "insight": "Draft v1 → verifier → draft v2 diff persisted", "tool": f"{provider}.replan()", "score": "0.99", "data": {"draft": revised}})
        return {**state, "note": revised}

    async def commit_node(state: GraphState) -> GraphState:
        note = state.get("note") or state["draft"]
        if not state.get("note"):
            with db() as connection:
                connection.execute("UPDATE notes SET status='verified' WHERE run_id=? AND version=1", (run_id,))
                if state["assessment"]["high_risk"]:
                    connection.execute("INSERT INTO conflicts(case_id,run_id,field,status,inferred_value) VALUES(?,?,?,?,?)", (case_id, run_id, state["assessment"]["field"], "open", state["assessment"]["inferred_value"]))
        checks = validation_checks(note, state["assessment"], state["prescription"], case_id)
        passed = sum(bool(check["passed"]) for check in checks)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        final = {**state, "note": note, "checks": checks, "passed": passed, "elapsed": elapsed, "workflow_engine": "langgraph" if StateGraph else "explicit-state-graph", "providers": {"documentation": state["draft_provider"], "verifier": state["verdict"]["provider"]}}
        with db() as connection:
            triage_pending = connection.execute(
                """SELECT c.key_signal FROM cases c WHERE c.id=? AND c.status='Needs review'
                   AND NOT EXISTS(SELECT 1 FROM review_acknowledgements a WHERE a.case_id=c.id)""",
                (case_id,),
            ).fetchone()
            next_status = "Review gate" if state["assessment"]["high_risk"] else "Needs review" if triage_pending else "Complete"
            next_signal = triage_pending["key_signal"] if triage_pending and not state["assessment"]["high_risk"] else state["assessment"]["inferred_value"]
            connection.execute(
                "UPDATE cases SET status=?,key_signal=?,updated_at=? WHERE id=?",
                (next_status, next_signal, utc_now(), case_id),
            )
        await push({"kind": "success", "stage": 5, "stage_name": "complete", "title": "Documentation complete; clinical action remains blocked" if state["assessment"]["high_risk"] else "Documentation complete; record verified", "text": f"{passed}/{len(checks)} checks pass. The Lisinopril candidate is recorded but not issued." if state["assessment"]["high_risk"] else f"{passed}/{len(checks)} checks pass. No autonomous clinical action was taken.", "insight": "Ready for clinician acknowledgement" if state["assessment"]["high_risk"] else "Patient-specific record committed", "tool": "state.commit()", "score": f"{passed}/{len(checks)}", "data": final})
        return final

    nodes = {"normalize": normalize_node, "pre_summary": summary_node, "reconcile": reconcile_node, "ground": ground_node, "compose": compose_node, "verify": verify_node, "replan": replan_node, "commit": commit_node}

    async def invoke(name: str, state: GraphState) -> GraphState:
        return await logged_node(name, state, nodes[name])

    initial: GraphState = {"run_id": run_id, "case_id": case_id, "actor_id": actor_id, "actor_role": actor_role, "failure_demo": failure_demo}
    try:
        if StateGraph:
            graph = StateGraph(GraphState)
            for name in nodes:
                async def wrapped(state: GraphState, node_name=name) -> GraphState:
                    return await invoke(node_name, state)
                graph.add_node(name, wrapped)
            graph.set_entry_point("normalize")
            graph.add_edge("normalize", "pre_summary")
            graph.add_edge("pre_summary", "reconcile")
            graph.add_edge("reconcile", "ground")
            graph.add_edge("ground", "compose")
            graph.add_edge("compose", "verify")
            graph.add_conditional_edges("verify", lambda state: "replan" if state["verdict"]["violation"] else "commit", {"replan": "replan", "commit": "commit"})
            graph.add_edge("replan", "commit")
            graph.add_edge("commit", END)
            final_state = await graph.compile().ainvoke(initial)
        else:
            final_state = initial
            for name in ["normalize", "pre_summary", "reconcile", "ground", "compose", "verify"]:
                final_state = await invoke(name, final_state)
            if final_state["verdict"]["violation"]:
                final_state = await invoke("replan", final_state)
            final_state = await invoke("commit", final_state)
        with db() as connection:
            connection.execute("UPDATE runs SET status='complete',current_stage='complete',state_json=?,updated_at=? WHERE id=?", (json.dumps(final_state), utc_now(), run_id))
    except Exception as exc:
        failed_at = utc_now()
        emit(run_id, sequence + 1, {"kind": "failure", "stage": 0, "stage_name": "error", "occurred_at": failed_at, "at": failed_at, "title": "Agent execution stopped", "text": str(exc), "insight": "Exception persisted", "tool": "runtime.error()", "score": "ERROR"})
        with db() as connection:
            connection.execute("UPDATE runs SET status='failed',state_json=?,updated_at=? WHERE id=?", (json.dumps({"error": str(exc)}), utc_now(), run_id))
            audit(connection, actor_id="system", actor_role="system", action="run_failed", resource_type="run", resource_id=run_id, run_id=run_id, after={"error": str(exc)})


@app.get("/api/health")
async def health() -> dict[str, Any]:
    ollama_online = False
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            ollama_online = (await client.get(f"{OLLAMA_URL}/api/tags")).is_success
    except httpx.HTTPError:
        pass
    with db() as connection:
        patient_count = connection.execute("SELECT COUNT(*) AS count FROM patients").fetchone()["count"]
        case_count = connection.execute("SELECT COUNT(*) AS count FROM cases").fetchone()["count"]
        knowledge_count = connection.execute("SELECT COUNT(*) AS count FROM knowledge_chunks").fetchone()["count"]
        orders_issued = connection.execute("SELECT COUNT(*) AS count FROM care_orders WHERE status='issued'").fetchone()["count"]
    provider = "gemini" if GOOGLE_API_KEY and AI_PROVIDER in {"auto", "gemini"} else "ollama" if ollama_online and AI_PROVIDER in {"auto", "ollama"} else "deterministic"
    return {"status": "ok", "database": str(DB_PATH), "ehr_patients": patient_count, "case_registry": case_count, "ehr_import_target": EHR_IMPORT_LIMIT, "orders_issued": orders_issued, "ai_provider": provider, "ai_available": provider != "deterministic", "workflow_engine": "langgraph" if StateGraph else "explicit-state-graph", "knowledge_chunks": knowledge_count, "synthetic_only": True}


@app.get("/api/patients")
def list_patients(request: Request, limit: int = 25, offset: int = 0, q: str = "") -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "health_worker", "admin"})
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    needle = q.strip().lower()
    with db() as connection:
        if needle:
            pattern = f"%{needle}%"
            rows = connection.execute(
                "SELECT patient_id,profile_json FROM patients WHERE lower(patient_id) LIKE ? OR lower(profile_json) LIKE ? ORDER BY patient_id LIMIT ? OFFSET ?",
                (pattern, pattern, safe_limit, safe_offset),
            ).fetchall()
            total = connection.execute(
                "SELECT COUNT(*) AS count FROM patients WHERE lower(patient_id) LIKE ? OR lower(profile_json) LIKE ?",
                (pattern, pattern),
            ).fetchone()["count"]
        else:
            rows = connection.execute("SELECT patient_id,profile_json FROM patients ORDER BY patient_id LIMIT ? OFFSET ?", (safe_limit, safe_offset)).fetchall()
            total = connection.execute("SELECT COUNT(*) AS count FROM patients").fetchone()["count"]
        audit(connection, actor_id=actor_id, actor_role=role, action="read", resource_type="patient_registry", resource_id="cohort", metadata={"limit": safe_limit, "offset": safe_offset, "query": needle})
    return {"count": total, "limit": safe_limit, "offset": safe_offset, "query": needle, "results": [{"patient_id": row["patient_id"], **json.loads(row["profile_json"])} for row in rows]}


@app.post("/api/patients/{patient_id}/case", status_code=201)
def open_patient_case(patient_id: str, request: Request) -> dict[str, Any]:
    """Provision or reuse a workspace when a clinician opens a cohort row."""
    actor_id, role = require_role(request, {"clinician", "health_worker", "admin"})
    with db() as connection:
        before = connection.execute("SELECT id FROM cases WHERE patient_id=?", (patient_id,)).fetchone()
        case_id = provision_patient_case(connection, patient_id)
        audit(
            connection, actor_id=actor_id, actor_role=role,
            action="read" if before else "create", resource_type="case", resource_id=case_id,
            after={"patient_id": patient_id, "provisioned": not bool(before)},
        )
    return {"caseId": case_id, "patientId": patient_id, "created": not bool(before)}


@app.get("/api/knowledge/search")
def knowledge_search(request: Request, q: str, limit: int = 3) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "health_worker", "admin"})
    hits = policy_retrieve(q, limit)
    with db() as connection:
        audit(connection, actor_id=actor_id, actor_role=role, action="read", resource_type="knowledge", resource_id=q, after={"hits": len(hits)})
    return {"query": q, "count": len(hits), "results": hits, "advisory": "Documentation support only; never autonomous treatment authority."}


@app.get("/api/cases")
def case_registry(request: Request, limit: int = CASE_REGISTRY_LIMIT, offset: int = 0) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "health_worker", "admin"})
    safe_limit = max(1, min(limit, CASE_REGISTRY_LIMIT))
    with db() as connection:
        rows = connection.execute(
            """SELECT c.id,c.patient_id,c.display_name,c.care_setting,c.objective,c.status,c.key_signal,c.updated_at,
                      p.profile_json,
                      EXISTS(SELECT 1 FROM conflicts f WHERE f.case_id=c.id AND f.status='open') AS has_open_review
               FROM cases c LEFT JOIN patients p ON p.patient_id=c.patient_id
               ORDER BY c.id LIMIT ? OFFSET ?""",
            (safe_limit, max(0, offset)),
        ).fetchall()
        total = connection.execute("SELECT COUNT(*) AS count FROM cases").fetchone()["count"]
        safety_reviews = connection.execute("SELECT COUNT(DISTINCT case_id) AS count FROM conflicts WHERE status='open'").fetchone()["count"]
        triage_reviews = connection.execute(
            """SELECT COUNT(*) AS count FROM cases c WHERE c.status='Needs review'
               AND NOT EXISTS(SELECT 1 FROM conflicts f WHERE f.case_id=c.id AND f.status='open')
               AND NOT EXISTS(SELECT 1 FROM review_acknowledgements a WHERE a.case_id=c.id)"""
        ).fetchone()["count"]
        open_reviews = safety_reviews + triage_reviews
        audit(connection, actor_id=actor_id, actor_role=role, action="read", resource_type="case_registry", resource_id="registry", metadata={"limit": safe_limit, "offset": offset})
    results = []
    for index, row in enumerate(rows):
        item = dict(row)
        profile = json.loads(item.pop("profile_json") or "{}")
        status = "Review gate" if item.pop("has_open_review") else (item.get("status") or "Draft")
        names = item["display_name"].split()
        item.update({
            "status": status,
            "initials": "".join(part[0] for part in names[:2]).upper(),
            "tone": "amber" if status in {"Review gate", "Needs review", "Draft"} else "blue" if status == "Running" else "green",
            "age": profile.get("age"), "sex": profile.get("sex"),
            "diagnosis": profile.get("primary_diagnosis"), "condition_status": profile.get("condition_status"),
            "updated_label": f"{2 + index * 3}m ago" if index < 20 else f"{1 + index // 12}h ago",
        })
        results.append(item)
    return {"count": total, "open_reviews": open_reviews, "results": results}


@app.get("/api/reviews/open")
def open_reviews(request: Request) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "admin"})
    with db() as connection:
        rows = connection.execute(
            """SELECT f.id,f.case_id,f.run_id,f.field,f.inferred_value,c.display_name,c.key_signal,
                      p.medication,p.dose,p.status AS prescription_status,p.block_reason
               FROM conflicts f JOIN cases c ON c.id=f.case_id
               LEFT JOIN prescriptions p ON p.id=(SELECT id FROM prescriptions WHERE case_id=f.case_id ORDER BY id DESC LIMIT 1)
               WHERE f.status='open'
                 AND f.id=(SELECT MAX(newest.id) FROM conflicts newest WHERE newest.case_id=f.case_id AND newest.status='open')
               ORDER BY f.id DESC"""
        ).fetchall()
        triage_rows = connection.execute(
            """SELECT c.id AS case_id,c.display_name,c.key_signal,c.status,c.objective
               FROM cases c
               WHERE c.status='Needs review'
                 AND NOT EXISTS(SELECT 1 FROM conflicts f WHERE f.case_id=c.id AND f.status='open')
                 AND NOT EXISTS(SELECT 1 FROM review_acknowledgements a WHERE a.case_id=c.id)
               ORDER BY c.updated_at DESC LIMIT 20"""
        ).fetchall()
        results = [{**dict(row), "review_type": "safety_conflict"} for row in rows]
        results.extend({
            "id": f"triage-{row['case_id']}", "case_id": row["case_id"], "display_name": row["display_name"],
            "key_signal": row["key_signal"], "inferred_value": row["key_signal"], "review_type": "clinical_triage",
            "block_reason": row["objective"], "prescription_status": None,
        } for row in triage_rows)
        audit(connection, actor_id=actor_id, actor_role=role, action="read", resource_type="review_queue", resource_id="open", after={"count": len(results)})
    return {"count": len(results), "results": results}


@app.post("/api/reviews/acknowledge")
def acknowledge_triage(payload: ReviewAcknowledgeRequest, request: Request) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician"})
    if payload.action not in {"acknowledge_risk_review", "request_record_update"}:
        raise HTTPException(422, "Unsupported patient-review action")
    with db() as connection:
        case = connection.execute(
            "SELECT id,status,key_signal,objective FROM cases WHERE id=?",
            (payload.case_id,),
        ).fetchone()
        if not case:
            raise HTTPException(404, "Synthetic case not found")
        if case["status"] != "Needs review":
            raise HTTPException(409, "This patient has no open longitudinal review")
        acknowledged_at = utc_now()
        before = dict(case)
        connection.execute(
            """INSERT INTO review_acknowledgements(case_id,action,reviewer,comment,acknowledged_at)
               VALUES(?,?,?,?,?) ON CONFLICT(case_id) DO UPDATE SET
               action=excluded.action,reviewer=excluded.reviewer,
               comment=excluded.comment,acknowledged_at=excluded.acknowledged_at""",
            (payload.case_id, payload.action, payload.reviewer, payload.comment, acknowledged_at),
        )
        follow_up = "Record update requested" if payload.action == "request_record_update" else "Longitudinal risk reviewed"
        connection.execute(
            "UPDATE cases SET status='Complete',key_signal=?,updated_at=? WHERE id=?",
            (follow_up, acknowledged_at, payload.case_id),
        )
        order_type = "record_update" if payload.action == "request_record_update" else "continued_follow_up"
        order_description = "Obtain updated clinical records before the next documentation cycle" if payload.action == "request_record_update" else f"Continue clinician-owned follow-up: {case['objective']}"
        connection.execute(
            """INSERT INTO care_orders(case_id,order_type,description,status,issued_by,issued_at)
               VALUES(?,?,?,?,?,?) ON CONFLICT(case_id,order_type) DO UPDATE SET
               description=excluded.description,status=excluded.status,
               issued_by=excluded.issued_by,issued_at=excluded.issued_at""",
            (payload.case_id, order_type, order_description, "issued", payload.reviewer, acknowledged_at),
        )
        after = {"status": "Complete", "key_signal": follow_up, "action": payload.action, "comment": payload.comment}
        audit(
            connection, actor_id=actor_id, actor_role=role, action="acknowledge",
            resource_type="clinical_triage", resource_id=payload.case_id,
            before=before, after=after, metadata={"reviewer": payload.reviewer},
        )
        audit(
            connection, actor_id=actor_id, actor_role=role, action="issue",
            resource_type="care_order", resource_id=f"{payload.case_id}:{order_type}",
            after={"description": order_description, "status": "issued"},
            metadata={"reviewer": payload.reviewer, "review_action": payload.action},
        )
        safety_remaining = connection.execute(
            "SELECT COUNT(DISTINCT case_id) AS count FROM conflicts WHERE status='open'"
        ).fetchone()["count"]
        triage_remaining = connection.execute(
            """SELECT COUNT(*) AS count FROM cases c
               WHERE c.status='Needs review'
                 AND NOT EXISTS(SELECT 1 FROM review_acknowledgements a WHERE a.case_id=c.id)"""
        ).fetchone()["count"]
        orders_issued = connection.execute("SELECT COUNT(*) AS count FROM care_orders WHERE status='issued'").fetchone()["count"]
    return {
        "status": "acknowledged", "caseId": payload.case_id, "action": payload.action,
        "reviewer": payload.reviewer, "acknowledgedAt": acknowledged_at,
        "queueRemaining": safety_remaining + triage_remaining, "ordersIssued": orders_issued,
    }


@app.get("/api/cases/{case_id}/report.pdf")
def export_case_report(case_id: str, request: Request) -> Response:
    """Export the latest completed, patient-specific clinical record as a styled PDF."""
    actor_id, role = require_role(request, {"clinician", "admin"})
    case = get_case(case_id)
    records = get_records(case_id)
    with db() as connection:
        run = connection.execute(
            "SELECT id,state_json,updated_at FROM runs WHERE case_id=? AND status='complete' ORDER BY updated_at DESC LIMIT 1",
            (case_id,),
        ).fetchone()
        if not run:
            raise HTTPException(409, "Complete the agent run before exporting the final report")
        run_state = json.loads(run["state_json"] or "{}")
        latest_note = connection.execute(
            "SELECT body,status,created_at FROM notes WHERE case_id=? ORDER BY id DESC LIMIT 1",
            (case_id,),
        ).fetchone()
        if latest_note:
            run_state["note"] = latest_note["body"]
            run_state["note_status"] = latest_note["status"]
        case_data = {
            "caseId": case_id,
            "patient": case,
            "records": records,
            "preconsultSummary": preconsult_summary(case_id),
            "assessment": clinical_assessment(case_id),
            "insights": case["insights"],
        }
        report = build_clinical_report_pdf(case_data, run_state, generated_at=utc_now())
        audit(
            connection, actor_id=actor_id, actor_role=role, action="export",
            resource_type="clinical_report", resource_id=case_id, run_id=run["id"],
            after={"format": "pdf", "bytes": len(report), "patient_id": case["patient_id"]},
        )
    safe_case = re.sub(r"[^A-Za-z0-9_-]", "-", case_id)
    safe_patient = re.sub(r"[^A-Za-z0-9_-]", "-", case["patient_id"])
    filename = f"CareTrace_{safe_case}_{safe_patient}_final-report.pdf"
    return Response(
        content=report,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@app.get("/api/cases/{case_id}")
def case_detail(case_id: str, request: Request) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "health_worker", "admin"})
    case = get_case(case_id)
    records = get_records(case_id)
    with db() as connection:
        audit(connection, actor_id=actor_id, actor_role=role, action="read", resource_type="case", resource_id=case_id, after={"record_count": len(records)})
    return {"caseId": case_id, "patient": case, "records": records, "preconsultSummary": preconsult_summary(case_id), "assessment": clinical_assessment(case_id), "insights": case["insights"]}


@app.post("/api/runs", status_code=202)
async def start_run(payload: RunRequest, background_tasks: BackgroundTasks, request: Request) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "health_worker"})
    get_case(payload.case_id)
    run_id = create_run(payload.case_id, actor_id, role)
    # The deliberate unsafe draft exists only to demonstrate verifier/replan behavior
    # for the designated synthetic Lisinopril case. API callers cannot inject it into
    # another patient's documentation by setting failureDemo=true.
    effective_failure_demo = payload.failure_demo and payload.case_id == CASE_ID
    background_tasks.add_task(execute_run, run_id, payload.case_id, effective_failure_demo, actor_id, role)
    return {"runId": run_id, "status": "queued", "eventsUrl": f"/api/runs/{run_id}/events"}


@app.get("/api/runs/{run_id}")
def run_state(run_id: str, request: Request) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "health_worker", "admin"})
    with db() as connection:
        row = connection.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        event_rows = connection.execute("SELECT sequence,payload_json FROM events WHERE run_id=? ORDER BY sequence", (run_id,)).fetchall()
        if row:
            audit(connection, actor_id=actor_id, actor_role=role, action="read", resource_type="run", resource_id=run_id, run_id=run_id)
    if not row:
        raise HTTPException(404, "Run not found")
    return {**dict(row), "state": json.loads(row["state_json"]), "events": [json.loads(event["payload_json"]) for event in event_rows]}


@app.get("/api/runs/{run_id}/audit")
def run_audit(run_id: str, request: Request) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "admin"})
    with db() as connection:
        rows = connection.execute("SELECT * FROM audit_log WHERE run_id=? ORDER BY id", (run_id,)).fetchall()
        diffs = connection.execute("SELECT from_label,to_label,diff_text,created_at FROM note_diffs WHERE run_id=? ORDER BY id", (run_id,)).fetchall()
        audit(connection, actor_id=actor_id, actor_role=role, action="read", resource_type="audit", resource_id=run_id, run_id=run_id)
    return {"runId": run_id, "events": [dict(row) for row in rows], "diffs": [dict(row) for row in diffs]}


@app.get("/api/runs/{run_id}/events")
async def run_events(run_id: str, request: Request) -> StreamingResponse:
    require_role(request, {"clinician", "health_worker", "admin"})
    with db() as connection:
        exists = connection.execute("SELECT 1 FROM runs WHERE id=?", (run_id,)).fetchone()
    if not exists:
        raise HTTPException(404, "Run not found")

    async def stream():
        last_sequence = 0
        while not await request.is_disconnected():
            with db() as connection:
                rows = connection.execute("SELECT sequence,event_type,payload_json FROM events WHERE run_id=? AND sequence>? ORDER BY sequence", (run_id, last_sequence)).fetchall()
                run = connection.execute("SELECT status,state_json FROM runs WHERE id=?", (run_id,)).fetchone()
            for row in rows:
                last_sequence = row["sequence"]
                yield f"id: {last_sequence}\nevent: {row['event_type']}\ndata: {row['payload_json']}\n\n"
            if run["status"] in {"complete", "failed"} and not rows:
                yield f"event: complete\ndata: {json.dumps({'status': run['status'], 'state': json.loads(run['state_json'])})}\n\n"
                break
            yield ": heartbeat\n\n"
            await asyncio.sleep(0.3)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/cases/{case_id}/inject")
def inject_source(case_id: str, payload: InjectRequest, request: Request) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "health_worker"})
    get_case(case_id)
    observed = utc_now()
    body = {"potassium_mEq_L": payload.potassium, "potassium_flag": "HIGH" if payload.potassium > 5.0 else "NORMAL", "status": "new_update"}
    with db() as connection:
        before = connection.execute("SELECT payload_json FROM records WHERE case_id=? AND source_name=?", (case_id, payload.source)).fetchone()
        connection.execute("INSERT INTO records(case_id,source_type,source_name,observed_at,reliability,payload_json) VALUES(?,?,?,?,?,?) ON CONFLICT(case_id,source_name) DO UPDATE SET observed_at=excluded.observed_at,reliability=excluded.reliability,payload_json=excluded.payload_json", (case_id, "external_update", payload.source, observed, 0.96, json.dumps(body)))
        audit(connection, actor_id=actor_id, actor_role=role, action="update", resource_type="clinical_record", resource_id=payload.source, before=before["payload_json"] if before else None, after=body)
    return {"status": "injected", "caseId": case_id, "source": payload.source, "potassium": payload.potassium, "observedAt": observed, "assessment": clinical_assessment(case_id)}


def parse_synthetic_lab(filename: str, raw: bytes) -> dict[str, Any]:
    """Extract a bounded potassium result from JSON, CSV, TXT, or PDF bytes."""
    suffix = Path(filename).suffix.lower()
    text = ""
    structured: dict[str, Any] = {}
    try:
        if suffix == ".json":
            value = json.loads(raw.decode("utf-8-sig"))
            structured = value[0] if isinstance(value, list) and value else value
            if not isinstance(structured, dict):
                structured = {}
            text = json.dumps(structured)
        elif suffix == ".csv":
            row = next(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))), None)
            structured = dict(row or {})
            text = json.dumps(structured)
        elif suffix == ".pdf":
            from pypdf import PdfReader
            text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(raw)).pages)
        elif suffix in {".txt", ".lab"}:
            text = raw.decode("utf-8-sig")
        else:
            raise HTTPException(415, "Use a synthetic JSON, CSV, TXT, LAB, or PDF report")
    except (UnicodeDecodeError, json.JSONDecodeError, StopIteration, ValueError) as exc:
        raise HTTPException(422, f"The synthetic laboratory file could not be parsed: {exc}") from exc

    normalized = {re.sub(r"[^a-z0-9]", "", str(key).lower()): value for key, value in structured.items()}
    potassium_value = next((normalized[key] for key in ("potassiummeql", "potassium", "serumpotassium") if key in normalized), None)
    crcl_value = next((normalized[key] for key in ("creatinineclearancemlmin", "creatinineclearance", "crcl") if key in normalized), None)
    if potassium_value is None or potassium_value == "":
        match = re.search(r"(?:serum\s+)?potassium[^0-9]{0,30}(\d+(?:\.\d+)?)", text, re.I)
        potassium_value = match.group(1) if match else None
    if crcl_value is None or crcl_value == "":
        match = re.search(r"(?:creatinine\s+clearance|crcl)[^0-9]{0,30}(\d+(?:\.\d+)?)", text, re.I)
        crcl_value = match.group(1) if match else None
    if potassium_value is None or potassium_value == "":
        raise HTTPException(422, "No potassium result was found in the uploaded synthetic report")
    try:
        potassium = float(str(potassium_value).strip())
        crcl = float(str(crcl_value).strip()) if crcl_value is not None and crcl_value != "" else None
    except ValueError as exc:
        raise HTTPException(422, "Potassium and creatinine clearance must be numeric") from exc
    if not 1.0 <= potassium <= 10.0:
        raise HTTPException(422, "Potassium result is outside the accepted synthetic-demo range")
    return {
        "potassium_mEq_L": potassium,
        "potassium_flag": "HIGH" if potassium > 5.0 else "NORMAL",
        "creatinine_clearance_mL_min": crcl,
        "report_id": f"UPLOAD-{stable_hash(raw)[:10].upper()}",
        "file_name": Path(filename).name,
        "synthetic": True,
        "status": "uploaded_update",
    }


@app.post("/api/cases/{case_id}/labs/upload")
async def upload_lab(case_id: str, request: Request) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician", "health_worker"})
    get_case(case_id)
    if request.headers.get("X-Synthetic-Data", "").lower() != "true":
        raise HTTPException(400, "Only explicitly synthetic/deidentified laboratory files are accepted")
    filename = Path(request.headers.get("X-Filename") or "synthetic_lab.json").name
    raw = await request.body()
    if not raw:
        raise HTTPException(400, "The uploaded laboratory file is empty")
    if len(raw) > 2_000_000:
        raise HTTPException(413, "Synthetic laboratory files are limited to 2 MB")
    body = parse_synthetic_lab(filename, raw)
    observed = utc_now()
    source_name = f"Uploaded lab · {filename}"
    with db() as connection:
        before = connection.execute("SELECT payload_json FROM records WHERE case_id=? AND source_name=?", (case_id, source_name)).fetchone()
        connection.execute(
            "INSERT INTO records(case_id,source_type,source_name,observed_at,reliability,payload_json) VALUES(?,?,?,?,?,?) ON CONFLICT(case_id,source_name) DO UPDATE SET observed_at=excluded.observed_at,reliability=excluded.reliability,payload_json=excluded.payload_json",
            (case_id, "external_update", source_name, observed, 0.99, json.dumps(body)),
        )
        audit(connection, actor_id=actor_id, actor_role=role, action="upload", resource_type="laboratory_report", resource_id=source_name, before=before["payload_json"] if before else None, after=body, metadata={"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "synthetic": True})
    return {"status": "uploaded", "caseId": case_id, "source": source_name, "observedAt": observed, "lab": body, "assessment": clinical_assessment(case_id)}


@app.post("/api/resolve-conflict")
def resolve_conflict(payload: ResolveRequest, request: Request) -> dict[str, Any]:
    actor_id, role = require_role(request, {"clinician"})
    if payload.action not in {"acknowledge_escalation", "order_repeat_lab", "cancel_candidate"}:
        raise HTTPException(422, "Unsupported clinical review action")
    with db() as connection:
        conflict = connection.execute("SELECT * FROM conflicts WHERE case_id=? AND status='open' ORDER BY id DESC LIMIT 1", (payload.case_id,)).fetchone()
        if not conflict:
            raise HTTPException(409, "No open escalation. Complete an agent run first.")
        resolved_at = utc_now()
        resolution = f"{payload.action}: {payload.comment}"
        connection.execute(
            "UPDATE conflicts SET status='acknowledged',resolved_value=?,reviewer=?,resolved_at=? WHERE case_id=? AND status='open'",
            (resolution, payload.reviewer, resolved_at, payload.case_id),
        )
        connection.execute(
            "UPDATE cases SET status='Complete',key_signal='Escalation acknowledged · order blocked',updated_at=? WHERE id=?",
            (resolved_at, payload.case_id),
        )
        note = connection.execute("SELECT * FROM notes WHERE run_id=? ORDER BY version DESC LIMIT 1", (conflict["run_id"],)).fetchone()
        final_body = note["body"] + f"\nCLINICIAN REVIEW: {payload.reviewer} acknowledged the escalation. {payload.comment}"
        connection.execute("INSERT INTO notes(run_id,case_id,version,body,status,created_at) VALUES(?,?,?,?,?,?)", (conflict["run_id"], payload.case_id, note["version"] + 1, final_body, "approved_with_block", resolved_at))
        connection.execute("INSERT INTO note_diffs(run_id,from_label,to_label,diff_text,created_at) VALUES(?,?,?,?,?)", (conflict["run_id"], f"draft-v{note['version']}", "clinician-approved", unified_diff(note["body"], final_body, f"draft-v{note['version']}", "clinician-approved"), resolved_at))
        if payload.action == "order_repeat_lab":
            connection.execute(
                """INSERT INTO care_orders(case_id,order_type,description,status,issued_by,issued_at)
                   VALUES(?,?,?,?,?,?) ON CONFLICT(case_id,order_type) DO UPDATE SET
                   description=excluded.description,status=excluded.status,
                   issued_by=excluded.issued_by,issued_at=excluded.issued_at""",
                (payload.case_id, "repeat_potassium", "Repeat serum potassium and reassess the blocked prescription candidate", "issued", payload.reviewer, resolved_at),
            )
            audit(
                connection, actor_id=actor_id, actor_role=role, action="issue",
                resource_type="care_order", resource_id=f"{payload.case_id}:repeat_potassium",
                run_id=conflict["run_id"], after={"description": "Repeat serum potassium", "status": "issued"},
                metadata={"reviewer": payload.reviewer, "prescription_remains_blocked": True},
            )
        audit(connection, actor_id=actor_id, actor_role=role, action="approve", resource_type="clinical_note", resource_id=str(note["id"]), run_id=conflict["run_id"], before=note["body"], after=final_body, metadata={"action": payload.action, "prescription_remains_blocked": True})
        safety_remaining = connection.execute("SELECT COUNT(DISTINCT case_id) AS count FROM conflicts WHERE status='open'").fetchone()["count"]
        triage_remaining = connection.execute(
            """SELECT COUNT(*) AS count FROM cases c WHERE c.status='Needs review'
               AND NOT EXISTS(SELECT 1 FROM review_acknowledgements a WHERE a.case_id=c.id)"""
        ).fetchone()["count"]
        remaining = safety_remaining + triage_remaining
        orders_issued = connection.execute("SELECT COUNT(*) AS count FROM care_orders WHERE status='issued'").fetchone()["count"]
    return {"status": "acknowledged", "caseId": payload.case_id, "action": payload.action, "reviewer": payload.reviewer, "resolvedAt": resolved_at, "prescriptionStatus": "blocked", "queueRemaining": remaining, "ordersIssued": orders_issued, "note": final_body}


def legacy_conflict_state(transcript: str, prior_records: str, new_fact: str = "") -> dict[str, Any]:
    combined = "\n".join(value for value in [transcript, prior_records, new_fact] if value)
    potassium_match = re.search(r"potassium[^\d]*(\d+(?:\.\d+)?)", combined, re.I)
    potassium = float(potassium_match.group(1)) if potassium_match else None
    lisinopril = "lisinopril" in combined.lower()
    blocked = bool(lisinopril and potassium is not None and potassium > 5.0)
    return {"field": "prescription.lisinopril.safety", "conflict": blocked, "values": [f"potassium {potassium}" if potassium is not None else "potassium unknown", "lisinopril proposed" if lisinopril else "no lisinopril"], "observations": [], "inferred_value": "BLOCKED" if blocked else "review", "confidence": 0.99 if blocked else 0.75, "adapted_to_new_source": bool(new_fact)}


async def legacy_workflow(payload: InitialConsultRequest, new_fact: str = "") -> dict[str, Any]:
    assessment = legacy_conflict_state(payload.transcript, payload.prior_records, new_fact)
    policy = policy_retrieve("Lisinopril potassium contraindication follow-up documentation", 3)
    note, provider = await documentation_agent({"transcript": payload.transcript, "prior_records": payload.prior_records, "new_fact": new_fact, "assessment": assessment, "policy_evidence": policy}, revision=assessment["conflict"], violation="Lisinopril with potassium above 5.0 requires a blocked candidate and clinician escalation.")
    return {"transcript": payload.transcript, "prior_records": payload.prior_records, "new_injected_fact": new_fact, "preconsult_summary": "Prior hypertension and medication history reviewed before transcript processing.", "reconciled_facts": f"Prescription safety state: {assessment['inferred_value']}", "conflicts_found": assessment["values"] if assessment["conflict"] else "NONE", "drafted_note": note, "action_list": "Block prescription candidate; acknowledge escalation; repeat potassium; reassess treatment.", "is_consistent": not assessment["conflict"], "escalation_flag": assessment["conflict"], "provider": provider, "policy_evidence": policy}


@app.post("/api/v1/clinical/reconcile")
async def legacy_reconcile(payload: InitialConsultRequest, request: Request) -> dict[str, Any]:
    require_role(request, {"clinician", "health_worker"})
    return await legacy_workflow(payload)


@app.post("/api/v1/clinical/inject-fact")
async def legacy_inject_fact(payload: InjectFactRequest, request: Request) -> dict[str, Any]:
    require_role(request, {"clinician", "health_worker"})
    return await legacy_workflow(payload, payload.new_injected_fact)


DIST = ROOT / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
