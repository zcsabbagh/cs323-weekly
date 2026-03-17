#!/bin/bash
# Creates a Tavus persona configured for LiveKit transport.
# Run this ONCE to get your persona_id, then add it to .env.local
#
# Usage: TAVUS_API_KEY=your_key ./setup_tavus.sh

if [ -z "$TAVUS_API_KEY" ]; then
  echo "Error: TAVUS_API_KEY not set"
  exit 1
fi

echo "Creating Tavus persona for LiveKit..."
curl --request POST \
  --url https://tavusapi.com/v2/personas \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TAVUS_API_KEY" \
  -d '{
    "layers": {
        "transport": {
            "transport_type": "livekit"
        }
    },
    "persona_name": "CS323 Interview TA",
    "pipeline_mode": "echo"
}'

echo ""
echo "Copy the persona_id from the response above and add it to .env.local as TAVUS_PERSONA_ID"
echo "Also add your replica_id as TAVUS_REPLICA_ID"
