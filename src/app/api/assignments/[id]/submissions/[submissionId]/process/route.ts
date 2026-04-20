import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getAssignment,
  getSubmission,
  saveSubmission,
  type Submission,
} from "@/lib/db";

const anthropic = new Anthropic();

export const maxDuration = 120;

interface ProcessedResult {
  summary: string;
  score: "pass" | "fail";
}

// Ask Claude to review the transcript against the reading context, return
// a short TA-facing summary and a pass/fail signal. Prompt caching keyed
// to the reading context so repeat calls within the same assignment are
// cheap.
async function analyzeTranscript(
  assignmentTitle: string,
  readingContext: string,
  transcript: string
): Promise<ProcessedResult> {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: `You are a teaching assistant for Stanford CS 323 grading a 5-minute spoken interview with a student about the week's assigned readings.

Assignment: ${assignmentTitle}

Reading context (what the student should have read):
${readingContext}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Here is the transcript of the student's interview:

---
${transcript}
---

Respond with EXACTLY this format, nothing else:

SCORE: pass OR fail
SUMMARY: <2-4 sentence TA-facing summary. Note strengths + gaps. Be direct, concrete. No fluff.>

Score "pass" if the student shows genuine engagement with the assigned material and can discuss at least a couple of specific ideas or arguments from it. Score "fail" if their responses are vague, off-topic, or indicate they clearly didn't read / didn't think about it.`,
      },
    ],
  });

  const block = res.content[0];
  const raw = block.type === "text" ? block.text : "";

  // Parse "SCORE: ..." and "SUMMARY: ..." out of the response.
  const scoreMatch = raw.match(/SCORE:\s*(pass|fail)/i);
  const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]+?)\s*$/i);

  const score: "pass" | "fail" =
    scoreMatch?.[1].toLowerCase() === "fail" ? "fail" : "pass";
  const summary = summaryMatch?.[1]?.trim() || raw.trim() || "No summary.";

  return { score, summary };
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

  // Nothing to analyze until the transcript is saved.
  if (!submission.transcript?.trim()) {
    return NextResponse.json(submission);
  }

  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Assignment missing" }, { status: 404 });
  }

  try {
    const { summary, score } = await analyzeTranscript(
      assignment.title,
      assignment.context || "",
      submission.transcript
    );

    const updated: Submission = {
      ...submission,
      summary,
      score,
      status: "complete",
    };
    await saveSubmission(updated);

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[process] analyze failed:", err);
    return NextResponse.json(
      { error: "analysis failed", detail: String(err) },
      { status: 500 }
    );
  }
}
