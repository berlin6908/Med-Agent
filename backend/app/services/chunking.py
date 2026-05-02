from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class TextChunk:
    text: str
    char_start: int
    char_end: int


def chunk_text(
    text: str,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[TextChunk]:
    clean_text = " ".join(text.split())
    if not clean_text:
        return []

    size = chunk_size or settings.CHUNK_SIZE
    overlap = chunk_overlap if chunk_overlap is not None else settings.CHUNK_OVERLAP
    overlap = max(0, min(overlap, size - 1))

    chunks: list[TextChunk] = []
    start = 0
    while start < len(clean_text):
        end = min(start + size, len(clean_text))
        if end < len(clean_text):
            split_at = clean_text.rfind(" ", start, end)
            if split_at > start + size // 2:
                end = split_at
        chunk = clean_text[start:end].strip()
        if chunk:
            chunks.append(TextChunk(text=chunk, char_start=start, char_end=end))
        if end >= len(clean_text):
            break
        start = max(end - overlap, start + 1)

    return chunks
