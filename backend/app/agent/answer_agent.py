import logging

from app.agent.state import RagState
from app.services.llm import generate_grounded_answer

logger = logging.getLogger(__name__)

SAFE_FALLBACK_ANSWER = (
    "I could not find relevant information in your uploaded documents. "
    "Please consult a qualified clinician or pharmacist for medical guidance."
)


def answer_node(state: RagState) -> RagState:
    answer = generate_grounded_answer(state["question"], state.get("context", ""))
    logger.info(
        "answer_agent_generated user_id=%s intent=%s",
        state["user_id"],
        state.get("intent", "unknown"),
    )
    return {**state, "answer": answer}


def fallback_node(state: RagState) -> RagState:
    logger.info(
        "answer_agent_fallback_used user_id=%s intent=%s",
        state["user_id"],
        state.get("intent", "unknown"),
    )
    return {**state, "answer": SAFE_FALLBACK_ANSWER, "citation_warning": None}
