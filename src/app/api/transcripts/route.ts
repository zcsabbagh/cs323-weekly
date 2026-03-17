import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const TRANSCRIPTS_DIR = path.join(DATA_DIR, "transcripts");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

// POST - Save transcript from the Python agent
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { roomName, transcript } = body;

  if (!roomName || !transcript) {
    return NextResponse.json(
      { error: "roomName and transcript required" },
      { status: 400 }
    );
  }

  await ensureDir(TRANSCRIPTS_DIR);
  await fs.writeFile(
    path.join(TRANSCRIPTS_DIR, `${roomName}.txt`),
    transcript,
    "utf-8"
  );

  return NextResponse.json({ ok: true });
}

// GET - Retrieve transcript by room name
export async function GET(req: NextRequest) {
  const roomName = req.nextUrl.searchParams.get("roomName");
  if (!roomName) {
    return NextResponse.json(
      { error: "roomName query param required" },
      { status: 400 }
    );
  }

  await ensureDir(TRANSCRIPTS_DIR);
  try {
    const transcript = await fs.readFile(
      path.join(TRANSCRIPTS_DIR, `${roomName}.txt`),
      "utf-8"
    );
    return NextResponse.json({ transcript });
  } catch {
    return NextResponse.json(
      { error: "Transcript not found" },
      { status: 404 }
    );
  }
}
