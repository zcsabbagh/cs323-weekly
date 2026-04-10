import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

interface TavusWebhookPayload {
  event_type: string;
  conversation_id: string;
  properties?: {
    transcript?: { role: string; content: string }[];
    shutdown_reason?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const payload: TavusWebhookPayload = await req.json();
    const { event_type, conversation_id, properties } = payload;

    if (event_type === "application.transcription_ready") {
      const messages = properties?.transcript ?? [];

      const formatted = messages
        .map(({ role, content }) => {
          const speaker = role === "replica" ? "Interviewer" : "Student";
          return `${speaker}: ${content}`;
        })
        .join("\n\n");

      const dir = path.join(DATA_DIR, "transcripts");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${conversation_id}.txt`), formatted);
    } else if (event_type === "system.shutdown") {
      const shutdown_reason = properties?.shutdown_reason ?? "unknown";
      console.log(
        `[Tavus Webhook] Conversation ${conversation_id} shut down: ${shutdown_reason}`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Tavus Webhook] Error handling webhook:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
