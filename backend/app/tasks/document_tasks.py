from sqlalchemy import delete, select

from app.core.database import SessionLocal
from app.models import Document, DocumentChunk, DocumentPage
from app.services.chunking import chunk_text
from app.services.text_extraction import extract_document_pages, format_extracted_pages
from app.services.vector_store import delete_document_vectors, index_document_chunks
from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.document_tasks.process_document")
def process_document(document_id: str) -> dict[str, str]:
    db = SessionLocal()
    try:
        document = db.scalar(select(Document).where(Document.id == document_id))
        if document is None:
            return {"status": "missing", "document_id": document_id}

        document.processing_status = "processing"
        document.error_message = None
        db.commit()

        try:
            extracted_pages = extract_document_pages(document.storage_path, document.content_type)
        except Exception as exc:
            document.processing_status = "failed"
            document.error_message = str(exc)
            db.commit()
            return {"status": "failed", "document_id": document_id}

        delete_document_vectors(document.id)
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        db.execute(delete(DocumentPage).where(DocumentPage.document_id == document.id))

        extracted_text = format_extracted_pages(extracted_pages)
        document.extracted_text = extracted_text or None
        if extracted_text:
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
                try:
                    index_document_chunks(document, chunks)
                except Exception as exc:
                    for chunk in chunks:
                        chunk.embedding_status = "failed"
                    document.error_message = f"Embedding indexing failed: {exc}"
                else:
                    for chunk in chunks:
                        chunk.embedding_status = "indexed"

            document.processing_status = "completed"
            if all(chunk.embedding_status == "indexed" for chunk in chunks):
                document.error_message = None
        else:
            document.processing_status = "needs_ocr"
            document.error_message = "No text was found by PDF text extraction or OCR."
        db.commit()
        return {"status": document.processing_status, "document_id": document_id}
    finally:
        db.close()
