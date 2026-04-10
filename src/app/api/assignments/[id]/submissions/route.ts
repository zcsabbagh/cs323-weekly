import { NextRequest, NextResponse } from "next/server";
import { getSubmissions, saveSubmission, getAssignment } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const submissions = await getSubmissions(id);
  return NextResponse.json(submissions);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json(
      { error: "Assignment not found" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const { sunnetId, roomName, conversationId, duration } = body;

  // Support both roomName and conversationId
  const interviewId = conversationId || roomName;

  if (!sunnetId || !interviewId) {
    return NextResponse.json(
      { error: "sunnetId and conversationId (or roomName) required" },
      { status: 400 }
    );
  }

  const submission = {
    id: uuid(),
    assignmentId: id,
    sunnetId,
    conversationId: interviewId,
    transcript: "",
    summary: "",
    score: "pending" as const,
    duration: duration || "0:00",
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };

  await saveSubmission(submission);

  return NextResponse.json(submission);
}
