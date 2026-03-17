import { NextRequest, NextResponse } from "next/server";
import { getSubmission, saveSubmission } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const { id, submissionId } = await params;
  const submission = await getSubmission(id, submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  if (body.score && (body.score === "pass" || body.score === "fail")) {
    submission.score = body.score;
  }

  await saveSubmission(submission);
  return NextResponse.json(submission);
}
