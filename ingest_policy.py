import re
import chromadb
from pypdf import PdfReader

# Initialize persistent ChromaDB
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="clinical_pa_real_data")

def extract_and_chunk_pdf(file_path):
    reader = PdfReader(file_path)
    full_text = ""
    
    # Extract text and keep track of pages (simplified for hackathon)
    for page in reader.pages:
        full_text += page.extract_text() + "\n"

    # Split text by section headers (e.g., "Section 1", "1.0", "Clause A")
    # You MUST adjust this regex to match the exact formatting of your specific policy PDF
    section_pattern = r'(Section\s+\d+\.?\d*.*?\n)'
    raw_chunks = re.split(section_pattern, full_text)
    
    documents = []
    metadatas = []
    ids = []
    
    current_section_name = "General/Introduction"
    
    for i, chunk in enumerate(raw_chunks):
        if re.match(section_pattern, chunk):
            current_section_name = chunk.strip()
        elif chunk.strip():
            # Apply a basic overlap/chunk size enforcement if the section is too long
            # (Aiming for the 200-500 token sweet spot)
            words = chunk.split()
            chunk_size = 400
            overlap = 50
            
            for j in range(0, len(words), chunk_size - overlap):
                sub_chunk = " ".join(words[j:j + chunk_size])
                
                documents.append(sub_chunk)
                metadatas.append({
                    "source_file": file_path,
                    "section": current_section_name
                })
                ids.append(f"{file_path}_sec_{len(documents)}")

    return documents, metadatas, ids

# Execute the ingestion
pdf_file = "real_insurance_policy.pdf" # Replace with your actual file
docs, metas, chunk_ids = extract_and_chunk_pdf(pdf_file)

if docs:
    collection.add(
        documents=docs,
        metadatas=metas,
        ids=chunk_ids
    )
    print(f"Successfully loaded {len(docs)} chunks into ChromaDB from {pdf_file}.")
else:
    print("No text extracted. Check your PDF and regex pattern.")