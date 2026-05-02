from typing import Any

from app.core.config import settings
from app.services.reranker import rerank_chunks
from app.services.vector_store import query_user_chunks


def _metadata_value(metadata: dict[str, Any], key: str, default: Any) -> Any:
    value = metadata.get(key)
    return default if value is None else value


def build_retrieval_response(user_id: str, query: str, top_k: int | None = None) -> dict:
    final_top_k = top_k or settings.RERANKER_TOP_K
    candidate_top_k = max(final_top_k, settings.RETRIEVAL_TOP_K)
    raw_results = rerank_chunks(
        query,
        query_user_chunks(user_id, query, candidate_top_k),
        final_top_k,
    )
    results: list[dict] = []
    context_blocks: list[str] = []

    for index, raw_result in enumerate(raw_results, start=1):
        metadata = raw_result.get("metadata") or {}
        distance = float(raw_result.get("distance") or 0.0)
        text = raw_result.get("text") or ""
        citation = {
            "citation_id": index,
            "chunk_id": raw_result["chunk_id"],
            "document_id": str(_metadata_value(metadata, "document_id", "")),
            "document_filename": str(_metadata_value(metadata, "document_filename", "Document")),
            "page_number": int(_metadata_value(metadata, "page_number", 0)),
            "chunk_index": int(_metadata_value(metadata, "chunk_index", 0)),
            "distance": distance,
            "score": max(0.0, 1.0 - distance),
            "rerank_score": raw_result.get("rerank_score"),
        }
        context_blocks.append(
            "\n".join(
                [
                    f"[{index}] {citation['document_filename']} - page {citation['page_number']}",
                    text,
                ]
            )
        )
        results.append(
            {
                "citation_id": index,
                "text": text,
                "citation": citation,
            }
        )

    return {
        "query": query,
        "context": "\n\n".join(context_blocks),
        "results": results,
    }
