import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

    console.log(`[Tavus Webhook] ${event_type} for ${conversation_id}`);

    if (event_type === "application.transcription_ready") {
      const messages = properties?.transcript ?? [];

      const transcript = messages
        .map(({ role, content }) => {
          const speaker = role === "replica" ? "Interviewer" : "Student";
          return `${speaker}: ${content}`;
        })
        .join("\n\n");

      // Update the submission with the transcript (looked up by conversation_id)
      const { data, error } = await supabase
        .from("cs323_submissions")
        .update({
          transcript,
          status: "complete",
        })
        .eq("conversation_id", conversation_id)
        .select();

      if (error) {
        console.error("[Tavus Webhook] DB error:", error);
      } else {
        console.log(
          `[Tavus Webhook] Saved transcript for ${conversation_id}, updated ${data?.length || 0} rows`
        );
      }
    } else if (event_type === "system.shutdown") {
      console.log(
        `[Tavus Webhook] Conversation ${conversation_id} shut down: ${
          properties?.shutdown_reason ?? "unknown"
        }`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Tavus Webhook] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
