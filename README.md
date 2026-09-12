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

## 📂 Project Structure
The project operates as a unified repository containing both the Next.js frontend and the FastAPI/LangGraph backend.

OpsPilot/
├── 📁 Frontend (Next.js UI)
│   ├── page.tsx                  # Main OpsPilot Kernel Dashboard & Telemetry UI
│   ├── layout.tsx                # Next.js root layout
│   ├── globals                   # Global stylesheets
│   ├── package.json              # Node dependencies and scripts
│   ├── postcss.config.mjs        # PostCSS configuration for Tailwind
│   ├── tailwind.config           # Tailwind CSS configuration
│   ├── tsconfig.json             # TypeScript configuration
│   └── next-env.d.ts             # Next.js environment types
│
├── 📁 Backend & Agent (Python/FastAPI)
│   ├── main.py                   # Primary FastAPI application and API routes
│   ├── ingest_policy.py          # RAG ingestion script & LangChain tool wrappers
│   ├── shift_negotiator.py       # Legacy API routes (Shift Operations)
│   ├── requirements.txt          # Python dependencies (FastAPI, LangGraph, ChromaDB)
│   ├── verify_setup.py           # Environment and dependency validation script
│   └── chroma_db/                # Local vector database (Generated at runtime)
│
└── 📁 Synthetic Data & Knowledge Base
    ├── mock_clinical_guidelines.txt  # RAG knowledge base for medical contraindications
    ├── real_insurance_policy.pdf     # Legacy RAG source data
    └── mock_supplier_inventory       # Mock state data for the Logistics module
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
```

Initialize the Knowledge Base:Ingest the clinical guidelines into ChromaDB before running the server:

```bash
python ingest_policy.py mock_clinical_guidelines.txt
Start the FastAPI Server:Bashuvicorn main:app --host 0.0.0.0 --port 8001 --reload
```
## Frontend Setup (Dashboard)
In a new terminal window at the root directory, install the Node dependencies:Bashnpm install
Start the Next.js Development Server:Note: We use Webpack to bypass missing Turbopack native bindings on Windows environments.Bashnpm run dev --webpack
Access the OpsPilot Kernel dashboard at http://localhost:3000.🧪 Demo Scenario: The Contraindication TrapTo demonstrate the agent's failure recovery and adaptation capabilities to the judges, the project includes a pre-configured mock scenario:The Trap: A consultation transcript prescribes 10mg Lisinopril for a patient (PAT-001).The Conflict: A newly injected lab report shows a Serum Potassium level of 5.2 mEq/L.The Agent's Action: The agent retrieves the clinical guidelines, recognizes the strict contraindication between Lisinopril and high Potassium, halts the documentation approval, and dynamically escalates the specific conflict to the UI's Audit Queue.  🛡️ Hackathon GuardrailsThis system strictly utilizes synthetic, de-identified data. It operates purely as an administrative and documentation decision-support tool within a sandboxed environment and does not autonomously diagnose, prescribe, or make consequential clinical decisions on behalf of a human provider.
