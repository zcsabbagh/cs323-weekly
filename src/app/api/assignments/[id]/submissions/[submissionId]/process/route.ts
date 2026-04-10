import { NextRequest, NextResponse } from "next/server";
import { getSubmission, saveSubmission, getAssignment } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

async function getTranscriptFromStorage(roomName: string): Promise<string | null> {
  try {
    return await fs.readFile(
      path.join(DATA_DIR, "transcripts", `${roomName}.txt`),
      "utf-8"
    );
  } catch {
    return null;
  }
}

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
    // Try to get transcript from file storage (Tavus webhook saves it here)
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

  await saveSubmission(submission);
  return NextResponse.json(submission);
}
