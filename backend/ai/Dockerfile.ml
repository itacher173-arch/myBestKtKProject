FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt /tmp/requirements.txt
COPY backend/ai/requirements-ml.txt /tmp/requirements-ml.txt
RUN pip install --no-cache-dir \
    -r /tmp/requirements.txt \
    -r /tmp/requirements-ml.txt

COPY backend /app/backend
COPY frontend/trainer/src/training/catalog.json /app/frontend/trainer/src/training/catalog.json

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    KTK_HOST=0.0.0.0

EXPOSE 8109
CMD ["python", "-m", "backend.ml.app", "--host", "0.0.0.0", "--port", "8109"]
