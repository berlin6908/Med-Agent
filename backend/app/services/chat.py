from datetime import UTC, datetime

from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session

from app.agent.leaflet_agent import get_leaflet_agent
from app.models import ChatMessage, ChatSession


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
    agent_result = get_leaflet_agent().answer(user_id, message, top_k)

    db.add(ChatMessage(session_id=session.id, role="user", content=message))
    db.add(
        ChatMessage(
            session_id=session.id,
            role="assistant",
            content=agent_result.answer,
            context=agent_result.context,
            citations=agent_result.citations,
        )
    )
    session.updated_at = datetime.now(UTC)
    db.commit()

    return {
        "session_id": session.id,
        "answer": agent_result.answer,
        "citations": agent_result.citations,
        "context": agent_result.context,
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
    agent_result = get_leaflet_agent().retrieve(user_id, message, top_k)
    return session, agent_result.retrieval, agent_result.citations


def stream_answer_chunks(message: str, context: str):
    yield from get_leaflet_agent().stream_answer(message, context)


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


def delete_session(db: Session, user_id: str, session_id: str) -> bool:
    session = db.scalar(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id)
    )
    if session is None:
        return False

    db.execute(delete(ChatMessage).where(ChatMessage.session_id == session.id))
    db.delete(session)
    db.commit()
    return True
