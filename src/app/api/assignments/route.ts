import { NextRequest, NextResponse } from "next/server";
import { getAssignments, saveAssignment } from "@/lib/db";
import { v4 as uuid } from "uuid";

export const maxDuration = 60;

export async function GET() {
  const assignments = await getAssignments();
  return NextResponse.json(assignments);
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

  // No longer need to create an external agent — the LiveKit Python agent
  // receives the system prompt dynamically via dispatch metadata
  const assignment = {
    id: uuid(),
    title,
    description: description || "",
    context,
    agentId: "livekit", // marker — agent is dispatched dynamically
    createdAt: new Date().toISOString(),
  };

  await saveAssignment(assignment);
  return NextResponse.json(assignment);
}
