import json
import os

import httpx
from dotenv import load_dotenv
from livekit import agents, api
from livekit.agents import AgentServer, AgentSession, Agent, RoomOutputOptions
from livekit.plugins import anthropic, elevenlabs, silero, tavus

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

API_URL = os.getenv("NEXT_PUBLIC_URL", "http://localhost:3000")
TAVUS_REPLICA_ID = os.getenv("TAVUS_REPLICA_ID", "")
TAVUS_PERSONA_ID = os.getenv("TAVUS_PERSONA_ID", "")
GCS_BUCKET = os.getenv("GCS_BUCKET", "cs323-recordings")


class InterviewAgent(Agent):
    def __init__(self, system_prompt: str, first_message: str) -> None:
        super().__init__(instructions=system_prompt)
        self.first_message = first_message


server = AgentServer()


async def save_transcript(room_name: str, transcript_lines: list[str]) -> bool:
    """POST transcript to our Next.js API. Returns True on success."""
    transcript = "\n\n".join(transcript_lines) if transcript_lines else ""
    if not transcript:
        return False
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{API_URL}/api/transcripts",
                json={"roomName": room_name, "transcript": transcript},
                timeout=10,
            )
            print(f"Saved transcript for {room_name}: status={resp.status_code}, lines={len(transcript_lines)}")
            return resp.status_code == 200
    except Exception as e:
        print(f"Failed to save transcript for {room_name}: {e}")
        return False


@server.rtc_session(agent_name="cs323-interviewer")
async def interview_agent(ctx: agents.JobContext):
    # Extract assignment info from dispatch metadata
    metadata = {}
    if ctx.job and ctx.job.metadata:
        try:
            metadata = json.loads(ctx.job.metadata)
        except json.JSONDecodeError:
            pass

    assignment_id = metadata.get("assignmentId", "")
    system_prompt = metadata.get("systemPrompt", "")
    first_message = metadata.get(
        "firstMessage", "Let's get started. What surprised you about the readings?"
    )

    # Fetch system prompt from API if not in metadata
    if not system_prompt:
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
                        print(f"Fetched assignment {assignment_id}: context={len(context)} chars")
                    else:
                        print(f"Failed to fetch assignment {assignment_id}: {resp.status_code}")
            except Exception as e:
                print(f"Failed to fetch assignment {assignment_id}: {e}")

    if not system_prompt:
        system_prompt = "You are a helpful interviewer. Ask about what the student has been reading."

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

    # Collect transcript in real-time
    transcript_lines: list[str] = []
    room_name = ctx.room.name

    @session.on("conversation_item_added")
    def on_item(item):
        try:
            role = getattr(item, "role", "")
            content = ""
            if hasattr(item, "text_content"):
                content = item.text_content or ""
            elif hasattr(item, "content"):
                content = str(item.content) if item.content else ""
            if content:
                label = "Interviewer" if role == "assistant" else "Student"
                transcript_lines.append(f"{label}: {content}")
        except Exception:
            pass

    # Save transcript when session closes
    @session.on("close")
    def on_close():
        import asyncio

        async def _save():
            # Try session history first
            try:
                history = session.history
                lines = []
                for item in history:
                    role = getattr(item, "role", "")
                    content = ""
                    if hasattr(item, "text_content"):
                        content = item.text_content or ""
                    elif hasattr(item, "content"):
                        parts = getattr(item, "content", [])
                        if isinstance(parts, str):
                            content = parts
                        elif isinstance(parts, list):
                            for p in parts:
                                if hasattr(p, "text"):
                                    content += p.text
                    if content:
                        label = "Interviewer" if role == "assistant" else "Student"
                        lines.append(f"{label}: {content}")
                if lines:
                    await save_transcript(room_name, lines)
                    return
            except Exception as e:
                print(f"Failed to get session history: {e}")

            # Fallback to real-time collected transcript
            if transcript_lines:
                await save_transcript(room_name, transcript_lines)
            else:
                print(f"No transcript to save for {room_name}")

        asyncio.create_task(_save())

    await session.start(
        room=ctx.room,
        agent=agent,
        room_output_options=RoomOutputOptions(
            audio_enabled=True,
        ),
    )

    # Start recording the room to GCS
    if GCS_BUCKET:
        try:
            cred_path = os.getenv(
                "GOOGLE_APPLICATION_CREDENTIALS",
                os.path.join(os.path.dirname(__file__), "..", "google-credentials.json"),
            )
            gcp_creds = ""
            try:
                with open(cred_path) as f:
                    gcp_creds = f.read()
            except FileNotFoundError:
                print(f"GCP credentials not found at {cred_path}")

            from livekit.protocol.egress import (
                RoomCompositeEgressRequest,
                EncodedFileOutput,
                EncodedFileType,
                GCPUpload,
            )

            lk = api.LiveKitAPI()
            await lk.egress.start_room_composite_egress(
                RoomCompositeEgressRequest(
                    room_name=ctx.room.name,
                    file_outputs=[
                        EncodedFileOutput(
                            file_type=EncodedFileType.MP4,
                            filepath=f"{ctx.room.name}.mp4",
                            gcp=GCPUpload(
                                bucket=GCS_BUCKET,
                                credentials=gcp_creds,
                            ),
                        ),
                    ],
                ),
            )
            print(f"Started egress recording for {ctx.room.name}")
            await lk.aclose()
        except Exception as e:
            print(f"Failed to start egress: {e}")

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
