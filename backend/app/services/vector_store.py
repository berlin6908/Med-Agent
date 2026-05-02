from functools import lru_cache

import chromadb

from app.core.config import settings
from app.models import Document, DocumentChunk
from app.services.embeddings import embed_query, embed_texts

COLLECTION_NAME = "drugagent_chunks"


@lru_cache
def get_chroma_client():
    return chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)


def get_chunk_collection():
    return get_chroma_client().get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def delete_document_vectors(document_id: str) -> None:
    collection = get_chunk_collection()
    try:
        collection.delete(where={"document_id": document_id})
    except Exception:
        # Chroma raises if no matching records exist in some versions.
        pass


def index_document_chunks(document: Document, chunks: list[DocumentChunk]) -> int:
    if not chunks:
        return 0

    texts = [chunk.text for chunk in chunks]
    embeddings = embed_texts(texts)
    if len(embeddings) != len(chunks):
        raise RuntimeError("Embedding count did not match chunk count")

    collection = get_chunk_collection()
    collection.upsert(
        ids=[chunk.id for chunk in chunks],
        embeddings=embeddings,
        documents=texts,
        metadatas=[
            {
                "user_id": document.user_id,
                "document_id": document.id,
                "document_filename": document.original_filename,
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
            }
            for chunk in chunks
        ],
    )
    return len(chunks)


def query_user_chunks(user_id: str, query: str, top_k: int | None = None) -> list[dict]:
    collection = get_chunk_collection()
    results = collection.query(
        query_embeddings=[embed_query(query)],
        n_results=top_k or settings.RETRIEVAL_TOP_K,
        where={"user_id": user_id},
        include=["documents", "metadatas", "distances"],
    )

    ids = results.get("ids", [[]])[0]
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]
    return [
        {
            "chunk_id": chunk_id,
            "text": text,
            "metadata": metadata,
            "distance": distance,
        }
        for chunk_id, text, metadata, distance in zip(ids, documents, metadatas, distances, strict=False)
    ]
