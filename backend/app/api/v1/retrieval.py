from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models import User
from app.schemas.retrieval import RetrievalRequest, RetrievalResponse
from app.services.retrieval import build_retrieval_response

router = APIRouter(prefix="/retrieval", tags=["retrieval"])


@router.post("/query", response_model=RetrievalResponse)
def retrieve_context(
    payload: RetrievalRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    return build_retrieval_response(current_user.id, payload.query, payload.top_k)
