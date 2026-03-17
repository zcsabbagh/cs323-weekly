import { NextRequest, NextResponse } from "next/server";
import { getAssignment } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(assignment);
}
