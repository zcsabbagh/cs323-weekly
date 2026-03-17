const API_BASE = "https://api.elevenlabs.io/v1";
const API_KEY = process.env.ELEVEN_API_KEY!;
const VOICE_ID = process.env.ELEVEN_VOICE_ID!;

function headers() {
  return {
    "xi-api-key": API_KEY,
    "Content-Type": "application/json",
  };
}

export async function createAgent(opts: {
  name: string;
  systemPrompt: string;
}): Promise<string> {
  const res = await fetch(`${API_BASE}/convai/agents/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: opts.name,
      conversation_config: {
        agent: {
          first_message:
            "Hi there! I'm ready to discuss this week's readings with you. Let's start — what stood out to you most from the readings?",
          language: "en",
          prompt: {
            prompt: opts.systemPrompt,
            llm: "gpt-4o",
            temperature: 0.7,
            max_tokens: 512,
          },
        },
        tts: {
          voice_id: VOICE_ID,
          model_id: "eleven_turbo_v2",
          stability: 0.5,
          similarity_boost: 0.8,
        },
        turn: {
          turn_timeout: 10,
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs create agent failed: ${err}`);
  }

  const data = await res.json();
  return data.agent_id;
}

export async function getConversation(conversationId: string) {
  const res = await fetch(
    `${API_BASE}/convai/conversations/${conversationId}`,
    { headers: headers() }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs get conversation failed: ${err}`);
  }

  return res.json();
}

export async function getSignedUrl(agentId: string): Promise<string> {
  const res = await fetch(
    `${API_BASE}/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: headers() }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs signed URL failed: ${err}`);
  }

  const data = await res.json();
  return data.signed_url;
}
