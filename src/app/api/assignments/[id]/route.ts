import { NextRequest, NextResponse } from "next/server";
import { getAssignment, deleteAssignment, saveAssignment } from "@/lib/db";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  Object.assign(assignment, body);
  await saveAssignment(assignment);
  return NextResponse.json(assignment);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteAssignment(id);
  return NextResponse.json({ success: true });
}
