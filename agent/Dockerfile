FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy project files (paths relative to repo root since Railway builds from root)
COPY agent/pyproject.toml agent/uv.lock ./
RUN uv sync --frozen

# Copy agent code
COPY agent/agent.py .
COPY agent/start.sh .
RUN chmod +x start.sh

# Download model files (VAD etc)
RUN uv run agent.py download-files

CMD ["./start.sh"]
