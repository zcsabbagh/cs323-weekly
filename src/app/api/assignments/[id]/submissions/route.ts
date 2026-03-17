import { NextRequest, NextResponse } from "next/server";
import { getSubmissions, saveSubmission, getAssignment } from "@/lib/db";
import { getConversation } from "@/lib/elevenlabs";
import { summarizeTranscript } from "@/lib/anthropic";
import { v4 as uuid } from "uuid";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const submissions = await getSubmissions(id);
  return NextResponse.json(submissions);
}

async function processSubmission(assignmentId: string, submissionId: string) {
  const { getSubmission, saveSubmission: save, getAssignment: getAssign } =
    await import("@/lib/db");

  const submission = await getSubmission(assignmentId, submissionId);
  if (!submission) return;

  const assignment = await getAssign(assignmentId);
  if (!assignment) return;

  submission.status = "processing";
  await save(submission);

  try {
    // Wait for ElevenLabs to finish processing the conversation
    let convo = null;
    for (let i = 0; i < 30; i++) {
      convo = await getConversation(submission.conversationId);
      if (convo.status === "done") break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!convo || convo.status !== "done") {
      throw new Error("Conversation not ready after 60s");
    }

    const transcript = convo.transcript
      .map(
        (t: { role: string; message: string }) =>
          `${t.role === "agent" ? "Interviewer" : "Student"}: ${t.message}`
      )
      .join("\n\n");

    submission.transcript = transcript;

    const { summary, score } = await summarizeTranscript(
      transcript,
      assignment.context
    );
    submission.summary = summary;
    submission.score = score;
    submission.status = "complete";
  } catch (err) {
    console.error("Processing error:", err);
    submission.status = "error";
    submission.summary = `Error processing submission: ${err}`;
  }

  await save(submission);
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
  const { sunnetId, conversationId, duration } = body;

  if (!sunnetId || !conversationId) {
    return NextResponse.json(
      { error: "sunnetId and conversationId required" },
      { status: 400 }
    );
  }

  const submission = {
    id: uuid(),
    assignmentId: id,
    sunnetId,
    conversationId,
    transcript: "",
    summary: "",
    score: "pending" as const,
    duration: duration || "0:00",
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };

  await saveSubmission(submission);

  // Process inline — waitUntil not available in all runtimes,
  // so we process directly and return after.
  // The student already sees "Submitted" immediately from the client.
  // This runs server-side regardless of client connection.
  processSubmission(id, submission.id).catch(console.error);

  return NextResponse.json(submission);
}
