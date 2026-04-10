const TAVUS_API_KEY = process.env.TAVUS_API_KEY!;
const TAVUS_BASE_URL = "https://tavusapi.com/v2";

export interface TavusConversation {
  conversation_id: string;
  conversation_name: string;
  conversation_url: string;
  status: string;
  created_at: string;
}

export async function createConversation(opts: {
  personaId: string;
  replicaId: string;
  conversationName: string;
  conversationalContext: string;
  customGreeting: string;
  callbackUrl: string;
  maxCallDuration?: number;
}): Promise<TavusConversation> {
  const res = await fetch(`${TAVUS_BASE_URL}/conversations`, {
    method: "POST",
    headers: {
      "x-api-key": TAVUS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persona_id: opts.personaId,
      replica_id: opts.replicaId,
      conversation_name: opts.conversationName,
      conversational_context: opts.conversationalContext,
      custom_greeting: opts.customGreeting,
      callback_url: opts.callbackUrl,
      properties: {
        max_call_duration: opts.maxCallDuration ?? 360,
        participant_left_timeout: 5,
        participant_absent_timeout: 120,
        enable_recording: false,
        enable_closed_captions: true,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavus createConversation failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function endConversation(conversationId: string): Promise<void> {
  const res = await fetch(`${TAVUS_BASE_URL}/conversations/${conversationId}/end`, {
    method: "POST",
    headers: {
      "x-api-key": TAVUS_API_KEY,
    },
  });

  // 400 means the conversation has already ended — ignore it
  if (!res.ok && res.status !== 400) {
    const text = await res.text();
    throw new Error(`Tavus endConversation failed (${res.status}): ${text}`);
  }
}

export async function getConversation(conversationId: string): Promise<TavusConversation & Record<string, unknown>> {
  const res = await fetch(`${TAVUS_BASE_URL}/conversations/${conversationId}?verbose=true`, {
    headers: {
      "x-api-key": TAVUS_API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavus getConversation failed (${res.status}): ${text}`);
  }

  return res.json();
}
