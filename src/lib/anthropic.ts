import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function summarizeTranscript(
  transcript: string,
  context: string
): Promise<{ summary: string; score: "pass" | "fail" }> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a teaching assistant for CS 323. Below is the context from the assigned readings, followed by a transcript of a student's voice interview about those readings.

Provide exactly:

1. Three bullet points of the most interesting things the student said. Each bullet should be one sentence. Focus on specific opinions, insights, or connections they made.

2. A pass/fail score. Pass = they clearly read it and can reference specifics. Fail = vague, generic, or couldn't engage with details.

READING CONTEXT:
${context}

INTERVIEW TRANSCRIPT:
${transcript}

Respond in this exact JSON format (no markdown fences):
{"summary": "• First point\n• Second point\n• Third point", "score": "pass"}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type === "text") {
    try {
      const parsed = JSON.parse(block.text);
      return { summary: parsed.summary, score: parsed.score };
    } catch {
      return { summary: block.text, score: "fail" };
    }
  }
  return { summary: "Summary generation failed.", score: "fail" };
}
