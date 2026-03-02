FROM python:3.11-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    redis-tools \
    postgresql-client \
    kubectl \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
RUN pip install --no-cache-dir \
    redis==5.0.1 \
    psycopg2-binary==2.9.9 \
    kubernetes==28.1.0

# Copy coordinator script
COPY scripts/larry-coordinator-real.py /app/coordinator.py
RUN chmod +x /app/coordinator.py

WORKDIR /app

# Run coordinator
CMD ["python3", "/app/coordinator.py"]
