import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getAssignment } from "@/lib/db";
import { createConversation } from "@/lib/tavus";

const TAVUS_REPLICA_ID = process.env.TAVUS_REPLICA_ID!;
const TAVUS_PERSONA_ID = process.env.TAVUS_PERSONA_ID!;

const APP_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "http://localhost:3000");

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

  // Use the assignment's persona if it has one, otherwise fall back to env var
  const personaId = assignment.personaId || TAVUS_PERSONA_ID;

  const conversation = await createConversation({
    personaId,
    replicaId: TAVUS_REPLICA_ID,
    conversationName,
    conversationalContext: "",
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
