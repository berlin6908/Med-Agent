from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}


def _safe_original_filename(filename: str | None) -> str:
    if not filename:
        return "upload"
    return Path(filename).name[:255] or "upload"


def _validate_upload(file: UploadFile) -> tuple[str, str]:
    original_filename = _safe_original_filename(file.filename)
    extension = Path(original_filename).suffix.lower()
    content_type = file.content_type or "application/octet-stream"

    if content_type in ALLOWED_CONTENT_TYPES:
        return original_filename, ALLOWED_CONTENT_TYPES[content_type]

    if extension in ALLOWED_EXTENSIONS:
        return original_filename, extension

    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Only PDF, JPEG, PNG, and WebP files are supported",
    )


def save_upload_file(file: UploadFile, user_id: str) -> tuple[str, str, str, int]:
    original_filename, extension = _validate_upload(file)
    upload_root = Path(settings.UPLOAD_DIR)
    user_dir = upload_root / user_id
    user_dir.mkdir(parents=True, exist_ok=True)

    stored_filename = f"{uuid4()}{extension}"
    destination = user_dir / stored_filename
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    file_size = 0

    try:
        with destination.open("wb") as output:
            while chunk := file.file.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > max_size:
                    output.close()
                    destination.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB limit",
                    )
                output.write(chunk)
    finally:
        file.file.close()

    if file_size == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    return original_filename, stored_filename, str(destination), file_size


def delete_stored_file(storage_path: str) -> None:
    path = Path(storage_path)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
