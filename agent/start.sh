#!/bin/sh

# Write Google credentials from env var to file (for egress GCP upload)
if [ -n "$GOOGLE_APPLICATION_CREDENTIALS_BASE64" ]; then
  echo "$GOOGLE_APPLICATION_CREDENTIALS_BASE64" | base64 -d > /app/google-credentials.json
  export GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json
fi

exec uv run agent.py start
