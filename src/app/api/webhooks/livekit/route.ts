import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { Storage } from "@google-cloud/storage";
import { uploadToDrive } from "@/lib/google-drive";
import { getAssignments } from "@/lib/db";
import path from "path";

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
);

const GCS_BUCKET = process.env.GCS_BUCKET || "cs323-recordings";

function getStorage() {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "google-credentials.json");
  return new Storage({ keyFilename: credPath });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const authHeader = req.headers.get("authorization") || "";

    // Validate webhook signature
    const event = await receiver.receive(body, authHeader);

    if (event.event !== "egress_ended") {
      return NextResponse.json({ ok: true });
    }

    const egressInfo = event.egressInfo;
    if (!egressInfo) {
      return NextResponse.json({ ok: true });
    }

    // Get file results
    const fileResults = egressInfo.fileResults || [];
    if (fileResults.length === 0) {
      console.log("No file results in egress_ended event");
      return NextResponse.json({ ok: true });
    }

    const fileResult = fileResults[0];
    const gcsFilename = fileResult.filename || "";
    const roomName = egressInfo.roomName || "";

    console.log(
      `Egress ended: room=${roomName}, file=${gcsFilename}`
    );

    // Extract assignment ID from room name (format: interview-{assignmentId}-{shortUuid})
    const match = roomName.match(/^interview-(.+)-[a-f0-9]{8}$/);
    if (!match) {
      console.log(`Room name ${roomName} doesn't match interview pattern`);
      return NextResponse.json({ ok: true });
    }

    const assignmentId = match[1];

    // Find the assignment to get its Drive folder ID
    const assignments = await getAssignments();
    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment || !assignment.driveFolderId) {
      console.log(
        `No Drive folder for assignment ${assignmentId}`
      );
      return NextResponse.json({ ok: true });
    }

    // Download from GCS
    const storage = getStorage();
    const bucket = storage.bucket(GCS_BUCKET);
    // The GCS filename from egress is the full path in the bucket
    const gcsPath = gcsFilename.replace(`gs://${GCS_BUCKET}/`, "");
    const file = bucket.file(gcsPath);

    const readStream = file.createReadStream();

    // Build a nice filename: roomName_timestamp.mp4
    const timestamp = new Date().toISOString().slice(0, 10);
    const uploadName = `${roomName}_${timestamp}.mp4`;

    // Upload to Google Drive
    const driveLink = await uploadToDrive({
      fileName: uploadName,
      mimeType: "video/mp4",
      body: readStream,
      folderId: assignment.driveFolderId,
    });

    console.log(`Uploaded to Drive: ${driveLink}`);

    // Optionally delete the GCS file
    await file.delete().catch(() => {});

    return NextResponse.json({ ok: true, driveLink });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
