# Kaigo API for Cloud Run. Build context: repository root (backend + data).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY data data

RUN useradd --create-home --uid 10001 kaigo
USER kaigo
WORKDIR /app/backend
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers
