from functools import lru_cache
from dataclasses import dataclass
from pathlib import Path
import subprocess
from tempfile import NamedTemporaryFile

from app.core.config import settings


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str
    extraction_method: str


@lru_cache
def get_ocr_engine():
    from paddleocr import PaddleOCR

    language = settings.ocr_languages_list[0] if settings.ocr_languages_list else "en"
    return PaddleOCR(
        lang=language,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        enable_mkldnn=False,
    )


def extract_image_text(storage_path: str) -> str:
    ocr_result = get_ocr_engine().predict(storage_path)
    lines: list[str] = []

    for page_result in ocr_result:
        texts = page_result.get("rec_texts", [])
        scores = page_result.get("rec_scores", [])
        for text, score in zip(texts, scores, strict=False):
            if text and score >= 0.3:
                lines.append(text.strip())

    return "\n".join(line for line in lines if line)


def extract_image_text_tesseract(storage_path: str) -> str:
    try:
        result = subprocess.run(
            ["tesseract", storage_path, "stdout", "-l", "eng", "--psm", "6"],
            capture_output=True,
            check=False,
            text=True,
            timeout=90,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""

    if result.returncode != 0:
        return ""
    return "\n".join(line.strip() for line in result.stdout.splitlines() if line.strip())


def _ocr_pdf_page(page) -> str:
    import fitz

    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    with NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        temp_path = Path(tmp.name)
    try:
        pixmap.save(str(temp_path))
        text = extract_image_text_tesseract(str(temp_path)).strip()
        if len(text) >= 100:
            return text
        return extract_image_text(str(temp_path))
    finally:
        temp_path.unlink(missing_ok=True)


def extract_pdf_pages(storage_path: str) -> list[ExtractedPage]:
    import fitz

    pages: list[ExtractedPage] = []
    with fitz.open(storage_path) as document:
        for page_number, page in enumerate(document, start=1):
            text = page.get_text("text").strip()
            extraction_method = "pdf_text"
            if not text:
                text = _ocr_pdf_page(page).strip()
                extraction_method = "ocr"
            if text:
                pages.append(
                    ExtractedPage(
                        page_number=page_number,
                        text=text,
                        extraction_method=extraction_method,
                    )
                )
    return pages


def extract_document_pages(storage_path: str, content_type: str) -> list[ExtractedPage]:
    path = Path(storage_path)
    if not path.exists():
        raise FileNotFoundError(f"Stored file does not exist: {storage_path}")

    if content_type == "application/pdf" or path.suffix.lower() == ".pdf":
        return extract_pdf_pages(storage_path)

    if content_type.startswith("image/") or path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
        text = extract_image_text_tesseract(storage_path)
        if len(text) < 100:
            text = extract_image_text(storage_path)
        if text:
            return [ExtractedPage(page_number=1, text=text, extraction_method="ocr")]
        return []

    return []


def format_extracted_pages(pages: list[ExtractedPage]) -> str:
    return "\n\n".join(f"[Page {page.page_number}]\n{page.text}" for page in pages)


def extract_document_text(storage_path: str, content_type: str) -> str:
    return format_extracted_pages(extract_document_pages(storage_path, content_type))
