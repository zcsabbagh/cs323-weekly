import { NextRequest, NextResponse } from "next/server";
import { getSubmissions, saveSubmission, getAssignment } from "@/lib/db";
import { v4 as uuid } from "uuid";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const submissions = await getSubmissions(id);
  return NextResponse.json(submissions);
}

async function getTranscriptFromStorage(roomName: string): Promise<string | null> {
  // Try filesystem first (agent may have written directly)
  try {
    const transcript = await fs.readFile(
      path.join(DATA_DIR, "transcripts", `${roomName}.txt`),
      "utf-8"
    );
    if (transcript) return transcript;
  } catch {
    // fall through to API check
  }
  // Also check via the transcripts API endpoint (covers agent saving via HTTP)
  try {
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${process.env.PORT || 3000}`;
    const res = await fetch(`${baseUrl}/api/transcripts?roomName=${encodeURIComponent(roomName)}`);
    if (res.ok) {
      const data = await res.json();
      return data.transcript || null;
    }
  } catch {
    // ignore
  }
  return null;
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
    // Wait for the agent to save the transcript (poll for up to 60s)
    let transcript: string | null = null;
    for (let i = 0; i < 30; i++) {
      transcript = await getTranscriptFromStorage(submission.conversationId);
      if (transcript) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!transcript) {
      throw new Error("Transcript not available after 60s");
    }

    submission.transcript = transcript;
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
  const { sunnetId, roomName, conversationId, duration } = body;

  // Support both roomName and conversationId
  const interviewId = roomName || conversationId;

  if (!sunnetId || !interviewId) {
    return NextResponse.json(
      { error: "sunnetId and roomName (or conversationId) required" },
      { status: 400 }
    );
  }

  const submission = {
    id: uuid(),
    assignmentId: id,
    sunnetId,
    conversationId: interviewId, // reuse field for roomName
    transcript: "",
    summary: "",
    score: "pending" as const,
    duration: duration || "0:00",
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };

  await saveSubmission(submission);

  processSubmission(id, submission.id).catch(console.error);

  return NextResponse.json(submission);
}
