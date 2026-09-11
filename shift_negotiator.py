import os
import httpx
from typing import TypedDict, List

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

<<<<<<< HEAD
=======
# pyrefly: ignore [missing-import]
>>>>>>> origin/master
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI

# =========================================================
<<<<<<< HEAD
=======
# NOTE ON ARCHITECTURE
# =========================================================
# This is a SEPARATE service from main.py. main.py already exposes a simple
# /api/negotiate endpoint that the dashboard's Staffing tab calls directly
# for live bidding. This file is the LangGraph-based SMS/Twilio negotiation
# demo (Section 4 of the working brief) — it's meant to be triggered
# separately (e.g. via the Twilio webhook or the /api/v1/trigger-gap route),
# not to replace main.py. Run it on its own port (see bottom of file) so the
# two services don't collide.

# =========================================================
>>>>>>> origin/master
# 1. LOAD API KEY FROM .env
# =========================================================
load_dotenv()

<<<<<<< HEAD
if not os.getenv("GOOGLE_API_KEY"):
    raise ValueError("GOOGLE_API_KEY not found in .env file")
=======
# FIX: main.py, verify_setup.py, and your .env all use GEMINI_API_KEY.
# This file used to check for GOOGLE_API_KEY instead, which would raise
# even when a valid key was set — renamed for consistency across the project.
if not os.getenv("GEMINI_API_KEY"):
    raise ValueError("GEMINI_API_KEY not found in .env file")
>>>>>>> origin/master

# =========================================================
# 2. INITIALIZE GEMINI
# =========================================================
<<<<<<< HEAD
llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash",
=======
# FIX: model name changed from gemini-1.5-flash to match the project spec
# (gemini-2.5-flash), same model used everywhere else in the backend.
llm = ChatGoogleGenerativeAI(
    model="gemini-3.6-flash",
    google_api_key=os.getenv("GEMINI_API_KEY"),
>>>>>>> origin/master
    temperature=0
)

# =========================================================
# 3. DEFINE LANGGRAPH STATE
# =========================================================
class AgentState(TypedDict):
    messages: List[str]
    intent: str

# =========================================================
# 4. NODE 1: INTENT EXTRACTION
# =========================================================
def extract_intent(state: AgentState):
    latest_message = state["messages"][-1]

    prompt = f"""
    Read this message from a nurse:
    "{latest_message}"
    Did the nurse accept the shift?
    Reply strictly with exactly one word:
    YES, NO, or UNCLEAR.
    """

    response = llm.invoke(prompt)
    intent = response.content.strip().upper()

    if "YES" in intent:
        intent = "YES"
    elif "NO" in intent:
        intent = "NO"
    else:
        intent = "UNCLEAR"

    return {"intent": intent}

# =========================================================
# 5. NODE 2: REPLY GENERATION
# =========================================================
def generate_reply(state: AgentState):
    intent = state.get("intent", "UNCLEAR")

    if intent == "YES":
        prompt = "Write a short, professional 1-sentence confirmation message for a nurse who just accepted an ER shift."
    elif intent == "NO":
        prompt = "Write a short, polite 1-sentence message acknowledging a nurse declining a shift. State that we will contact the next available nurse."
    else:
        prompt = "Write a short, polite 1-sentence message asking the nurse to clarify whether they accept or decline the open shift."

    response = llm.invoke(prompt)
    ai_reply = response.content.strip()

    return {"messages": state["messages"] + [ai_reply]}

# =========================================================
# 6. BUILD LANGGRAPH WORKFLOW
# =========================================================
workflow = StateGraph(AgentState)
workflow.add_node("extract_intent", extract_intent)
workflow.add_node("generate_reply", generate_reply)
workflow.set_entry_point("extract_intent")
workflow.add_edge("extract_intent", "generate_reply")
workflow.add_edge("generate_reply", END)
opspilot_engine = workflow.compile()

# =========================================================
# 7. CREATE FASTAPI APP & CORS
# =========================================================
app = FastAPI(title="OpsPilot Health Shift Negotiator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    message: str

# =========================================================
# 8. DEMO TRIGGER ENDPOINT (Step 3)
# =========================================================
@app.post("/api/v1/trigger-gap")
async def trigger_gap():
    print("🚨 SYSTEM ALERT: Staffing Gap Detected. Initiating OpsPilot Engine...")
    return {
        "status": "gap_triggered",
        "first_message": "🤖 OpsPilot: URGENT - We have an open ER shift tomorrow at 08:00. Reply YES to accept."
    }

# =========================================================
# 9. CHAT API & LOGISTICS CALL (Step 4)
# =========================================================
@app.post("/api/chat")
async def chat_reply(request: ChatMessage):
    incoming_msg = request.message.strip()
    print(f"📩 Incoming web message: {incoming_msg}")

    # Run AI Brain
    initial_state = {"messages": [incoming_msg], "intent": ""}
    final_state = opspilot_engine.invoke(initial_state)
<<<<<<< HEAD
    
=======

>>>>>>> origin/master
    reply_text = final_state["messages"][-1]
    extracted_intent = final_state.get("intent", "")

    print(f"🧠 Detected Intent: {extracted_intent}")
    print(f"🤖 OpsPilot reply: {reply_text}")

    # Trigger Aditi's Logistics API if accepted
    if extracted_intent == "YES":
        print("✅ Shift accepted! Triggering Aditi's Logistics API...")
        async with httpx.AsyncClient() as client:
            try:
                # Replace this URL when Aditi finishes her logistics mock API
                mock_api_url = "https://mock-logistics-api.example.com/order"
                await client.post(f"{mock_api_url}?simulate_failure=true")
            except Exception as e:
                print(f"⚠️ Logistics API mock call failed: {e}")

    return {"reply": reply_text}

# =========================================================
# 10. RUN FASTAPI
# =========================================================
if __name__ == "__main__":
    import uvicorn
<<<<<<< HEAD
    uvicorn.run("shift_negotiator:app", host="0.0.0.0", port=8000, reload=True)
=======
    # FIX: was port=8000, same as main.py — the two would collide if both run
    # at once. This is a separate service, so it gets its own port.
    uvicorn.run("shift_negotiator:app", host="0.0.0.0", port=8001, reload=True)
>>>>>>> origin/master
