import logging
from functools import lru_cache

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache
def get_reranker():
    if not settings.RERANKER_ENABLED or not settings.RERANKER_MODEL:
        return None

    import torch
    from FlagEmbedding import FlagReranker

    return FlagReranker(
        settings.RERANKER_MODEL,
        use_fp16=torch.cuda.is_available(),
    )


def rerank_chunks(query: str, chunks: list[dict], top_k: int) -> list[dict]:
    if not chunks:
        return []

    reranker = None
    try:
        reranker = get_reranker()
    except Exception as exc:
        logger.warning("Reranker unavailable; using vector order: %s", exc)

    if reranker is None:
        return chunks[:top_k]

    pairs = [[query, chunk.get("text") or ""] for chunk in chunks]
    try:
        try:
            scores = reranker.compute_score(pairs, normalize=True)
        except TypeError:
            scores = reranker.compute_score(pairs)
    except Exception as exc:
        logger.warning("Reranking failed; using vector order: %s", exc)
        return chunks[:top_k]

    if not isinstance(scores, list):
        scores = [scores]

    ranked: list[dict] = []
    for chunk, score in zip(chunks, scores, strict=False):
        ranked.append({**chunk, "rerank_score": float(score)})

    ranked.sort(key=lambda chunk: chunk["rerank_score"], reverse=True)
    return ranked[:top_k]
