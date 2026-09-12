# OpsPilot: Autonomous Clinical Documentation Agent

An autonomous clinical documentation and follow-up agent built for the Tech Zephyr 4.0 Agentic AI Hackathon (Track 1: Healthcare, Problem Statement 1). 

OpsPilot converts simulated patient consultations into verified clinical records by autonomously ingesting data, identifying contradictions, retrieving clinical guidelines, and flagging high-risk discrepancies for clinician review[cite: 20].

## 🧠 Agentic Architecture

Unlike traditional one-shot LLM applications, OpsPilot operates via a **LangGraph state machine** that maintains a persistent task state and autonomously evaluates its own outputs[cite: 20]. 

The agentic loop follows this exact workflow:
1. **Ingest & Reconcile:** Parses multimodal simulated patient records (consultation transcripts, EHR, medication history, allergies, and recent labs)[cite: 20].
2. **Tool-Assisted Retrieval:** Queries a local **ChromaDB** vector store to retrieve relevant clinical guidelines and contraindications.
3. **Cross-Referencing & Conflict Detection:** Analyzes the transcript against historical records to identify missing, contradictory, or ambiguous facts[cite: 20]. 
4. **Drafting:** Generates a structured follow-up record and action list[cite: 20].
5. **Self-Validation:** An independent validation node evaluates the drafted record against the retrieved clinical guidelines to ensure zero hallucinations and strict policy adherence[cite: 20].
6. **Adaptation & Escalation:** If a medical contradiction is detected (e.g., prescribing Lisinopril to a patient with a Potassium level > 5.0 mEq/L), the agent halts the auto-approval pipeline, revises the state, and explicitly flags the contradiction for human review[cite: 20].

## 🛠️ Tech Stack

**Backend (Agent & API)**
* **Framework:** FastAPI running on Python (`uvicorn`)
* **Agent Orchestration:** LangGraph & LangChain (`langgraph`, `langchain-core`)
* **LLM:** Google Gemini 2.5 Flash (`langchain-google-genai`)
* **Vector Database:** ChromaDB (`chromadb`) for local RAG
* **Document Parsing:** PyPDF

**Frontend (OpsPilot Kernel Dashboard)**
* **Framework:** Next.js (React 19)[cite: 18]
* **Styling:** Tailwind CSS[cite: 18]
* **Icons:** Lucide React[cite: 18]
* **Telemetry:** Live WebSocket/Polling for agent thought-stream observation

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* Python 3.10+
* A valid Gemini API Key (`GOOGLE_API_KEY`)

### 1. Backend Setup (Agent & API)
Navigate to the backend directory and install the required Python dependencies:

```bash
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
