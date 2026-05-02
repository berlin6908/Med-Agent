from pydantic import BaseModel, Field


class RetrievalRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    top_k: int | None = Field(default=None, ge=1, le=20)


class RetrievalCitation(BaseModel):
    citation_id: int
    chunk_id: str
    document_id: str
    document_filename: str
    page_number: int
    chunk_index: int
    distance: float
    score: float
    rerank_score: float | None = None


class RetrievalContextItem(BaseModel):
    citation_id: int
    text: str
    citation: RetrievalCitation


class RetrievalResponse(BaseModel):
    query: str
    context: str
    results: list[RetrievalContextItem]
