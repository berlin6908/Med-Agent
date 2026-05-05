from sqlalchemy import delete, select
import logging

from app.core.database import SessionLocal
from app.models import Document, DocumentChunk, DocumentPage
from app.services.chunking import chunk_text
from app.services.text_extraction import extract_document_pages, format_extracted_pages
from app.services.vector_store import delete_document_vectors, index_document_chunks
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _set_progress(
    db,
    document: Document,
    status: str,
    stage: str,
    progress: int,
    error_message: str | None = None,
) -> None:
    document.processing_status = status
    document.processing_stage = stage
    document.processing_progress = max(0, min(100, progress))
    document.error_message = error_message
    db.commit()


@celery_app.task(name="app.tasks.document_tasks.process_document")
def process_document(document_id: str) -> dict[str, str]:
    db = SessionLocal()
    try:
        logger.info("document_processing_started document_id=%s", document_id)
        document = db.scalar(select(Document).where(Document.id == document_id))
        if document is None:
            logger.warning("document_processing_missing document_id=%s", document_id)
            return {"status": "missing", "document_id": document_id}

        _set_progress(db, document, "processing", "Extracting text and OCR", 15)

        try:
            extracted_pages = extract_document_pages(document.storage_path, document.content_type)
        except Exception as exc:
            logger.exception("document_extraction_failed document_id=%s", document.id)
            _set_progress(db, document, "failed", "Text extraction failed", 100, str(exc))
            return {"status": "failed", "document_id": document_id}

        _set_progress(db, document, "processing", "Preparing pages and chunks", 45)
        delete_document_vectors(document.id)
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        db.execute(delete(DocumentPage).where(DocumentPage.document_id == document.id))

        extracted_text = format_extracted_pages(extracted_pages)
        document.extracted_text = extracted_text or None
        if extracted_text:
            _set_progress(db, document, "processing", "Creating retrieval chunks", 60)
            chunk_index = 0
            chunks: list[DocumentChunk] = []
            for extracted_page in extracted_pages:
                page = DocumentPage(
                    document_id=document.id,
                    page_number=extracted_page.page_number,
                    text=extracted_page.text,
                    extraction_method=extracted_page.extraction_method,
                )
                db.add(page)
                db.flush()

                for chunk in chunk_text(extracted_page.text):
                    document_chunk = DocumentChunk(
                        document_id=document.id,
                        page_id=page.id,
                        chunk_index=chunk_index,
                        page_number=extracted_page.page_number,
                        text=chunk.text,
                        char_start=chunk.char_start,
                        char_end=chunk.char_end,
                        embedding_status="pending",
                    )
                    db.add(document_chunk)
                    chunks.append(document_chunk)
                    chunk_index += 1

            db.flush()
            if chunks:
                _set_progress(db, document, "processing", "Embedding and indexing chunks", 80)
                try:
                    index_document_chunks(document, chunks)
                except Exception as exc:
                    logger.exception("document_indexing_failed document_id=%s", document.id)
                    for chunk in chunks:
                        chunk.embedding_status = "failed"
                    document.error_message = f"Embedding indexing failed: {exc}"
                else:
                    for chunk in chunks:
                        chunk.embedding_status = "indexed"

            document.processing_status = "completed"
            document.processing_stage = (
                "Ready"
                if all(chunk.embedding_status == "indexed" for chunk in chunks)
                else "Completed with indexing warning"
            )
            document.processing_progress = 100
            if all(chunk.embedding_status == "indexed" for chunk in chunks):
                document.error_message = None
        else:
            document.processing_status = "needs_ocr"
            document.processing_stage = "No readable text found"
            document.processing_progress = 100
            document.error_message = "No text was found by PDF text extraction or OCR."
        db.commit()
        logger.info(
            "document_processing_finished document_id=%s status=%s progress=%s",
            document.id,
            document.processing_status,
            document.processing_progress,
        )
        return {"status": document.processing_status, "document_id": document_id}
    finally:
        db.close()
