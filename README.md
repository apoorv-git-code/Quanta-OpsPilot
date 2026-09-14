# CareTrace Clinical Intelligence

PS1 implementation for Tech Zephyr 4.0: an agentic clinical documentation workflow using synthetic data only.

The required judge scenario is a rural hypertension follow-up. A consultation transcript proposes Lisinopril 10 mg daily, while a digital laboratory result shows potassium 5.2 mEq/L. The system creates an electronic prescription candidate, blocks it using a deterministic guideline rule, rewrites the draft, and requires an authenticated clinician to acknowledge the escalation.

## What is implemented

- Imports all 20,000 unique patients from `data/demo_english.csv` into SQLite on startup and exposes paginated search in the UI.
- Creates 50 persistent cases linked one-to-one with 50 different CSV patients.
- Seeds 20 additional patient-specific longitudinal-risk review gates, separate from Aarav Patel's prescription-safety escalation.
- Opens the correct clinician acknowledgement panel for every review item and retains each gate until it is explicitly acknowledged.
- Gives every case its own diagnosis, longitudinal note, medication list, allergies, diagnostics, observations, care context, and derived risk insights.
- Loads the selected registry patient throughout the command and record workspace; no row redirects to a shared patient fixture.
- Queries accountable review from SQLite and removes acknowledged items from the open queue while retaining their audit history.
- Links demo case `SIM-0427` to CSV patient `UKP189058`.
- Builds a time-aware patient state from disease, prior-note, medication, allergy, lab, vital-sign, and transcript records.
- Generates a pre-consultation summary before processing the current transcript.
- Accepts explicitly synthetic JSON, CSV, TXT, LAB, or PDF laboratory uploads from the case workspace.
- Drafts a structured follow-up note and follow-up advice.
- Extracts Lisinopril 10 mg as a structured electronic prescription candidate.
- Detects potassium 5.2 mEq/L as abnormal and applies the guideline threshold above 5.0 mEq/L.
- Checks creatinine clearance, ACE-inhibitor allergy, and angioedema history.
- Marks the prescription candidate `blocked` and never issues it autonomously.
- Uses separate documentation and verifier model calls through Gemini or Ollama, with a deterministic fallback.
- Runs an explicit persisted state graph; when `langgraph` is installed it uses `StateGraph` directly.
- Streams observable actions, evidence, safety outcomes, and replanning through SSE.
- Stores node start/completion, actor, role, resource, timestamps, input/output hashes, and metadata in `audit_log`.
- Stores draft v1, corrected draft v2, clinician-approved versions, and unified note diffs.
- Renders the actual backend-generated note, persisted node syslog, hashes, and unified diffs in dedicated Record and Audit views.
- Treats LLM verifier output as advisory to deterministic evidence so a model false-positive cannot inject the demo template into another patient.
- Enforces role checks server-side: clinicians and health workers may run documentation, but only clinicians may acknowledge/approve the final note.
- Provides 14 deterministic acceptance checks.
- Uses the CareTrace Meridian Glass interface: a responsive clinical command theme with selective Apple-style glass materials, a custom shield-and-trace logo, contrast-safe clinical copy, reduced-motion/transparency support, animated agent states, and consistent safety/review semantics.
- Provides a persistent Light/Dark appearance switch in the sidebar and page headers. The light navigation rail uses a pearl-glass neutral treatment; dark mode restyles the complete workspace with explicit high-contrast text and clinical-state colors.
- Exports a patient-specific, two-page A4 clinical dossier with an identity band, safety status, diagnostic table, medication/allergy reconciliation, verified note, governance evidence, and clinician sign-off fields.

The live ledger is an action/evidence/outcome trace. It does not expose private chain-of-thought.

## Required project layout

```text
.
├── backend/
│   ├── __init__.py
│   ├── app.py
│   ├── knowledge.py
│   ├── reports.py
│   └── knowledge/
│       ├── mock_clinical_guidelines.txt
│       └── real_insurance_policy.pdf
├── data/
│   └── demo_english.csv
├── src/
│   ├── main.jsx
│   └── styles.css
├── public/
│   └── caretrace-mark.svg
├── output/pdf/
│   └── CareTrace_sample_clinical_report.pdf
├── tests/
│   └── smoke_test.py
├── demo_files/
│   └── caretrace_upload_demo_high_potassium.json
├── index.html
├── .env.example
├── ingest_policy.py
├── main.py
├── run_backend.py
├── package.json
├── vite.config.js
└── requirements.txt
```

The CSV path can be overridden with `CAIRN_EHR_CSV`. The import size defaults to 20,000 and can be changed with `CAIRN_EHR_IMPORT_LIMIT`.

## Setup

Prerequisites: Python 3.9 or newer and Node.js 20.19+ or 22.12+.

```bash
./setup_mac.sh
```

Optional AI provider configuration in `.env`:

```bash
AI_PROVIDER=auto
GOOGLE_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
OLLAMA_MODEL=llama3.2:3b
CAIRN_EHR_IMPORT_LIMIT=20000
```

The application continues using deterministic safety behavior if neither external model is available.

## Development

```bash
# Terminal 1
source .venv/bin/activate
python run_backend.py

# Terminal 2
npm run dev
```

Open `http://localhost:5173`.

For a single-server demo:

```bash
npm run build
source .venv/bin/activate
python run_backend.py
```

Then open `http://SERVER_IP:8000`.

## Authentication headers

The UI identifies its synthetic demo clinician with:

```text
X-User-Id: dr-abhinav
X-Role: clinician
```

This is backend-enforced demo RBAC, not production identity authentication. Production deployment must replace trusted request headers with a verified identity provider and signed tokens.

## API

- `GET /api/health`
- `GET /api/patients` — clinician, health worker, or admin
- `GET /api/cases?limit=50` — patient-specific case registry
- `GET /api/cases/SIM-0427` — clinician, health worker, or admin
- `GET /api/cases/SIM-0427/report.pdf` — clinician-only, patient-specific final PDF report
- `GET /api/reviews/open` — unresolved accountable review queue
- `POST /api/reviews/acknowledge` — clinician-only longitudinal-risk acknowledgement
- `POST /api/patients/{patient_id}/case` — provision or reuse a longitudinal workspace from any CSV EHR row
- `GET /api/knowledge/search?q=Lisinopril` — clinician, health worker, or admin
- `POST /api/runs` — clinician or health worker
- `GET /api/runs/{runId}` — clinician, health worker, or admin
- `GET /api/runs/{runId}/events` — SSE
- `GET /api/runs/{runId}/audit` — clinician or admin
- `POST /api/resolve-conflict` — clinician only
- `POST /api/cases/SIM-0427/inject` — clinician or health worker
- `POST /api/cases/SIM-0427/labs/upload` — raw synthetic JSON/CSV/TXT/LAB/PDF bytes with `X-Synthetic-Data: true` and `X-Filename`
- `POST /api/v1/clinical/reconcile`
- `POST /api/v1/clinical/inject-fact`

## Acceptance test

```bash
source .venv/bin/activate
python tests/smoke_test.py
```

The test proves:

1. Exactly 20,000 CSV patients are imported and searchable.
2. Anonymous record access is rejected.
3. The demo case is linked to a real CSV patient ID.
4. Fifty cases map to 50 unique CSV patients and expose individual health insights.
5. Lisinopril plus potassium 5.2 triggers a high-risk alert.
6. The electronic prescription candidate is stored but blocked.
7. The verifier rejects the unsafe first draft and the graph replans.
8. All 14 deterministic checks pass.
9. Each graph node execution is audited.
10. Draft and transcript diffs are persisted.
11. A health worker cannot approve; a clinician can acknowledge the escalation.
12. Clinician acknowledgement does not issue the prescription.
13. Acknowledged decisions disappear from the open review queue.
14. A normal patient cannot enter the Lisinopril replan even if a model emits a false-positive verifier response.
15. A synthetic laboratory file is parsed, persisted, audited, and used as the newest source.
16. A caller cannot force the Lisinopril failure-demo content into another patient's case.
17. Twenty distinct non-Aarav patients enter the clinician review queue.
18. Acknowledgement clears the correct patient and stays cleared after backend reinitialization.

## Fast judge demo

1. Open **Cases**, choose any patient-specific workspace, and click **Begin agent run**.
2. Watch Normalize → Reconcile → Ground → Compose → Verify stream through the Run ledger.
3. Open **Record** to inspect the actual generated backend note.
4. Open **Assurance** for all 14 checks, then **Audit** for persisted node hashes and real diffs.
5. Open **Record → Acknowledge escalation** and choose the clinician-owned follow-up.
6. Use **Upload lab** with `demo_files/caretrace_upload_demo_high_potassium.json`; the UI persists potassium 5.7 mEq/L and automatically starts a fresh run.
7. Open **Cases → Full EHR cohort** to search and paginate all 20,000 synthetic patients.
8. Open **Record → Export clinical PDF** to download a polished report whose content and filename include that selected patient's case and EHR identifiers.
9. Use the sun/moon appearance control from any page; the chosen mode persists across reloads and avoids a startup color flash.

All patients and clinical events are synthetic. CareTrace supports documentation and accountable review; it does not independently diagnose, prescribe, or deliver treatment.

The interface clock and every new execution-timeline event use the browser's local timezone. Notification badges and the multi-patient dashboard queue are derived only from real unresolved items returned by `/api/reviews/open`. The Orders Issued metric counts persisted clinician-owned follow-up and repeat-laboratory orders; a blocked medication candidate never increases that metric. Every Knowledge adapter displays its own patient-aware normalized output. Audit rows can be expanded and the complete ledger can be exported as JSON.
