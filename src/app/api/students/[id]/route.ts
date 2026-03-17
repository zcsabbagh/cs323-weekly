import { NextRequest, NextResponse } from "next/server";
import { deleteStudent } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteStudent(id);
  return NextResponse.json({ success: true });
}
