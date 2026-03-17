import { NextRequest, NextResponse } from "next/server";
import { getAssignments, saveAssignment } from "@/lib/db";
import { createAgent } from "@/lib/elevenlabs";
import { v4 as uuid } from "uuid";
import { PDFParse } from "pdf-parse";

export async function GET() {
  const assignments = await getAssignments();
  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const files = formData.getAll("files") as File[];

  if (!title || files.length === 0) {
    return NextResponse.json({ error: "Title and at least one PDF required" }, { status: 400 });
  }

  // Extract text from PDFs
  let context = "";
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    context += `\n--- ${file.name} ---\n${result.text}\n`;
  }

  // Create ElevenLabs agent with reading context
  const systemPrompt = `You are an interviewer for a university course (CS 323). Your job is to conduct a 5-minute voice interview with a student about the following assigned readings. Your goals:

1. Ask the student what they thought about the readings and their key takeaways
2. Probe their opinions — do they agree or disagree with the authors' arguments?
3. Ask follow-up questions to ensure they've actually read the material
4. Be conversational and encouraging, but also intellectually rigorous
5. If the student seems to not have read the material, gently probe with specific questions about content
6. Keep the conversation flowing naturally — don't make it feel like an interrogation
7. After about 4-5 minutes, wrap up by asking if they have any final thoughts

ASSIGNED READINGS CONTEXT:
${context}

Remember: You're having a natural conversation, not giving a quiz. Be warm but thorough.`;

  const agentId = await createAgent({
    name: `CS323 - ${title}`,
    systemPrompt,
  });

  const assignment = {
    id: uuid(),
    title,
    description: description || "",
    context,
    agentId,
    createdAt: new Date().toISOString(),
  };

  await saveAssignment(assignment);
  return NextResponse.json(assignment);
}
