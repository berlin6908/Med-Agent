from datetime import UTC, datetime

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models import ChatMessage, ChatSession
from app.services.llm import generate_grounded_answer, stream_grounded_answer
from app.services.retrieval import build_retrieval_response


def _make_title(message: str) -> str:
    title = " ".join(message.split())
    return title[:80] or "New chat"


def get_or_create_session(db: Session, user_id: str, message: str, session_id: str | None) -> ChatSession:
    if session_id:
        session = db.scalar(
            select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id)
        )
        if session is not None:
            return session

    session = ChatSession(user_id=user_id, title=_make_title(message))
    db.add(session)
    db.flush()
    return session


def answer_question(
    db: Session,
    user_id: str,
    message: str,
    top_k: int | None = None,
    session_id: str | None = None,
) -> dict:
    session = get_or_create_session(db, user_id, message, session_id)
    retrieval = build_retrieval_response(user_id, message, top_k)
    citations = [item["citation"] for item in retrieval["results"]]

    if retrieval["context"]:
        answer = generate_grounded_answer(message, retrieval["context"])
    else:
        answer = (
            "I could not find relevant information in your uploaded documents. "
            "Please consult a qualified clinician or pharmacist for medical guidance."
        )

    db.add(ChatMessage(session_id=session.id, role="user", content=message))
    db.add(
        ChatMessage(
            session_id=session.id,
            role="assistant",
            content=answer,
            context=retrieval["context"],
            citations=citations,
        )
    )
    session.updated_at = datetime.now(UTC)
    db.commit()

    return {
        "session_id": session.id,
        "answer": answer,
        "citations": citations,
        "context": retrieval["context"],
    }


def save_chat_turn(
    db: Session,
    session: ChatSession,
    question: str,
    answer: str,
    context: str,
    citations: list[dict],
) -> None:
    db.add(ChatMessage(session_id=session.id, role="user", content=question))
    db.add(
        ChatMessage(
            session_id=session.id,
            role="assistant",
            content=answer,
            context=context,
            citations=citations,
        )
    )
    session.updated_at = datetime.now(UTC)
    db.commit()


def prepare_chat_answer(
    db: Session,
    user_id: str,
    message: str,
    top_k: int | None = None,
    session_id: str | None = None,
) -> tuple[ChatSession, dict, list[dict]]:
    session = get_or_create_session(db, user_id, message, session_id)
    retrieval = build_retrieval_response(user_id, message, top_k)
    citations = [item["citation"] for item in retrieval["results"]]
    return session, retrieval, citations


def stream_answer_chunks(message: str, context: str):
    if not context:
        yield (
            "I could not find relevant information in your uploaded documents. "
            "Please consult a qualified clinician or pharmacist for medical guidance."
        )
        return

    yield from stream_grounded_answer(message, context)


def list_sessions(db: Session, user_id: str) -> list[ChatSession]:
    return list(
        db.scalars(
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(desc(ChatSession.updated_at))
        )
    )


def get_session_detail(db: Session, user_id: str, session_id: str) -> dict | None:
    session = db.scalar(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id)
    )
    if session is None:
        return None

    messages = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at)
        )
    )
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
        "messages": [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "context": message.context,
                "citations": message.citations,
                "created_at": message.created_at.isoformat(),
            }
            for message in messages
        ],
    }
