import logging

from app.agent.state import RagState
from app.services.retrieval import build_retrieval_response

logger = logging.getLogger(__name__)


def retrieval_node(state: RagState) -> RagState:
    logger.info(
        "retrieval_agent_started user_id=%s intent=%s",
        state["user_id"],
        state.get("intent", "unknown"),
    )
    retrieval = build_retrieval_response(
        state["user_id"],
        state["question"],
        state.get("top_k"),
    )
    citations = [item["citation"] for item in retrieval["results"]]
    context = retrieval["context"]
    logger.info(
        "retrieval_agent_finished user_id=%s result_count=%s has_context=%s",
        state["user_id"],
        len(retrieval["results"]),
        bool(context),
    )
    return {
        **state,
        "retrieval": retrieval,
        "context": context,
        "citations": citations,
        "has_context": bool(context),
    }


def route_context_node(state: RagState) -> str:
    return "answer" if state.get("has_context") else "fallback"
