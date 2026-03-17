FROM python:3.13-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

COPY agent.py .

RUN uv run agent.py download-files

CMD ["uv", "run", "agent.py", "start"]
