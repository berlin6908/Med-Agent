from typing import Any

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    top_k: int | None = Field(default=None, ge=1, le=20)


class SearchResult(BaseModel):
    chunk_id: str
    text: str
    metadata: dict[str, Any]
    distance: float
