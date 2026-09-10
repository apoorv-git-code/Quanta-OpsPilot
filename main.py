import os
import json
import chromadb
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

app = FastAPI()

# Enable CORS: Crucial for Next.js to communicate with FastAPI locally
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define the expected incoming data from the frontend
class ClinicalRequest(BaseModel):
    criterion_query: str
    patient_chart_excerpt: str
class ChecklistItem(BaseModel):
    criterion: str
    met: bool
    source_citation: str
    source_excerpt: str 
    confidence: float

# Define the structured output schema dictated by the brief
class ChecklistItem(BaseModel):
    criterion: str
    met: bool
    source_citation: str
    confidence: float

class JustificationRequest(BaseModel):
    patient_chart_excerpt: str
    unmet_criterion: str
    policy_context: str

class JustificationResponse(BaseModel):
    draft_letter: str
    status_flag: str
# Connect to the persistent ChromaDB you built today
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_collection(name="clinical_pa_real_data")

@app.post("/api/v1/prior-auth/justify", response_model=JustificationResponse)
async def draft_justification_letter(request: JustificationRequest):
    prompt = f"""
    You are an AI assisting a clinical team. Draft a formal medical justification letter to an insurance provider.
    
    The patient needs a procedure, but currently fails this specific criteria: {request.unmet_criterion}
    Based on this policy rule: {request.policy_context}
    Here is the patient's current chart: {request.patient_chart_excerpt}
    
    Write a brief, professional letter arguing for medical necessity based on the chart context. 
    Ensure the tone is professional and clinical.
    """

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt
    )
    
    return {
        "draft_letter": response.text,
        "status_flag": "Pending Clinician Co-Sign" # Mandated by the working brief
    }

@app.post("/api/v1/prior-auth/evaluate", response_model=ChecklistItem)
async def evaluate_prior_auth(request: ClinicalRequest):
    # 1. Retrieve policy context from ChromaDB
    results = collection.query(
        query_texts=[request.criterion_query],
        n_results=1
    )
    
    retrieved_context = results["documents"][0][0]
    retrieved_metadata = results["metadatas"][0][0] 

    # 2. Build the prompt using the chart and the retrieved policy rule
    prompt = f"""
    Evaluate the medical criterion based strictly on the provided policy context and patient chart.
    Policy Context: {retrieved_context} (Source: {retrieved_metadata['source_file']}, Section: {retrieved_metadata['section']})
    Patient Chart: {request.patient_chart_excerpt}
    Criterion to evaluate: {request.criterion_query}
    """

    # 3. Generate the deterministic JSON output
    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ChecklistItem,
        )
    )
    
    # 4. Send the JSON straight to the Next.js frontend
    return json.loads(response.text)

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

@app.post("/api/negotiate")
async def negotiate_shift(req: NegotiationRequest):
    if req.kind == "bid":
        will_fill = req.maxBid >= req.basePay + 5
        reply = (
            f"Accepted. Aligned with {req.strategy} strategy at ${req.maxBid}/hr."
            if will_fill
            else f"With {req.strategy} approach, ${req.maxBid}/hr is below current rate requirement."
        )
        return {
            "nurse": req.candidate,
            "willFill": will_fill,
            "reply": reply,
            "sentiment": "POSITIVE" if will_fill else "NEGATIVE"
        }
    return {
        "nurse": req.candidate,
        "willFill": None,
        "reply": f"Understood. Adjusted strategy profile to {req.strategy}.",
        "sentiment": "NEUTRAL"
    }