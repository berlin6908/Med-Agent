FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System dependencies for PaddleOCR, PyMuPDF, image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgomp1 \
        poppler-utils \
        tesseract-ocr \
        curl \
    && rm -rf /var/lib/apt/lists/*

ARG INSTALL_DEV=false

COPY pyproject.toml ./
RUN pip install --upgrade pip \
    && if [ "$INSTALL_DEV" = "true" ]; then pip install -e ".[dev]"; else pip install -e .; fi

COPY . .

RUN mkdir -p /app/storage/uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
