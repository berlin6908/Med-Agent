from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat import answer_question

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/run", response_model=ChatResponse)
def run_agent(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Agent-style entrypoint backed by the same LangGraph RAG workflow as chat."""

    return answer_question(db, current_user.id, payload.message, payload.top_k, payload.session_id)
