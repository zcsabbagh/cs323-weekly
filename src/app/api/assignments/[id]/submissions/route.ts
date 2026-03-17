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
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const body = await req.json();
  const { studentName, studentId, conversationId } = body;

  if (!studentName || !studentId || !conversationId) {
    return NextResponse.json(
      { error: "studentName, studentId, and conversationId required" },
      { status: 400 }
    );
  }

  const submission = {
    id: uuid(),
    assignmentId: id,
    studentName,
    studentId,
    conversationId,
    transcript: "",
    summary: "",
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };

  await saveSubmission(submission);

  // Kick off async processing
  fetch(
    `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/assignments/${id}/submissions/${submission.id}/process`,
    { method: "POST" }
  ).catch(console.error);

  return NextResponse.json(submission);
}
