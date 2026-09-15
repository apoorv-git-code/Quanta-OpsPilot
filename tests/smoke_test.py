"""Dependency-light end-to-end acceptance test for the PS1 hackathon demo."""

from __future__ import annotations

import os
import sys
import tempfile
import asyncio
import importlib
from io import BytesIO
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

test_dir = tempfile.TemporaryDirectory(prefix="cairn-smoke-")
os.environ["CAIRN_DB_PATH"] = str(Path(test_dir.name) / "cairn.db")
os.environ["CAIRN_TRACE_DELAY"] = "0"
os.environ["AI_PROVIDER"] = "deterministic"
os.environ["CAIRN_EHR_IMPORT_LIMIT"] = "20000"

from fastapi.testclient import TestClient  # noqa: E402
from pypdf import PdfReader  # noqa: E402
from backend.app import app  # noqa: E402
app_module = importlib.import_module("backend.app")


CLINICIAN = {"X-User-Id": "dr-abhinav", "X-Role": "clinician"}
HEALTH_WORKER = {"X-User-Id": "worker-17", "X-Role": "health_worker"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


with TestClient(app) as client:
    health = client.get("/api/health").json()
    require(health["status"] == "ok", "health check failed")
    require(health["ehr_patients"] == 20000, "the complete 20,000-patient mock EHR was not imported")
    require(health["case_registry"] == 50, "exactly 50 patient-specific cases were not created")
    require(health["knowledge_chunks"] == 8, "policy corpus was not fully ingested")
    require(health["orders_issued"] == 0, "fresh database has an incorrect issued-order count")

    require(client.get("/api/patients").status_code == 403, "anonymous registry access was not blocked")
    registry = client.get("/api/patients", headers=HEALTH_WORKER, params={"limit": 10}).json()
    require(registry["count"] == 20000 and len(registry["results"]) == 10, "EHR registry pagination failed")
    search = client.get("/api/patients", headers=HEALTH_WORKER, params={"q": "UKP189058", "limit": 10}).json()
    require(search["count"] == 1 and search["results"][0]["patient_id"] == "UKP189058", "EHR registry search failed")

    cases = client.get("/api/cases", headers=HEALTH_WORKER, params={"limit": 50}).json()
    require(cases["count"] == 50 and len(cases["results"]) == 50, "50-case registry load failed")
    require(len({item["patient_id"] for item in cases["results"]}) == 50, "case registry reuses patient identity")
    for item in cases["results"]:
        detail = client.get(f"/api/cases/{item['id']}", headers=HEALTH_WORKER).json()
        require(detail["patient"]["patient_id"] == item["patient_id"], f"case {item['id']} opened the wrong patient")
        require(len(detail["records"]) >= 6 and detail["insights"]["diagnosis"], f"case {item['id']} lacks individual health insights")

    cohort_patient = client.get("/api/patients", headers=HEALTH_WORKER, params={"limit": 1, "offset": 101}).json()["results"][0]
    provisioned = client.post(f"/api/patients/{cohort_patient['patient_id']}/case", headers=HEALTH_WORKER)
    require(provisioned.status_code == 201, "clickable EHR patient could not provision a workspace")
    provisioned_detail = client.get(f"/api/cases/{provisioned.json()['caseId']}", headers=HEALTH_WORKER).json()
    require(provisioned_detail["patient"]["patient_id"] == cohort_patient["patient_id"] and len(provisioned_detail["records"]) == 7, "provisioned EHR workspace is incomplete")

    case = client.get("/api/cases/SIM-0427", headers=CLINICIAN).json()
    require(case["patient"]["patient_id"] == "UKP189058", "demo case was not linked to the CSV patient")
    require("hypertension" in case["preconsultSummary"].lower(), "pre-consult summary lacks chronic history")
    require(case["assessment"]["high_risk"], "Lisinopril/potassium risk was not detected")
    require(case["assessment"]["abnormal_diagnostic_alert"], "abnormal potassium alert was not raised")
    seeded_reviews = client.get("/api/reviews/open", headers=CLINICIAN).json()["results"]
    triage_reviews = [item for item in seeded_reviews if item.get("review_type") == "clinical_triage"]
    require(len(triage_reviews) == 20, "20 additional patient-specific review gates were not seeded")
    require(len({item["case_id"] for item in triage_reviews}) == 20, "triage queue reused a patient case")

    retrieval = client.get(
        "/api/knowledge/search",
        headers=CLINICIAN,
        params={"q": "Lisinopril potassium renal allergy contraindication", "limit": 2},
    ).json()
    require(retrieval["count"] >= 1, "clinical guideline retrieval failed")

    legacy = client.post(
        "/api/v1/clinical/inject-fact",
        headers=HEALTH_WORKER,
        json={
            "transcript": "Start Lisinopril 10 mg once daily.",
            "prior_records": "Longstanding hypertension treated with amlodipine.",
            "new_injected_fact": "Potassium is 5.2 mEq/L.",
        },
    )
    require(legacy.status_code == 200 and legacy.json()["escalation_flag"], "compatibility workflow did not escalate")

    normal_started = client.post("/api/runs", headers=HEALTH_WORKER, json={"caseId": "SIM-0401", "failureDemo": False})
    require(normal_started.status_code == 202, "normal patient run did not start")
    normal_run = client.get(f"/api/runs/{normal_started.json()['runId']}", headers=HEALTH_WORKER).json()
    require(normal_run["status"] == "complete", "normal patient run did not complete")
    require("replan" not in [event.get("stage_name") for event in normal_run["events"]], "normal patient entered the Lisinopril replan")
    require(normal_run["state"]["assessment"]["high_risk"] is False, "normal patient was incorrectly marked high-risk")
    require(normal_run["state"]["passed"] == 14, "normal patient did not pass all patient-specific checks")
    normal_case_after_run = client.get("/api/cases/SIM-0401", headers=HEALTH_WORKER).json()
    require(normal_case_after_run["case"]["status"] == "Needs review", "agent completion incorrectly cleared the clinician-owned review gate")
    normal_patient_id = normal_run["state"]["normalized"]["case"]["patient_id"]
    require(normal_patient_id in normal_run["state"]["note"], "normal note lost its patient identity")
    require("168/96" not in normal_run["state"]["note"] and "LAB-K-0911" not in normal_run["state"]["note"], "special demo facts contaminated a normal patient")
    forbidden_report = client.get("/api/cases/SIM-0401/report.pdf", headers=HEALTH_WORKER)
    require(forbidden_report.status_code == 403, "health worker was allowed to export a final clinician report")
    normal_report = client.get("/api/cases/SIM-0401/report.pdf", headers=CLINICIAN)
    require(normal_report.status_code == 200 and normal_report.content.startswith(b"%PDF"), "patient report is not a valid PDF")
    require("SIM-0401" in normal_report.headers.get("content-disposition", "") and normal_patient_id in normal_report.headers.get("content-disposition", ""), "patient report filename is not unique")
    report_text = "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(normal_report.content)).pages)
    require(normal_patient_id in report_text and "Aarav Patel" not in report_text, "patient PDF contains another patient's identity")

    isolated_started = client.post("/api/runs", headers=HEALTH_WORKER, json={"caseId": "SIM-0402", "failureDemo": True})
    require(isolated_started.status_code == 202, "cross-patient isolation run did not start")
    isolated_run = client.get(f"/api/runs/{isolated_started.json()['runId']}", headers=HEALTH_WORKER).json()
    require(isolated_run["status"] == "complete", "cross-patient isolation run did not complete")
    require("Lisinopril" not in isolated_run["state"]["note"], "failure demo leaked Lisinopril into another patient")
    require("replan" not in [event.get("stage_name") for event in isolated_run["events"]], "failure demo forced another patient into replan")

    original_chat = app_module.ai_chat
    async def false_positive_model(*args, **kwargs):
        return '{"violation": true, "reason": "model formatting error"}', "ollama"
    app_module.ai_chat = false_positive_model
    false_positive = asyncio.run(app_module.verifier_agent(normal_run["state"]["note"], normal_run["state"]["assessment"]))
    app_module.ai_chat = original_chat
    require(false_positive["violation"] is False, "an LLM false-positive can still replan an unrelated patient")

    started = client.post("/api/runs", headers=HEALTH_WORKER, json={"caseId": "SIM-0427", "failureDemo": True})
    require(started.status_code == 202, "agent run did not start")
    run_id = started.json()["runId"]
    run = client.get(f"/api/runs/{run_id}", headers=HEALTH_WORKER).json()
    kinds = [event["kind"] for event in run["events"]]
    require(run["status"] == "complete", "agent run did not complete")
    require(kinds == ["action", "action", "conflict", "evidence", "action", "failure", "replan", "success"], "state-graph trace is incomplete")
    require(all(event.get("occurred_at", "").endswith("+00:00") for event in run["events"]), "timeline events do not carry timezone-aware timestamps")
    require(run["state"]["passed"] == 14, "14-item safety matrix did not pass")
    require(run["state"]["prescription"]["status"] == "blocked", "unsafe prescription was not blocked")

    audit_result = client.get(f"/api/runs/{run_id}/audit", headers=CLINICIAN).json()
    completed_nodes = [event["node_name"] for event in audit_result["events"] if event["action"] == "node_complete"]
    require(completed_nodes == ["normalize", "pre_summary", "reconcile", "ground", "compose", "verify", "replan", "commit"], "workflow node audit is incomplete")
    require(len(audit_result["diffs"]) == 2, "draft and transcript diffs were not persisted")

    forbidden = client.post(
        "/api/resolve-conflict",
        headers=HEALTH_WORKER,
        json={"caseId": "SIM-0427", "action": "acknowledge_escalation"},
    )
    require(forbidden.status_code == 403, "non-clinician was allowed to approve")

    approved = client.post(
        "/api/resolve-conflict",
        headers=CLINICIAN,
        json={"caseId": "SIM-0427", "action": "order_repeat_lab", "reviewer": "Dr. Abhinav"},
    )
    require(approved.status_code == 200, "clinician acknowledgement failed")
    require(approved.json()["prescriptionStatus"] == "blocked", "approval incorrectly issued the prescription")
    require(approved.json()["ordersIssued"] == 1, "repeat-potassium order was not counted after clinician review")
    require(approved.json()["queueRemaining"] == 20, "safety acknowledgement corrupted the longitudinal review queue")
    remaining_reviews = client.get("/api/reviews/open", headers=CLINICIAN).json()["results"]
    require(not any(item.get("case_id") == "SIM-0427" and item.get("review_type") == "safety_conflict" for item in remaining_reviews), "resolved safety conflict still appears in accountable review")
    require(len([item for item in remaining_reviews if item.get("review_type") == "clinical_triage"]) == 20, "patient-specific triage items disappeared unexpectedly")

    triage_case_id = next(item["case_id"] for item in remaining_reviews if item.get("review_type") == "clinical_triage")
    forbidden_triage = client.post(
        "/api/reviews/acknowledge",
        headers=HEALTH_WORKER,
        json={"caseId": triage_case_id, "action": "acknowledge_risk_review", "reviewer": "Worker 17"},
    )
    require(forbidden_triage.status_code == 403, "non-clinician was allowed to acknowledge longitudinal review")
    acknowledged_triage = client.post(
        "/api/reviews/acknowledge",
        headers=CLINICIAN,
        json={"caseId": triage_case_id, "action": "acknowledge_risk_review", "reviewer": "Dr. Abhinav"},
    )
    require(acknowledged_triage.status_code == 200 and acknowledged_triage.json()["queueRemaining"] == 19, "patient-specific triage acknowledgement did not persist")
    require(acknowledged_triage.json()["ordersIssued"] == 2, "clinician follow-up order was not counted")
    app_module.init_database()
    restarted_reviews = client.get("/api/reviews/open", headers=CLINICIAN).json()["results"]
    require(len([item for item in restarted_reviews if item.get("review_type") == "clinical_triage"]) == 19, "acknowledged triage was replenished after backend restart")
    require(not any(item.get("case_id") == triage_case_id for item in restarted_reviews), "acknowledged patient returned to the review queue")
    restarted_case = client.get(f"/api/cases/{triage_case_id}", headers=HEALTH_WORKER).json()
    require(restarted_case["case"]["status"] == "Complete", "acknowledged patient status regressed after backend restart")
    require(client.get("/api/health").json()["orders_issued"] == 2, "issued-order metric did not persist after backend restart")

    updated_audit = client.get(f"/api/runs/{run_id}/audit", headers=CLINICIAN).json()
    require(len(updated_audit["diffs"]) == 3, "clinician modification diff was not persisted")

    upload_headers = {**HEALTH_WORKER, "X-Synthetic-Data": "true", "X-Filename": "synthetic_repeat_lab.json", "Content-Type": "application/json"}
    upload = client.post(
        "/api/cases/SIM-0427/labs/upload",
        headers=upload_headers,
        content=b'{"potassium_mEq_L": 5.4, "creatinine_clearance_mL_min": 72}',
    )
    require(upload.status_code == 200, "synthetic laboratory file upload failed")
    require(upload.json()["assessment"]["adapted_to_new_source"], "uploaded report was not integrated into longitudinal state")
    require(upload.json()["assessment"]["potassium_mEq_L"] == 5.4, "uploaded potassium was not used")

    mutation = client.post("/api/cases/SIM-0427/inject", headers=HEALTH_WORKER, json={"potassium": 5.6, "source": "Second synthetic laboratory update"})
    require(mutation.status_code == 200 and mutation.json()["assessment"]["potassium_mEq_L"] == 5.6, "newest same-type record did not supersede the older upload")

print("CareTrace PS1 acceptance passed: 20,000 EHR patients, 20 additional review gates, patient PDF export, persisted clinician orders, normal-case isolation, lab upload, Lisinopril safety, RBAC, graph audit, diffs, HITL and source adaptation are operational.")
