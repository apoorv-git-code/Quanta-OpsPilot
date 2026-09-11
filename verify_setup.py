<<<<<<< HEAD
import os
import chromadb
from google import genai
from google.genai import types
from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# 1. Define the Schema required by the Technical Primer
class ChecklistItem(BaseModel):
    criterion: str = Field(description="The medical requirement being evaluated")
    met: bool = Field(description="Whether the requirement is met based on the text")
    source_citation: str = Field(description="The exact section or chart note cited")
    confidence: float = Field(description="Confidence score between 0.0 and 1.0")

# (Assume ChromaDB retrieval happened here, same as your previous script)
retrieved_context = "Section 1.2: If conservative therapy fails, MRI is approved for further evaluation."
retrieved_metadata = {'section': '1.2', 'source_file': 'policy_A.pdf', 'page': 2}
query_text = "Does the patient meet the criteria for an MRI based on conservative therapy?"

prompt = f"""
Evaluate the medical criterion based strictly on the provided context.
Context: {retrieved_context} (Source: {retrieved_metadata['source_file']}, Section: {retrieved_metadata['section']})
Criterion to evaluate: {query_text}
"""

# 2. Enforce the JSON output using GenerateContentConfig
response = client.models.generate_content(
    model="gemini-3.6-flash",
    contents=prompt,
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=ChecklistItem,
    )
)

=======
import os
import chromadb
from google import genai
from google.genai import types
from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

class ChecklistItem(BaseModel):
    criterion: str = Field(description="The medical requirement being evaluated")
    met: bool = Field(description="Whether the requirement is met based on the text")
    source_citation: str = Field(description="The exact section or chart note cited")
    confidence: float = Field(description="Confidence score between 0.0 and 1.0")

retrieved_context = "Section 1.2: If conservative therapy fails, MRI is approved for further evaluation."
retrieved_metadata = {'section': '1.2', 'source_file': 'policy_A.pdf', 'page': 2}
query_text = "Does the patient meet the criteria for an MRI based on conservative therapy?"

prompt = f"""
Evaluate the medical criterion based strictly on the provided context.
Context: {retrieved_context} (Source: {retrieved_metadata['source_file']}, Section: {retrieved_metadata['section']})
Criterion to evaluate: {query_text}
"""

# FIX: gemini-2.5-flash is deprecated for new API keys; the live API now
# requires gemini-3.6-flash.
response = client.models.generate_content(
    model="gemini-3.6-flash",
    contents=prompt,
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=ChecklistItem,
    )
)

>>>>>>> origin/master
print(response.text)