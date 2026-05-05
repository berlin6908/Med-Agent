from typing import Any, TypedDict


class RagState(TypedDict, total=False):
    user_id: str
    question: str
    top_k: int | None
    intent: str
    intent_reason: str
    retrieval: dict[str, Any]
    context: str
    citations: list[dict]
    answer: str
    has_context: bool
    citation_warning: str | None
