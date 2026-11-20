FROM python:3.11-slim

WORKDIR /app

# Install system build dependencies for asyncpg, pynacl, and pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY . .

# Create non-root system user and prepare uploads directory
RUN useradd -m -u 1000 appuser && \
    mkdir -p uploads && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

# Production server: run with 2 workers for high-concurrency event loops
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--timeout-graceful-shutdown", "5"]
