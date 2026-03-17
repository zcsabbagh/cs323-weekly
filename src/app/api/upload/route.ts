import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse";

const anthropic = new Anthropic();
const MAX_NATIVE_PDF = 4 * 1024 * 1024; // 4MB for native PDF (safe under Vercel 4.5MB limit)
const MAX_TEXT_CHARS = 80000;

export const maxDuration = 120;

// Upload a single PDF, summarize it with Claude, return the summary
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  if (buffer.length <= MAX_NATIVE_PDF) {
    contentBlocks.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: buffer.toString("base64"),
      },
    });
  } else {
    const parsed = await pdfParse(buffer);
    const text =
      parsed.text.length > MAX_TEXT_CHARS
        ? parsed.text.slice(0, MAX_TEXT_CHARS) + "\n\n[...truncated]"
        : parsed.text;
    contentBlocks.push({ type: "text", text });
  }

  contentBlocks.push({
    type: "text",
    text: `Summarize this reading ("${file.name}") for a university course. Include:
1. Main thesis and key arguments
2. Important data points, statistics, or examples
3. Conclusions and recommendations
4. Controversial or debate-worthy claims
Be thorough with specific details only a reader would know. Keep under 1000 words.`,
  });

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const block = res.content[0];
  const summary =
    block.type === "text"
      ? `## ${file.name}\n\n${block.text}`
      : `## ${file.name}\n\nFailed to process.`;

  return NextResponse.json({ summary, fileName: file.name });
}
