from datetime import datetime

from pydantic import BaseModel


class DocumentRead(BaseModel):
    id: str
    original_filename: str
    content_type: str
    file_size: int
    processing_status: str
    processing_stage: str
    processing_progress: int
    extracted_text: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListItem(BaseModel):
    id: str
    original_filename: str
    content_type: str
    file_size: int
    processing_status: str
    processing_stage: str
    processing_progress: int
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentPageRead(BaseModel):
    id: str
    page_number: int
    text: str
    extraction_method: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentChunkRead(BaseModel):
    id: str
    chunk_index: int
    page_number: int
    text: str
    char_start: int
    char_end: int
    embedding_status: str
    created_at: datetime

    model_config = {"from_attributes": True}
