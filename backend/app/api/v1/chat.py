import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import SessionLocal, get_db
from app.models import User
from app.schemas.chat import ChatRequest, ChatResponse, ChatSessionDetail, ChatSessionRead
from app.services.chat import (
    answer_question,
    get_session_detail,
    list_sessions,
    prepare_chat_answer,
    save_chat_turn,
    stream_answer_chunks,
)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return answer_question(db, current_user.id, payload.message, payload.top_k, payload.session_id)


@router.post("/stream")
def chat_stream(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    user_id = current_user.id

    def events():
        db = SessionLocal()
        try:
            session, retrieval, citations = prepare_chat_answer(
                db,
                user_id,
                payload.message,
                payload.top_k,
                payload.session_id,
            )
            yield json.dumps({"type": "session", "session_id": session.id}) + "\n"

            answer_parts: list[str] = []
            for chunk in stream_answer_chunks(payload.message, retrieval["context"]):
                answer_parts.append(chunk)
                yield json.dumps({"type": "token", "text": chunk}) + "\n"

            answer = "".join(answer_parts).strip()
            save_chat_turn(db, session, payload.message, answer, retrieval["context"], citations)
            yield (
                json.dumps(
                    {
                        "type": "done",
                        "session_id": session.id,
                        "answer": answer,
                        "citations": citations,
                        "context": retrieval["context"],
                    }
                )
                + "\n"
            )
        finally:
            db.close()

    return StreamingResponse(events(), media_type="application/x-ndjson")


@router.get("/sessions", response_model=list[ChatSessionRead])
def sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    return [
        {
            "id": session.id,
            "title": session.title,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
        }
        for session in list_sessions(db, current_user.id)
    ]


@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
def session_detail(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    session = get_session_detail(db, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    return session
