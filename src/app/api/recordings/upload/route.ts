import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { uploadToDrive } from "@/lib/google-drive";
import { getAssignments } from "@/lib/db";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("recording") as File | null;
    const assignmentId = formData.get("assignmentId") as string | null;
    const submissionId = (formData.get("submissionId") as string | null) ?? "";
    const sunnetId = (formData.get("sunnetId") as string | null) ?? "";

    if (!file || !assignmentId) {
      return NextResponse.json(
        { error: "Missing required fields: recording and assignmentId" },
        { status: 400 }
      );
    }

    const assignments = await getAssignments();
    const assignment = assignments.find((a) => a.id === assignmentId);

    if (!assignment || !assignment.driveFolderId) {
      return NextResponse.json(
        { error: "Assignment not found or missing driveFolderId" },
        { status: 404 }
      );
    }

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const ext = file.type.includes("webm") ? "webm" : "mp4";
    const fileName = `${sunnetId}_${date}_${submissionId}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const body = Readable.from(buffer);

    const driveLink = await uploadToDrive({
      fileName,
      mimeType: file.type,
      body,
      folderId: assignment.driveFolderId,
    });

    return NextResponse.json({ ok: true, driveLink });
  } catch (err) {
    console.error("[recordings/upload] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
