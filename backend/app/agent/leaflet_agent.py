from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterator

from app.services.llm import stream_grounded_answer
from app.services.rag_graph import SAFE_FALLBACK_ANSWER, invoke_rag_graph, retrieve_for_rag


@dataclass(frozen=True)
class LeafletAgentResult:
    question: str
    answer: str
    context: str
    citations: list[dict[str, Any]]
    retrieval: dict[str, Any]
    citation_warning: str | None = None


class DrugLeafletAgent:
    """Thin agent facade over the LangGraph RAG workflow.

    The HTTP/chat service owns persistence. This class owns the AI workflow boundary:
    retrieval, context routing, grounded answer generation, fallback, and streaming.
    """

    def answer(self, user_id: str, question: str, top_k: int | None = None) -> LeafletAgentResult:
        state = invoke_rag_graph(user_id, question, top_k)
        return self._from_graph_state(question, state)

    def retrieve(self, user_id: str, question: str, top_k: int | None = None) -> LeafletAgentResult:
        state = retrieve_for_rag(user_id, question, top_k)
        retrieval = state.get("retrieval") or {"context": "", "results": []}
        citations = state.get("citations") or []
        return LeafletAgentResult(
            question=question,
            answer="",
            context=retrieval["context"],
            citations=citations,
            retrieval=retrieval,
            citation_warning=state.get("citation_warning"),
        )

    def stream_answer(self, question: str, context: str) -> Iterator[str]:
        if not context:
            yield SAFE_FALLBACK_ANSWER
            return

        yield from stream_grounded_answer(question, context)

    def _from_graph_state(self, question: str, state: dict[str, Any]) -> LeafletAgentResult:
        retrieval = state.get("retrieval") or {"context": "", "results": []}
        return LeafletAgentResult(
            question=question,
            answer=state.get("answer") or SAFE_FALLBACK_ANSWER,
            context=retrieval["context"],
            citations=state.get("citations") or [],
            retrieval=retrieval,
            citation_warning=state.get("citation_warning"),
        )


@lru_cache
def get_leaflet_agent() -> DrugLeafletAgent:
    return DrugLeafletAgent()
