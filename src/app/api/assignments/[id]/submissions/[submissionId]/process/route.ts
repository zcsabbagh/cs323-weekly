import { NextRequest, NextResponse } from "next/server";
import { getSubmission, saveSubmission, getAssignment } from "@/lib/db";
import { getConversation } from "@/lib/elevenlabs";
import { summarizeTranscript } from "@/lib/anthropic";

export async function POST(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const { id, submissionId } = await params;

  const submission = await getSubmission(id, submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  submission.status = "processing";
  await saveSubmission(submission);

  try {
    // Retry fetching conversation until it's done (max 30 attempts, 2s apart)
    let convo = null;
    for (let i = 0; i < 30; i++) {
      convo = await getConversation(submission.conversationId);
      if (convo.status === "done") break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!convo || convo.status !== "done") {
      throw new Error("Conversation not ready after 60s");
    }

    // Build transcript string
    const transcript = convo.transcript
      .map(
        (t: { role: string; message: string }) =>
          `${t.role === "agent" ? "Interviewer" : "Student"}: ${t.message}`
      )
      .join("\n\n");

    submission.transcript = transcript;

    // Summarize with Anthropic
    submission.summary = await summarizeTranscript(transcript, assignment.context);
    submission.status = "complete";
  } catch (err) {
    console.error("Processing error:", err);
    submission.status = "error";
    submission.summary = `Error processing submission: ${err}`;
  }

  await saveSubmission(submission);
  return NextResponse.json(submission);
}
