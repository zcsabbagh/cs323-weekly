import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse";

const anthropic = new Anthropic();
const MAX_NATIVE_PDF = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 80000;

export const maxDuration = 120;

const SUMMARIZE_PROMPT = `Summarize this reading for a university course. Include:
1. Main thesis and key arguments
2. Important data points, statistics, or examples
3. Conclusions and recommendations
4. Controversial or debate-worthy claims
Be thorough with specific details only a reader would know. Keep under 1000 words.`;

// POST with file (small PDFs) or JSON with pre-extracted text (large PDFs)
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  let fileName: string;
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  if (contentType.includes("application/json")) {
    // Large file — client already extracted text
    const body = await req.json();
    fileName = body.fileName;
    const text = body.text.length > MAX_TEXT_CHARS
      ? body.text.slice(0, MAX_TEXT_CHARS) + "\n\n[...truncated]"
      : body.text;
    contentBlocks.push({ type: "text", text });
  } else {
    // Small file — process as PDF
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }
    fileName = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());

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
      const text = parsed.text.length > MAX_TEXT_CHARS
        ? parsed.text.slice(0, MAX_TEXT_CHARS) + "\n\n[...truncated]"
        : parsed.text;
      contentBlocks.push({ type: "text", text });
    }
  }

  contentBlocks.push({
    type: "text",
    text: `Reading: "${fileName}". ${SUMMARIZE_PROMPT}`,
  });

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const block = res.content[0];
  const summary =
    block.type === "text"
      ? `## ${fileName}\n\n${block.text}`
      : `## ${fileName}\n\nFailed to process.`;

  return NextResponse.json({ summary, fileName });
}
