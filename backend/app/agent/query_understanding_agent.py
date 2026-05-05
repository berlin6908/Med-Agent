import logging
import re

from app.agent.state import RagState

logger = logging.getLogger(__name__)

INTENT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("dosage", re.compile(r"\b(dose|dosage|take|tablet|capsule|mg|adult|child)\b|剂量|用量|服用|成人|儿童", re.I)),
    ("side_effects", re.compile(r"side effect|adverse|reaction|不良反应|副作用", re.I)),
    ("contraindications", re.compile(r"contraindication|avoid|allergy|do not take|禁忌|过敏|不能用", re.I)),
    ("interactions", re.compile(r"interaction|interact|with other medicine|相互作用|合用", re.I)),
    ("storage", re.compile(r"storage|store|temperature|keep|保存|储存|温度", re.I)),
    ("pregnancy_lactation", re.compile(r"pregnan|breastfeed|lactation|怀孕|妊娠|哺乳", re.I)),
]


def query_understanding_node(state: RagState) -> RagState:
    question = state["question"]
    for intent, pattern in INTENT_PATTERNS:
        if pattern.search(question):
            logger.info(
                "query_understanding_finished user_id=%s intent=%s",
                state["user_id"],
                intent,
            )
            return {
                **state,
                "intent": intent,
                "intent_reason": "Matched domain keyword pattern.",
            }

    logger.info("query_understanding_finished user_id=%s intent=general", state["user_id"])
    return {
        **state,
        "intent": "general",
        "intent_reason": "No specific medicine-leaflet intent pattern matched.",
    }
