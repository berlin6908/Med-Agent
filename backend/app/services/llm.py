from functools import lru_cache

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import settings

SYSTEM_INSTRUCTION = (
    "You answer questions about drug leaflets using only the supplied context. "
    "Cite sources with bracketed citation numbers like [1]. "
    "If the context does not contain the answer, say that the uploaded documents do not provide enough information. "
    "Do not provide medical advice; include a brief reminder to consult a qualified clinician or pharmacist."
)


@lru_cache
def get_chat_model() -> ChatGoogleGenerativeAI:
    if not settings.GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY is not configured")
    return ChatGoogleGenerativeAI(
        model=settings.LLM_MODEL,
        api_key=settings.GOOGLE_API_KEY,
        temperature=0.2,
        max_tokens=700,
    )


def build_grounded_messages(question: str, context: str) -> list[BaseMessage]:
    prompt = "\n\n".join(
        [
            "Context:",
            context or "No relevant context was found.",
            "Question:",
            question,
            "Answer with citations:",
        ]
    )
    return [SystemMessage(content=SYSTEM_INSTRUCTION), HumanMessage(content=prompt)]


def _message_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "".join(parts)
    return str(content or "")


def generate_grounded_answer(question: str, context: str) -> str:
    response = get_chat_model().invoke(build_grounded_messages(question, context))
    return _message_text(response.content).strip()


def stream_grounded_answer(question: str, context: str):
    for chunk in get_chat_model().stream(build_grounded_messages(question, context)):
        text = _message_text(chunk.content)
        if text:
            yield text
