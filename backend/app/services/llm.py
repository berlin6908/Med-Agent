from functools import lru_cache

from app.core.config import settings


@lru_cache
def _configure_google_llm() -> None:
    import google.generativeai as genai

    if not settings.GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY is not configured")
    genai.configure(api_key=settings.GOOGLE_API_KEY)


def generate_grounded_answer(question: str, context: str) -> str:
    import google.generativeai as genai

    _configure_google_llm()
    model = genai.GenerativeModel(
        settings.LLM_MODEL,
        system_instruction=(
            "You answer questions about drug leaflets using only the supplied context. "
            "Cite sources with bracketed citation numbers like [1]. "
            "If the context does not contain the answer, say that the uploaded documents do not provide enough information. "
            "Do not provide medical advice; include a brief reminder to consult a qualified clinician or pharmacist."
        ),
    )
    prompt = "\n\n".join(
        [
            "Context:",
            context or "No relevant context was found.",
            "Question:",
            question,
            "Answer with citations:",
        ]
    )
    response = model.generate_content(
        prompt,
        generation_config={
            "temperature": 0.2,
            "max_output_tokens": 700,
        },
    )
    return (getattr(response, "text", "") or "").strip()


def stream_grounded_answer(question: str, context: str):
    import google.generativeai as genai

    _configure_google_llm()
    model = genai.GenerativeModel(
        settings.LLM_MODEL,
        system_instruction=(
            "You answer questions about drug leaflets using only the supplied context. "
            "Cite sources with bracketed citation numbers like [1]. "
            "If the context does not contain the answer, say that the uploaded documents do not provide enough information. "
            "Do not provide medical advice; include a brief reminder to consult a qualified clinician or pharmacist."
        ),
    )
    prompt = "\n\n".join(
        [
            "Context:",
            context or "No relevant context was found.",
            "Question:",
            question,
            "Answer with citations:",
        ]
    )
    response = model.generate_content(
        prompt,
        generation_config={
            "temperature": 0.2,
            "max_output_tokens": 700,
        },
        stream=True,
    )
    for chunk in response:
        text = getattr(chunk, "text", "") or ""
        if text:
            yield text
