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

  // Only pass assignmentId — agent fetches the full context from the API
  const metadata = JSON.stringify({
    assignmentId: id,
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
