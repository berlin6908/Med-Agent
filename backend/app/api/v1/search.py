from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models import User
from app.schemas.search import SearchRequest, SearchResult
from app.services.vector_store import query_user_chunks

router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=list[SearchResult])
def search_documents(
    payload: SearchRequest,
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    return query_user_chunks(current_user.id, payload.query, payload.top_k)
