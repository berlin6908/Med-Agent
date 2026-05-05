# Deployment

This project has two Compose profiles:

- `docker-compose.yml` for local development with bind mounts and hot reload.
- `docker-compose.prod.yml` for production-like runs without source bind mounts.

## Production-Like Run

```powershell
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
docker compose -f docker-compose.prod.yml --env-file .env exec backend alembic upgrade head
```

## Notes

- Do not expose PostgreSQL, Redis, or ChromaDB publicly.
- Rotate `JWT_SECRET_KEY` and `GOOGLE_API_KEY` before a real deployment.
- Set `BACKEND_CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to the deployed domains.
- Keep `backend_storage`, `postgres_data`, `redis_data`, and `chroma_data` on persistent storage.
