import { NextRequest, NextResponse } from "next/server";
import { getSubmission } from "@/lib/db";

// Manual re-process endpoint — transcripts come in via Tavus webhook now,
// so this just returns the current submission state.
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

  return NextResponse.json(submission);
}
