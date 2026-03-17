import { NextRequest, NextResponse } from "next/server";
import { getAssignments, saveAssignment } from "@/lib/db";
import { createAgent } from "@/lib/elevenlabs";
import { v4 as uuid } from "uuid";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export const maxDuration = 300;

export async function GET() {
  const assignments = await getAssignments();
  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, context: rawContext } = body;

  if (!title || !rawContext) {
    return NextResponse.json(
      { error: "Title and context required" },
      { status: 400 }
    );
  }

  // Single Claude call to summarize all readings into interview context
  const summaryRes = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are preparing context for a university course interview (CS 323: The AI Awakening).

Below are the extracted texts from assigned readings. Summarize ALL of them into a detailed briefing that an AI interviewer can use. For each reading, include:
1. Main thesis and key arguments
2. Important data points, statistics, or examples
3. Conclusions and recommendations
4. Controversial or debate-worthy claims

Be thorough — include specific details only someone who read the material would know.

${rawContext}`,
      },
    ],
  });

  const context =
    summaryRes.content[0].type === "text"
      ? summaryRes.content[0].text
      : rawContext;

  const systemPrompt = `You interview students about assigned readings for CS 323. This is a 5-minute interview.

RULES:
- Keep every response UNDER 10 words, then ask ONE question.
- No introductions, no pleasantries, no filler.
- Be direct and conversational. Sound like a chill but sharp TA.
- Ask general, opinion-based questions — NOT trivia or specific details.
- Examples: "What was the main argument?", "Did you agree with the authors?", "What was the most surprising claim?", "How does this connect to what we discussed last week?", "What would you push back on?"
- Ask about 12 questions total across the 5 minutes. Move briskly between topics.
- If they're vague, ask a follow-up to get them to elaborate — not a gotcha.
- After ~4 minutes, wrap up: "Alright, any last thoughts?"

READING CONTEXT:
${context}

${description ? `FOCUS ON THESE TOPICS:\n${description}` : ""}`;

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
