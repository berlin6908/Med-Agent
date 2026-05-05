# Reference Project Alignment

Reference: https://github.com/RMA-MUN/LangChain-RAG-FastAPI-Service

## Why This Project Is Similar

The reference project presents an enterprise-style intelligent conversation service around FastAPI, LangChain, RAG, ChromaDB, authentication, persistent sessions, and a frontend chat experience.

Drug Leaflet RAG Agent follows the same product shape, but specializes it for medicine leaflet QA:

| Capability | Reference Project | Drug Leaflet RAG Agent |
|---|---|---|
| Web API | FastAPI chat/RAG service | FastAPI chat/document/RAG service |
| RAG framework | LangChain | LangGraph multi-agent orchestration + LangChain Gemini |
| Vector DB | ChromaDB | ChromaDB |
| User auth | JWT through user service | JWT in FastAPI |
| Session history | Persistent chat sessions | Persistent chat sessions in PostgreSQL |
| Document upload | Knowledge file ingestion | PDF/image leaflet upload |
| Document processing | Text/PDF knowledge files | OCR pipeline for leaflet photos and scanned PDFs |
| Reranking | Reranker service | Optional BGE reranker |
| Frontend | Chat UI | WhatsApp-style Next.js chat UI |
| Deployment | Service-oriented setup | Docker Compose stack with backend, frontend, PostgreSQL, Redis, Chroma, Celery |

## Intentional Differences

- This project does not split auth into a separate Django microservice. Keeping auth inside FastAPI reduces operational complexity for a portfolio project.
- This project uses PostgreSQL instead of MySQL because the rest of the backend already uses SQLAlchemy/Alembic and PostgreSQL works well for future pgvector migration.
- This project uses Next.js instead of Vue because the current frontend is already implemented and supports a polished chat-dashboard workflow.
- This project uses LangGraph for a multi-agent RAG workflow, which is a stronger agent-workflow story than a plain LangChain chain.
- This project is domain-specific. The reference is a general intelligent conversation service; this one is a medicine leaflet assistant with OCR, safety prompting, and source citations.

## Current Layer Mapping

```text
backend/app/agent/
  DrugLeafletAgent facade
  QueryUnderstandingAgent
  RetrievalAgent
  AnswerAgent
  CitationVerifierAgent

backend/app/services/rag_graph.py
  LangGraph supervisor workflow

backend/app/services/retrieval.py
  RAG context construction

backend/app/services/vector_store.py
  ChromaDB integration

backend/app/services/llm.py
  LangChain ChatGoogleGenerativeAI integration

backend/app/services/chat.py
  Session persistence and chat turn orchestration

backend/app/tasks/document_tasks.py
  Async ingestion pipeline
```

## Next Enhancements To Match The Reference Even More

1. Add a rate-limit middleware backed by Redis.
2. Add YAML config files for RAG parameters, prompts, and vector-store defaults.
3. Add browser E2E tests for login, upload, chat, and citation opening.
4. Add GitHub Actions CI for backend tests, frontend tests, typecheck, and build.
