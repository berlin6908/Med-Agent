from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.retrieval import RetrievalCitation


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    top_k: int | None = Field(default=None, ge=1, le=20)
    session_id: str | None = None


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    citations: list[RetrievalCitation]
    context: str


class ChatMessageRead(BaseModel):
    id: str
    role: str
    content: str
    context: str | None
    citations: list[dict] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionRead(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionDetail(ChatSessionRead):
    messages: list[ChatMessageRead]
