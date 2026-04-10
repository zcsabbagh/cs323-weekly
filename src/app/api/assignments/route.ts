import { NextRequest, NextResponse } from "next/server";
import { getAssignments, saveAssignment } from "@/lib/db";
import { createDriveFolder } from "@/lib/google-drive";
import { createPersona } from "@/lib/tavus";
import { v4 as uuid } from "uuid";

const TAVUS_REPLICA_ID = process.env.TAVUS_REPLICA_ID!;

export const maxDuration = 60;

export async function GET() {
  const assignments = await getAssignments();
  return NextResponse.json(assignments);
}

function buildSystemPrompt(context: string, description: string): string {
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

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, context } = body;

  if (!title || !context) {
    return NextResponse.json(
      { error: "Title and context required" },
      { status: 400 }
    );
  }

  // Create a Google Drive folder for this assignment's recordings
  let driveFolderId: string | undefined;
  try {
    driveFolderId = await createDriveFolder(`CS323 - ${title}`);
  } catch (err) {
    console.error("Failed to create Drive folder:", err);
  }

  // Create a Tavus persona with the reading context baked in
  let personaId: string | undefined;
  try {
    const persona = await createPersona({
      name: `CS323 - ${title}`,
      systemPrompt: buildSystemPrompt(context, description || ""),
      replicaId: TAVUS_REPLICA_ID,
    });
    personaId = persona.persona_id;
  } catch (err) {
    console.error("Failed to create Tavus persona:", err);
  }

  const assignment = {
    id: uuid(),
    title,
    description: description || "",
    context,
    agentId: "tavus",
    personaId,
    driveFolderId,
    createdAt: new Date().toISOString(),
  };

  await saveAssignment(assignment);
  return NextResponse.json(assignment);
}
