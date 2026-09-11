import os
import json
import asyncio
import logging
from typing import Optional

import chromadb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv

# =========================================================
# LOGGING
# =========================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("opspilot.main")

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    # Fail loudly at startup rather than on the first request — same
    # behavior shift_negotiator.py already enforces, brought here too.
    raise RuntimeError("GEMINI_API_KEY not found in environment/.env file")

client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI(title="OpsPilot Health Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Kept exactly as-is: this is the model your Gemini key actually resolves
# against right now. Don't change without re-verifying against the live API.
MODEL_NAME = "gemini-3.6-flash"

# How many chunks to pull back per RAG query, and how many we're willing to
# stitch together into one context block for the LLM call.
RAG_TOP_K = 5
RAG_MAX_CONTEXT_CHUNKS = 3


# =========================================================
# REQUEST / RESPONSE MODELS
# (unchanged field names/types — frontend contract is frozen)
# =========================================================
class ClinicalRequest(BaseModel):
    criterion_query: str
    patient_chart_excerpt: str


class ChecklistItem(BaseModel):
    criterion: str
    met: bool
    source_citation: str
    source_excerpt: str
    confidence: float


class JustificationRequest(BaseModel):
    patient_chart_excerpt: str
    unmet_criterion: str
    policy_context: str


class JustificationResponse(BaseModel):
    draft_letter: str
    status_flag: str


class NegotiationRequest(BaseModel):
    shiftId: str
    role: str
    unit: str
    basePay: float
    currentBid: float
    maxBid: float
    strategy: str
    candidate: str
    kind: str
    message: str | None = None


class NegotiationReply(BaseModel):
    reply: str = Field(description="In-character reply from the per-diem candidate, 1-2 sentences")
    willFill: bool | None = Field(description="True if the candidate accepts the shift, False if they decline, null if not a bid turn")
    sentiment: str = Field(description="One of: POSITIVE, NEGATIVE, NEUTRAL")


# =========================================================
# CHROMA / RAG SETUP
# =========================================================
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="clinical_pa_real_data")


def _dedupe_and_rank_chunks(results: dict) -> list[dict]:
    """
    Chroma returns nearest-neighbor chunks, which can include multiple
    sub-chunks from the *same* policy section (an artifact of the
    fixed-size overlap chunking in ingest_policy.py). For grounding a
    single LLM call we want distinct sections, not five slices of one
    paragraph, so we collapse by section name and keep the closest match
    per section, ordered by distance.
    """
    docs = results.get("documents") or [[]]
    metas = results.get("metadatas") or [[]]
    dists = results.get("distances") or [[]]

    docs, metas, dists = docs[0], metas[0], (dists[0] if dists and dists[0] else [None] * len(docs[0]))

    best_by_section: dict[str, dict] = {}
    for doc, meta, dist in zip(docs, metas, dists):
        section = meta.get("section", "General/Introduction")
        entry = {"document": doc, "metadata": meta, "distance": dist}
        current = best_by_section.get(section)
        if current is None or (dist is not None and current["distance"] is not None and dist < current["distance"]):
            best_by_section[section] = entry

    ranked = sorted(
        best_by_section.values(),
        key=lambda e: (e["distance"] if e["distance"] is not None else 0.0),
    )
    return ranked[:RAG_MAX_CONTEXT_CHUNKS]


async def _generate_content_async(prompt: str, response_schema: Optional[type] = None):
    """
    google-genai's client.models.generate_content is synchronous and would
    otherwise block the FastAPI event loop for the full duration of each
    LLM call — a real problem here since /api/negotiate can be hit several
    times in quick succession during a live bidding demo. Push it to a
    worker thread instead.
    """
    config = None
    if response_schema is not None:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_schema,
        )

    def _call():
        return client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=config,
        )

    return await asyncio.to_thread(_call)


@app.get("/")
async def health_check():
    return {"status": "ok", "message": "OpsPilot backend is running"}


@app.post("/api/v1/prior-auth/justify", response_model=JustificationResponse)
async def draft_justification_letter(request: JustificationRequest):
    if not request.patient_chart_excerpt.strip() or not request.unmet_criterion.strip():
        raise HTTPException(status_code=422, detail="patient_chart_excerpt and unmet_criterion cannot be empty")

    prompt = f"""
    You are an AI assisting a clinical team. Draft a formal medical justification letter to an insurance provider.

    The patient needs a procedure, but currently fails this specific criteria: {request.unmet_criterion}
    Based on this policy rule: {request.policy_context}
    Here is the patient's current chart: {request.patient_chart_excerpt}

    Write a brief, professional letter arguing for medical necessity based on the chart context.
    Ensure the tone is professional and clinical.
    """

    try:
        response = await _generate_content_async(prompt)
    except Exception as e:
        logger.error("justify: Gemini call failed — %s", e)
        raise HTTPException(status_code=502, detail="Justification model unavailable, try again shortly")

    if not response.text:
        raise HTTPException(status_code=502, detail="Justification model returned an empty response")

    return {
        "draft_letter": response.text,
        "status_flag": "Pending Clinician Co-Sign",
    }


@app.post("/api/v1/prior-auth/evaluate", response_model=ChecklistItem)
async def evaluate_prior_auth(request: ClinicalRequest):
    if not request.criterion_query.strip():
        raise HTTPException(status_code=422, detail="criterion_query cannot be empty")

    try:
        results = collection.query(query_texts=[request.criterion_query], n_results=RAG_TOP_K)
    except Exception as e:
        logger.error("evaluate: ChromaDB query failed — %s", e)
        raise HTTPException(status_code=503, detail="Policy index unavailable")

    if not results.get("documents") or not results["documents"][0]:
        raise HTTPException(
            status_code=404,
            detail="No policy chunks found in ChromaDB. Run ingest_policy.py first to load a policy PDF.",
        )

    ranked_chunks = _dedupe_and_rank_chunks(results)
    context_block = "\n\n".join(
        f"(Source: {c['metadata'].get('source_file')}, Section: {c['metadata'].get('section')})\n{c['document']}"
        for c in ranked_chunks
    )

    prompt = f"""
    Evaluate the medical criterion based strictly on the provided policy context and patient chart.
    Only use the policy context given below — do not invent requirements that are not present in it.

    Policy Context:
    {context_block}

    Patient Chart: {request.patient_chart_excerpt}
    Criterion to evaluate: {request.criterion_query}

    For source_citation, cite the section name(s) from the policy context above that you relied on.
    """

    try:
        response = await _generate_content_async(prompt, response_schema=ChecklistItem)
    except Exception as e:
        logger.error("evaluate: Gemini call failed — %s", e)
        raise HTTPException(status_code=502, detail="Evaluation model unavailable, try again shortly")

    try:
        return json.loads(response.text)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error("evaluate: could not parse model output as ChecklistItem — %s", e)
        raise HTTPException(status_code=502, detail="Evaluation model returned malformed output")


@app.post("/api/negotiate")
async def negotiate_shift(req: NegotiationRequest):
    # Deterministic business rule for whether a bid clears — this stays in
    # code, not in the model, so accept/reject is never subject to the LLM
    # inventing a number. Only used for kind == "bid".
    will_fill = req.maxBid >= req.basePay + 5

    if req.kind == "bid":
        prompt = f"""
        You are {req.candidate}, a per-diem healthcare worker being offered a shift.
        Shift: {req.role} in {req.unit}. Base pay ${req.basePay}/hr, current bid ${req.currentBid}/hr.
        The hospital's negotiation agent is using a "{req.strategy}" strategy and just offered you ${req.maxBid}/hr.
        You have {"decided to accept" if will_fill else "decided to decline"} this offer.

        Write your in-character reply as the candidate, 1-2 sentences, consistent with that decision.
        Do not mention that you were told to accept or decline — react naturally to the number and strategy.
        """
    else:
        # kind == "message"
        incoming = req.message or ""
        prompt = f"""
        You are {req.candidate}, a per-diem healthcare worker mid-negotiation over a shift.
        Shift: {req.role} in {req.unit}. Base pay ${req.basePay}/hr, current bid ${req.currentBid}/hr,
        hospital's max authorized bid ${req.maxBid}/hr. Hospital's strategy: "{req.strategy}".

        The hospital's negotiation agent just sent you this message:
        "{incoming}"

        Write your in-character reply as the candidate, 1-2 sentences, responding directly
        to what was said. Do not restate the strategy name back verbatim.
        """

    try:
        response = await _generate_content_async(prompt, response_schema=NegotiationReply)
        parsed = json.loads(response.text)
        return {
            "nurse": req.candidate,
            "willFill": will_fill if req.kind == "bid" else None,
            "reply": parsed.get("reply") or "...",
            "sentiment": parsed.get("sentiment", "NEUTRAL"),
        }
    except Exception as e:
        # If Gemini/network fails, fall back to a deterministic reply so the
        # endpoint never 500s mid-demo — the frontend's own "LOCAL SIM"
        # fallback still covers total backend unavailability on top of this.
        logger.warning("negotiate: Gemini call failed, falling back — %s", e)
        if req.kind == "bid":
            reply = (
                f"Deal — I'll take ${req.maxBid}/hr."
                if will_fill
                else "That's still below what I need for this shift."
            )
            return {"nurse": req.candidate, "willFill": will_fill, "reply": reply, "sentiment": "POSITIVE" if will_fill else "NEGATIVE"}
        return {
            "nurse": req.candidate,
            "willFill": None,
            "reply": "Got it — let me think about that.",
            "sentiment": "NEUTRAL",
        }
