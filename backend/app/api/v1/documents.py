from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Document, DocumentChunk, DocumentPage, User
from app.schemas.document import DocumentChunkRead, DocumentListItem, DocumentPageRead, DocumentRead
from app.services.storage import delete_stored_file, save_upload_file
from app.tasks.document_tasks import process_document

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    original_filename, stored_filename, storage_path, file_size = save_upload_file(
        file,
        current_user.id,
    )
    document = Document(
        user_id=current_user.id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        content_type=file.content_type or "application/octet-stream",
        file_size=file_size,
        storage_path=storage_path,
        processing_status="queued",
        processing_stage="Queued for processing",
        processing_progress=5,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    process_document.delay(document.id)
    return document


@router.get("", response_model=list[DocumentListItem])
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Document]:
    return list(
        db.scalars(
            select(Document)
            .where(Document.user_id == current_user.id)
            .order_by(desc(Document.created_at))
        )
    )


@router.get("/{document_id}", response_model=DocumentRead)
def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


@router.get("/{document_id}/pages", response_model=list[DocumentPageRead])
def list_document_pages(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DocumentPage]:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return list(
        db.scalars(
            select(DocumentPage)
            .where(DocumentPage.document_id == document_id)
            .order_by(DocumentPage.page_number)
        )
    )


@router.get("/{document_id}/chunks", response_model=list[DocumentChunkRead])
def list_document_chunks(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DocumentChunk]:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return list(
        db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index)
        )
    )


@router.post("/{document_id}/process", response_model=DocumentRead)
def retry_document_processing(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    document.processing_status = "queued"
    document.processing_stage = "Queued for reprocessing"
    document.processing_progress = 5
    document.error_message = None
    db.commit()
    db.refresh(document)
    process_document.delay(document.id)
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    delete_stored_file(document.storage_path)
    db.delete(document)
    db.commit()
