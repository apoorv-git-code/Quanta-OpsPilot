# Tech Zephyr 4.0 PS1 - Verified Implementation

## Interaction QA pass

- [x] Secure-boot progress is numerically clamped to 0-100 and paint-contained inside its track at every viewport scale.
- [x] Loader status chips reflect the live API/model health response instead of asserting that Ollama is always ready.
- [x] Reduced-motion preferences disable non-essential boot animation.
- [x] Every CSV cohort row provisions or reuses a persistent patient workspace.
- [x] Review distinguishes prescription-safety conflicts from longitudinal risk triage.
- [x] Twenty additional patient-specific triage gates are seeded and persist until clinician acknowledgement.
- [x] Acknowledged patient gates stay complete after a backend restart and are not silently replaced by another seeded patient.
- [x] Notification counts represent every real unresolved clinician-review item.
- [x] Dashboard previews three distinct unresolved patients and links to the complete review queue.
- [x] Orders Issued is read from persistent clinician-owned orders and survives database restart.
- [x] Every queue item opens the matching patient and the correct safety or longitudinal review panel.
- [x] Patient-insight menu opens evidence, copies a summary, and refreshes SQLite state.
- [x] Browser-local date and time update every second.
- [x] Workflow rail is centered on its five nodes with aligned labels.
- [x] Audit events expand, hashes copy, diffs toggle, and the full ledger exports as JSON.

## Patient profile and longitudinal state

- [x] 20,000 unique synthetic CSV patient IDs imported into SQLite and searchable.
- [x] 50 pre-seeded one-to-one patient case workspaces plus on-demand workspaces for every remaining CSV patient.
- [x] Newest-source-wins temporal reconciliation for injected and uploaded laboratory results.
- [x] Newest-source values propagate consistently into assessment, pre-consult summary, case insights, evidence lineage, and rerun output.
- [x] Synthetic JSON, CSV, TXT, LAB, and PDF laboratory-file ingestion with a 2 MB limit and explicit synthetic-data header.
- [x] Successful lab upload automatically starts a new agent run against the updated longitudinal state.
- [x] Patient timeline assembled before drafting.

## Documentation and guardrails

- [x] Pre-consultation summary runs before current-transcript processing.
- [x] Structured follow-up note and action list are generated and displayed from backend state.
- [x] Lisinopril 10 mg is extracted as an electronic candidate, persisted, blocked, and never issued.
- [x] Potassium 5.2 mEq/L, renal function, ACE-inhibitor allergy, and angioedema are checked.
- [x] Separate documentation and verifier calls with deterministic safety enforcement.
- [x] Forced judge failure produces action -> observation -> replan -> verified result.
- [x] Live-model false-positive verdicts cannot route normal patients into the special demo rewrite.
- [x] The API ignores `failureDemo=true` outside the designated synthetic Lisinopril case.
- [x] Clinician acknowledgement is mandatory for the high-risk escalation.
- [x] Clinician-only export creates a styled, patient-specific PDF rather than browser HTML.
- [x] Each Knowledge adapter exposes a distinct patient-aware normalized schema.

## Security and traceability

- [x] Backend role checks protect reads, runs, audits, and clinician-only approval.
- [x] Every graph node start/completion is persisted with actor, role, resource, timestamp, and hashes.
- [x] Draft-v1 -> draft-v2, raw-transcript -> final-note, and clinician-review diffs are persisted.
- [x] The UI displays the persisted audit and diffs, not a mock trace.
- [x] Embedded trace/evidence fallbacks were removed; empty states never masquerade as retrieved backend data.
- [x] All displayed trace content is an observable action/evidence/outcome log, not private chain-of-thought.

## Judge path

1. Dashboard -> **Open active case**, or choose any patient from **Cases**.
2. Click **Begin agent run**.
3. Show the streamed failure and replan in **Run**.
4. Show the real note in **Record** and 14 checks in **Assurance**.
5. Show node hashes and real revisions in **Audit**.
6. Choose **Order repeat potassium**, acknowledge as the clinician, and confirm the prescription remains blocked while **Orders Issued** increments.
7. Upload `demo_files/caretrace_upload_demo_high_potassium.json`; the UI persists 5.7 mEq/L and automatically starts the adapted run.
8. Cases -> **Full EHR cohort**; search `UKP189058`.
9. Open **Knowledge**, switch between source adapters, and show the changing normalized output.
10. Open **Record** and export the selected patient's final clinical PDF.

All clinical data is synthetic. The application documents and escalates; it does not autonomously diagnose, prescribe, or deliver treatment.
