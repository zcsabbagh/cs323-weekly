import { google } from "googleapis";
import path from "path";

const PARENT_FOLDER_ID = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID!;

function getAuth() {
  const base64Creds = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (base64Creds) {
    const credentials = JSON.parse(
      Buffer.from(base64Creds, "base64").toString("utf-8")
    );
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
  }

  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "google-credentials.json");

  return new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

/** Create a subfolder inside the Shared Drive */
export async function createDriveFolder(name: string): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [PARENT_FOLDER_ID],
    },
    supportsAllDrives: true,
    fields: "id",
  });

  return res.data.id!;
}

/** Upload a file to a specific Drive folder */
export async function uploadToDrive(opts: {
  fileName: string;
  mimeType: string;
  body: NodeJS.ReadableStream;
  folderId: string;
}): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.create({
    requestBody: {
      name: opts.fileName,
      parents: [opts.folderId],
    },
    media: {
      mimeType: opts.mimeType,
      body: opts.body,
    },
    supportsAllDrives: true,
    fields: "id, webViewLink",
  });

  return res.data.webViewLink || res.data.id!;
}
