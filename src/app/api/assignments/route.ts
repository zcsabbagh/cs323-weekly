import { NextRequest, NextResponse } from "next/server";
import { getAssignments, saveAssignment } from "@/lib/db";
import { createDriveFolder } from "@/lib/google-drive";
import { v4 as uuid } from "uuid";

export const maxDuration = 60;

export async function GET() {
  const assignments = await getAssignments();
  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, context } = body;

  if (!title || !context) {
    return NextResponse.json(
      { error: "Title and context required" },
      { status: 400 }
    );
  }

  // Create a Google Drive folder for this assignment's recordings
  let driveFolderId: string | undefined;
  try {
    driveFolderId = await createDriveFolder(`CS323 - ${title}`);
  } catch (err) {
    console.error("Failed to create Drive folder:", err);
  }

  const assignment = {
    id: uuid(),
    title,
    description: description || "",
    context,
    agentId: "livekit",
    driveFolderId,
    createdAt: new Date().toISOString(),
  };

  await saveAssignment(assignment);
  return NextResponse.json(assignment);
}
