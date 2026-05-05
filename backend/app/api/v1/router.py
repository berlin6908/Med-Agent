from fastapi import APIRouter

from app.api.v1 import agent, auth, chat, documents, health, retrieval, search

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(agent.router)
api_router.include_router(chat.router)
api_router.include_router(documents.router)
api_router.include_router(retrieval.router)
api_router.include_router(search.router)
api_router.include_router(health.router, tags=["health"])
