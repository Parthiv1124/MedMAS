# backend/knowledge_base/build_index.py
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import OPENAI_API_KEY, EMBEDDING_MODEL, PROJECT_ROOT

DOCS_DIR   = str(PROJECT_ROOT / "backend" / "knowledge_base" / "medical_docs")
INDEX_PATH = str(PROJECT_ROOT / "backend" / "knowledge_base" / "faiss.index")

def build_faiss_index():
    print("[FAISS] Loading documents...")
    loader = DirectoryLoader(DOCS_DIR, glob="**/*.txt", loader_cls=TextLoader)
    docs = loader.load()
    print(f"[FAISS] Loaded {len(docs)} documents")

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_documents(docs)
    print(f"[FAISS] Split into {len(chunks)} chunks")

    embeddings = OpenAIEmbeddings(model=EMBEDDING_MODEL, api_key=OPENAI_API_KEY)
    index = FAISS.from_documents(chunks, embeddings)
    index.save_local(INDEX_PATH)
    print(f"[FAISS] Index saved to {INDEX_PATH}")

if __name__ == "__main__":
    build_faiss_index()
