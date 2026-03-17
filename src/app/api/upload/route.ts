import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse";

const anthropic = new Anthropic();
const MAX_TEXT_CHARS = 80000;

export const maxDuration = 120;

// Always extract text server-side, then summarize with Claude
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Extract text from PDF
  const parsed = await pdfParse(buffer);
  let text = parsed.text;
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS) + "\n\n[...truncated]";
  }

  // Summarize with Claude
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Reading: "${file.name}"

${text}

Summarize this reading for a university course. Include:
1. Main thesis and key arguments
2. Important data points, statistics, or examples
3. Conclusions and recommendations
4. Controversial or debate-worthy claims
Be thorough with specific details only a reader would know. Keep under 1000 words.`,
      },
    ],
  });

  const block = res.content[0];
  const summary =
    block.type === "text"
      ? `## ${file.name}\n\n${block.text}`
      : `## ${file.name}\n\nFailed to process.`;

  return NextResponse.json({ summary, fileName: file.name });
}
