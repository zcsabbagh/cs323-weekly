import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getAssignment } from "@/lib/db";
import { createConversation } from "@/lib/tavus";

const TAVUS_REPLICA_ID = process.env.TAVUS_REPLICA_ID!;
const TAVUS_PERSONA_ID = process.env.TAVUS_PERSONA_ID!;

// Trim + strip trailing slashes defensively — a stray newline/whitespace in
// an env var silently produces malformed callback URLs that Tavus can't hit,
// which leaves every submission stuck at "pending" forever (April 2026 bug).
const APP_URL = (
  process.env.NEXT_PUBLIC_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "http://localhost:3000")
)
  .trim()
  .replace(/\/+$/, "");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const writtenResponse = (body.writtenResponse || "").trim();

  const conversationName = `interview-${id}-${uuid().slice(0, 8)}`;

  // Use the assignment's persona if it has one, otherwise fall back to env var
  const personaId = assignment.personaId || TAVUS_PERSONA_ID;

  // If the student pasted their written assignment, inject it as
  // conversational context so the Tavus agent can reference it.
  const conversationalContext = writtenResponse
    ? `The student has shared their written response to the reading. Use this as the primary grounding for your questions — ask them to expand on specific claims, challenge unclear points, and connect their writing to the assigned reading.\n\n---\nSTUDENT'S WRITTEN RESPONSE:\n${writtenResponse}`
    : "";

  const conversation = await createConversation({
    personaId,
    replicaId: TAVUS_REPLICA_ID,
    conversationName,
    conversationalContext,
    customGreeting: "Let's get started. What surprised you about the readings?",
    callbackUrl: `${APP_URL}/api/webhooks/tavus`,
    maxCallDuration: 360,
  });

  return NextResponse.json({
    conversationId: conversation.conversation_id,
    conversationUrl: conversation.conversation_url,
    conversationName: conversation.conversation_name,
  });
}
