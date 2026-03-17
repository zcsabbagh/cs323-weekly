import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";

const MAX_TEXT_CHARS = 80000;

// Just extract text — no Claude call. Fast.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await pdfParse(buffer);
  let text = parsed.text;
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS) + "\n\n[...truncated]";
  }

  return NextResponse.json({ text, fileName: file.name });
}
