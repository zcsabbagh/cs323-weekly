import { NextRequest, NextResponse } from "next/server";
import { getAssignment } from "@/lib/db";
import { createParticipantToken, getLiveKitUrl } from "@/lib/livekit";
import { v4 as uuid } from "uuid";

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
  const participantName = body.participantName || `student-${uuid().slice(0, 8)}`;

  const roomName = `interview-${id}-${uuid().slice(0, 8)}`;

  // Build the system prompt to pass to the agent
  const context = assignment.context;
  const description = assignment.description;
  const systemPrompt = `You interview students about assigned readings for CS 323. This is a 5-minute interview.

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

${description ? `FOCUS ON THESE TOPICS:\n${description}` : ""}`;

  const metadata = JSON.stringify({
    assignmentId: id,
    systemPrompt,
    firstMessage: "Let's get started. What surprised you about the readings?",
  });

  const token = await createParticipantToken({
    roomName,
    participantName,
    agentName: "cs323-interviewer",
    metadata,
  });

  return NextResponse.json({
    token,
    roomName,
    url: getLiveKitUrl(),
  });
}
