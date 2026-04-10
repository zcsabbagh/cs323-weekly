import { NextRequest, NextResponse } from "next/server";
import { uploadToDrive } from "@/lib/google-drive";
import { getAssignment } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { Readable } from "stream";

export const maxDuration = 300;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storagePath, assignmentId, submissionId, sunnetId, mimeType } = body;

    if (!storagePath || !assignmentId) {
      return NextResponse.json(
        { error: "storagePath and assignmentId required" },
        { status: 400 }
      );
    }

    const assignment = await getAssignment(assignmentId);
    if (!assignment?.driveFolderId) {
      return NextResponse.json(
        { error: "Assignment has no Drive folder" },
        { status: 404 }
      );
    }

    // Download from Supabase Storage using the public URL (bucket is public)
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/cs323-recordings/${storagePath}`;
    console.log("[Transfer] Downloading from:", publicUrl);
    const res = await fetch(publicUrl);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to fetch from Supabase: ${res.status}`);
    }

    // Convert web ReadableStream to Node Readable
    const buffer = Buffer.from(await res.arrayBuffer());
    const stream = Readable.from(buffer);
    console.log("[Transfer] Downloaded", buffer.length, "bytes");

    // Build filename
    const date = new Date().toISOString().slice(0, 10);
    const student = sunnetId || "unknown";
    const subId = submissionId || "nosub";
    const ext = (mimeType || "").includes("mp4") ? "mp4" : "webm";
    const fileName = `${student}_${date}_${subId}.${ext}`;

    const driveLink = await uploadToDrive({
      fileName,
      mimeType: mimeType || "video/webm",
      body: stream,
      folderId: assignment.driveFolderId,
    });

    console.log("[Transfer] Uploaded to Drive:", driveLink);

    // Clean up from Supabase Storage
    await supabase.storage.from("cs323-recordings").remove([storagePath]);

    return NextResponse.json({ ok: true, driveLink });
  } catch (err) {
    console.error("[Transfer] Error:", err);
    return NextResponse.json({ error: "Transfer failed" }, { status: 500 });
  }
}
