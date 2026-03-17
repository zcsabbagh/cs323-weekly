import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function summarizeTranscript(
  transcript: string,
  context: string
): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a teaching assistant for CS 323. Below is the context from the assigned readings, followed by a transcript of a student's voice interview about those readings.

Please provide a concise summary (3-5 paragraphs) of:
1. The student's key opinions and takeaways from the readings
2. How well they engaged with the material
3. Any notable insights or areas where understanding could be deeper

READING CONTEXT:
${context}

INTERVIEW TRANSCRIPT:
${transcript}

Write the summary in a professional but warm tone, as if reporting to the course instructor.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type === "text") return block.text;
  return "Summary generation failed.";
}
