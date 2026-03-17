import { NextRequest, NextResponse } from "next/server";
import { getStudents, saveStudent } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function GET() {
  const students = await getStudents();
  return NextResponse.json(students);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { firstName, lastName, sunnetId } = body;

  if (!firstName || !lastName || !sunnetId) {
    return NextResponse.json(
      { error: "firstName, lastName, and sunnetId required" },
      { status: 400 }
    );
  }

  const existing = await getStudents();
  if (existing.some((s) => s.sunnetId === sunnetId)) {
    return NextResponse.json(
      { error: "A student with this sunnetId already exists" },
      { status: 400 }
    );
  }

  const student = {
    id: uuid(),
    firstName,
    lastName,
    sunnetId,
    createdAt: new Date().toISOString(),
  };

  await saveStudent(student);
  return NextResponse.json(student);
}
