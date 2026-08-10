FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY backend /app/backend
COPY frontend/src/knowledge/seed.json /app/frontend/src/knowledge/seed.json
COPY frontend/src/miniTraining/catalog.json /app/frontend/src/miniTraining/catalog.json

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    KTK_HOST=0.0.0.0 \
    DATABASE_URL=postgresql://ktk:ktk@postgres:5432/ktk \
    REDIS_URL=redis://redis:6379/0

RUN mkdir -p /app/backend/runtime

EXPOSE 8000 8010 8102 8106
CMD ["python", "-m", "backend.run_all", "--host", "0.0.0.0"]
