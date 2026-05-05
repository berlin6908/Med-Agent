from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

from fastapi import Request
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging

import logging

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid4()))
        start = perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((perf_counter() - start) * 1000, 2)
            logger.exception(
                "request_failed method=%s path=%s request_id=%s duration_ms=%s",
                request.method,
                request.url.path,
                request_id,
                duration_ms,
            )
            raise

        duration_ms = round((perf_counter() - start) * 1000, 2)
        response.headers["x-request-id"] = request_id
        logger.info(
            "request_completed method=%s path=%s status_code=%s request_id=%s duration_ms=%s",
            request.method,
            request.url.path,
            response.status_code,
            request_id,
            duration_ms,
        )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        description="RAG-powered Q&A over drug leaflets uploaded by the user.",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(RequestLoggingMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {
        "name": settings.APP_NAME,
        "version": "0.1.0",
        "docs": "/docs",
    }
