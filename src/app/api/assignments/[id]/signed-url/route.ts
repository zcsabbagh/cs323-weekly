import { NextRequest, NextResponse } from "next/server";
import { getAssignment } from "@/lib/db";
import { getSignedUrl } from "@/lib/elevenlabs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signedUrl = await getSignedUrl(assignment.agentId);
  return NextResponse.json({ signedUrl });
}
