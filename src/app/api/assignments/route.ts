import { NextRequest, NextResponse } from "next/server";
import { getAssignments, saveAssignment } from "@/lib/db";
import { createAgent } from "@/lib/elevenlabs";
import { v4 as uuid } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse";

const anthropic = new Anthropic();
const MAX_NATIVE_PDF = 4.5 * 1024 * 1024; // 4.5MB for native PDF
const MAX_TEXT_CHARS = 80000; // truncate extracted text to stay within token limits

export const maxDuration = 300; // 5 min timeout for serverless

export async function GET() {
  const assignments = await getAssignments();
  return NextResponse.json(assignments);
}

async function summarizeOnePdf(
  file: File,
  buffer: Buffer
): Promise<string> {
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
    // Extract text for large PDFs
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
  return block.type === "text"
    ? `## ${file.name}\n\n${block.text}`
    : `## ${file.name}\n\nFailed to process.`;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const files = formData.getAll("files") as File[];

  if (!title || files.length === 0) {
    return NextResponse.json(
      { error: "Title and at least one PDF required" },
      { status: 400 }
    );
  }

  // Process all PDFs in parallel — each gets its own Claude call
  const buffers = await Promise.all(
    files.map(async (f) => ({
      file: f,
      buffer: Buffer.from(await f.arrayBuffer()),
    }))
  );

  const summaries = await Promise.all(
    buffers.map(({ file, buffer }) => summarizeOnePdf(file, buffer))
  );

  const context = summaries.join("\n\n---\n\n");

  // Create ElevenLabs agent
  const systemPrompt = `You interview students about assigned readings for CS 323. This is a 5-minute interview.

RULES:
- Keep every response UNDER 10 words, then ask ONE question.
- No introductions, no pleasantries, no filler.
- Be direct and conversational. Sound like a chill but sharp TA.
- Ask general, opinion-based questions — NOT trivia or specific details.
- Examples: "What was the main argument?", "Did you agree with the authors?", "What was the most surprising claim?", "How does this connect to what we discussed last week?", "What would you push back on?"
- Ask about 12 questions total across the 5 minutes. Move briskly between topics.
- If they're vague, ask a follow-up to get them to elaborate — not a gotcha.
- After ~4 minutes, wrap up: "Alright, any last thoughts?"

READING CONTEXT:
${context}

${description ? `FOCUS ON THESE TOPICS:\n${description}` : ""}`;

  const agentId = await createAgent({
    name: `CS323 - ${title}`,
    systemPrompt,
  });

  const assignment = {
    id: uuid(),
    title,
    description: description || "",
    context,
    agentId,
    createdAt: new Date().toISOString(),
  };

  await saveAssignment(assignment);
  return NextResponse.json(assignment);
}
