import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getAssignment } from "@/lib/db";
import { createConversation } from "@/lib/tavus";

const APP_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "http://localhost:3000");

function buildContext(context: string, description: string): string {
  return `You interview students about assigned readings for CS 323. This is a 5-minute interview.

RULES:
- Keep every response UNDER 10 words, then ask ONE question.
- No introductions, no pleasantries, no filler.
- Be direct and conversational. Sound like a chill but sharp TA.
- Ask general, opinion-based questions — NOT trivia or specific details.
- Examples: "What was the main argument?", "Did you agree with the authors?", "What was the most surprising claim?", "How does this connect to what we discussed last week?", "What would you push back on?"
- Ask about 12 questions total across the 5 minutes. Move briskly between topics.
- If they're vague, ask a follow-up to get them to elaborate — not a gotcha.
- After ~4 minutes, wrap up: "Alright, any last thoughts?"

READING CONTEXT:
${context}

${description ? "FOCUS ON THESE TOPICS:\n" + description : ""}`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conversationName = `interview-${id}-${uuid().slice(0, 8)}`;
  const conversationalContext = buildContext(
    assignment.context,
    assignment.description
  );

  const conversation = await createConversation({
    personaId: process.env.TAVUS_PERSONA_ID!,
    replicaId: process.env.TAVUS_REPLICA_ID!,
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
