# backend/knowledge_base/build_index.py
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_qdrant import QdrantVectorStore
from langchain_openai import OpenAIEmbeddings
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import OPENAI_API_KEY, EMBEDDING_MODEL, PROJECT_ROOT, QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION

DOCS_DIR = str(PROJECT_ROOT / "backend" / "knowledge_base" / "medical_docs")


def build_qdrant_index():
    print("[Qdrant] Loading documents...")
    loader = DirectoryLoader(DOCS_DIR, glob="**/*.txt", loader_cls=TextLoader)
    docs = loader.load()
    print(f"[Qdrant] Loaded {len(docs)} documents")

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_documents(docs)
    print(f"[Qdrant] Split into {len(chunks)} chunks")

    embeddings = OpenAIEmbeddings(model=EMBEDDING_MODEL, api_key=OPENAI_API_KEY)

    # Create collection if it doesn't exist
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    collections = [c.name for c in client.get_collections().collections]
    if QDRANT_COLLECTION not in collections:
        client.create_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
        )
        print(f"[Qdrant] Created collection '{QDRANT_COLLECTION}'")

    QdrantVectorStore.from_documents(
        chunks,
        embeddings,
        url=QDRANT_URL,
        api_key=QDRANT_API_KEY,
        collection_name=QDRANT_COLLECTION,
    )
    print(f"[Qdrant] Indexed {len(chunks)} chunks into '{QDRANT_COLLECTION}'")


if __name__ == "__main__":
    build_qdrant_index()
