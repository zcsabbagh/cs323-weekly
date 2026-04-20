import { NextRequest, NextResponse } from "next/server";
import { getSubmissions, saveSubmission, getAssignment } from "@/lib/db";
import { getConversation } from "@/lib/tavus";
import { v4 as uuid } from "uuid";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const submissions = await getSubmissions(id);
  return NextResponse.json(submissions);
}

// Tavus's verbose GET returns events[]; transcription_ready's properties
// contain the same role/content shape as the webhook handler's payload.
interface TavusEvent {
  event_type: string;
  properties?: { transcript?: { role: string; content: string }[] };
}

function formatTranscript(
  messages: { role: string; content: string }[]
): string {
  return messages
    .filter((m) => m.role !== "system")
    .map(({ role, content }) => {
      const isInterviewer = role === "assistant" || role === "replica";
      const speaker = isInterviewer ? "Interviewer" : "Student";
      return `${speaker}: ${content}`;
    })
    .join("\n\n");
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

  // Race-condition guard: if the Tavus transcription_ready webhook
  // already fired before this submission row existed (common when a
  // student ends the interview and quickly clicks Submit — or faster
  // than expected because Tavus generates transcripts in ~1-3 seconds),
  // the webhook UPDATE matched 0 rows and was discarded. Tavus doesn't
  // retry. So whenever we create a submission, we also pull the
  // verbose conversation from Tavus's REST API — if the transcript is
  // already available, we persist it inline. If not, the webhook will
  // still land and the regular path handles it.
  let transcript = "";
  let status: "pending" | "complete" = "pending";
  try {
    const conv = (await getConversation(interviewId)) as unknown as {
      events?: TavusEvent[];
    };
    const transcriptEvent = conv.events?.find(
      (e) => e.event_type === "application.transcription_ready"
    );
    const messages = transcriptEvent?.properties?.transcript ?? [];
    if (messages.length > 0) {
      transcript = formatTranscript(messages);
      status = "complete";
      console.log(
        `[submissions] Eager transcript fetch: ${messages.length} turns for ${interviewId}`
      );
    }
  } catch (err) {
    // Non-fatal — fall back to the webhook path. Worst case, the
    // student's submission shows as "pending" briefly until Tavus
    // webhooks us (or the teacher dashboard triggers a backfill).
    console.warn("[submissions] Eager transcript fetch failed:", err);
  }

  const submission = {
    id: uuid(),
    assignmentId: id,
    sunnetId,
    conversationId: interviewId,
    transcript,
    summary: "",
    score: "pending" as const,
    duration: duration || "0:00",
    status,
    createdAt: new Date().toISOString(),
  };

  await saveSubmission(submission);

  return NextResponse.json(submission);
}
