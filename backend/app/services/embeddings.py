from functools import lru_cache

from app.core.config import settings


@lru_cache
def _configure_google_embeddings() -> None:
    import google.generativeai as genai

    if not settings.GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY is not configured")
    genai.configure(api_key=settings.GOOGLE_API_KEY)


def embed_texts(texts: list[str], task_type: str = "retrieval_document") -> list[list[float]]:
    import google.generativeai as genai

    if not texts:
        return []

    _configure_google_embeddings()
    model = settings.EMBEDDING_MODEL
    if model == "text-embedding-004":
        model = "gemini-embedding-001"
    if not model.startswith("models/"):
        model = f"models/{model}"
    response = genai.embed_content(
        model=model,
        content=texts,
        task_type=task_type,
        output_dimensionality=settings.EMBEDDING_DIMENSIONS,
    )
    embeddings = response.get("embedding")
    if not isinstance(embeddings, list):
        raise RuntimeError("Embedding response did not include embeddings")
    if embeddings and isinstance(embeddings[0], (int, float)):
        return [embeddings]
    return embeddings


def embed_query(text: str) -> list[float]:
    return embed_texts([text], task_type="retrieval_query")[0]
