import json
import os

import httpx
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, RoomOutputOptions
from livekit.plugins import anthropic, elevenlabs, silero, tavus

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

API_URL = os.getenv("NEXT_PUBLIC_URL", "http://localhost:3000")
TAVUS_REPLICA_ID = os.getenv("TAVUS_REPLICA_ID", "")
TAVUS_PERSONA_ID = os.getenv("TAVUS_PERSONA_ID", "")


class InterviewAgent(Agent):
    def __init__(self, system_prompt: str, first_message: str) -> None:
        super().__init__(instructions=system_prompt)
        self.first_message = first_message


server = AgentServer()


async def on_session_end(ctx: agents.JobContext) -> None:
    """Save the transcript to our Next.js API when the session ends."""
    report = ctx.make_session_report()
    report_dict = report.to_dict()

    # Extract transcript from conversation history
    transcript_lines = []
    history = report_dict.get("conversation", [])
    for item in history:
        role = item.get("role", "")
        content = item.get("content", "")
        if not content:
            continue
        if role == "assistant":
            transcript_lines.append(f"Interviewer: {content}")
        elif role == "user":
            transcript_lines.append(f"Student: {content}")

    transcript = "\n\n".join(transcript_lines)
    room_name = ctx.room.name

    # POST transcript to our API
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{API_URL}/api/transcripts",
                json={"roomName": room_name, "transcript": transcript},
                timeout=10,
            )
    except Exception as e:
        print(f"Failed to save transcript for room {room_name}: {e}")


@server.rtc_session(agent_name="cs323-interviewer", on_session_end=on_session_end)
async def interview_agent(ctx: agents.JobContext):
    # Extract assignment info from dispatch metadata
    metadata = {}
    if ctx.job and ctx.job.metadata:
        try:
            metadata = json.loads(ctx.job.metadata)
        except json.JSONDecodeError:
            pass

    assignment_id = metadata.get("assignmentId", "")
    system_prompt = metadata.get("systemPrompt", "You are a helpful interviewer.")
    first_message = metadata.get(
        "firstMessage", "Let's get started. What surprised you about the readings?"
    )

    # If system prompt wasn't in metadata (too large), fetch from API
    if not system_prompt or system_prompt == "You are a helpful interviewer.":
        if assignment_id:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"{API_URL}/api/assignments/{assignment_id}",
                        timeout=10,
                    )
                    if resp.status_code == 200:
                        assignment = resp.json()
                        context = assignment.get("context", "")
                        description = assignment.get("description", "")
                        system_prompt = build_system_prompt(context, description)
            except Exception as e:
                print(f"Failed to fetch assignment {assignment_id}: {e}")

    session = AgentSession(
        stt="deepgram/nova-3",
        llm=anthropic.LLM(model="claude-sonnet-4-20250514", temperature=0.7),
        tts=elevenlabs.TTS(
            voice_id=os.getenv("ELEVEN_VOICE_ID", ""),
            model="eleven_turbo_v2",
        ),
        vad=silero.VAD.load(),
    )

    # Start Tavus avatar if configured
    if TAVUS_REPLICA_ID and TAVUS_PERSONA_ID:
        avatar = tavus.AvatarSession(
            replica_id=TAVUS_REPLICA_ID,
            persona_id=TAVUS_PERSONA_ID,
        )
        await avatar.start(session, room=ctx.room)

    agent = InterviewAgent(
        system_prompt=system_prompt,
        first_message=first_message,
    )

    await session.start(
        room=ctx.room,
        agent=agent,
        room_output_options=RoomOutputOptions(
            audio_enabled=True,
        ),
    )

    # Send the first greeting
    await session.generate_reply(instructions=f"Say exactly: {first_message}")


def build_system_prompt(context: str, description: str) -> str:
    return f"""You interview students about assigned readings for CS 323. This is a 5-minute interview.

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
{context}

{"FOCUS ON THESE TOPICS:\n" + description if description else ""}"""


if __name__ == "__main__":
    agents.cli.run_app(server)
