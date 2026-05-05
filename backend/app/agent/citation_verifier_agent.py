import logging
import re

from app.agent.state import RagState

logger = logging.getLogger(__name__)


def citation_verifier_node(state: RagState) -> RagState:
    answer = state.get("answer", "")
    citations = state.get("citations", [])
    if citations and not re.search(r"\[\d+\]", answer):
        warning = "Answer did not include a bracketed citation marker."
        logger.warning(
            "citation_verifier_warning user_id=%s warning=%s",
            state["user_id"],
            warning,
        )
        return {**state, "citation_warning": warning}
    return {**state, "citation_warning": None}
