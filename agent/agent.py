import json
import logging
import os

import httpx
from dotenv import load_dotenv
from livekit import agents, api
from livekit.agents import AgentServer, AgentSession, Agent, RoomOutputOptions
from livekit.plugins import anthropic, elevenlabs, silero, tavus

logger = logging.getLogger("cs323-agent")
logger.setLevel(logging.INFO)
_fh = logging.FileHandler("/tmp/cs323-agent-debug.log")
_fh.setLevel(logging.INFO)
logger.addHandler(_fh)
# Also log to stdout so LiveKit Cloud captures it
_sh = logging.StreamHandler()
_sh.setLevel(logging.INFO)
logger.addHandler(_sh)

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

API_URL = os.getenv("AGENT_API_URL") or os.getenv("NEXT_PUBLIC_URL", "http://localhost:3000")
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
            logger.info(f"Saved transcript for {room_name}: status={resp.status_code}, lines={len(transcript_lines)}")
            return resp.status_code == 200
    except Exception as e:
        logger.info(f"Failed to save transcript for {room_name}: {e}")
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
                        logger.info(f"Fetched assignment {assignment_id}: context={len(context)} chars")
                    else:
                        logger.info(f"Failed to fetch assignment {assignment_id}: {resp.status_code}")
            except Exception as e:
                logger.info(f"Failed to fetch assignment {assignment_id}: {e}")

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

    # Start Tavus avatar if configured (with timeout to avoid blocking)
    if TAVUS_REPLICA_ID and TAVUS_PERSONA_ID:
        try:
            import asyncio as _asyncio
            avatar = tavus.AvatarSession(
                replica_id=TAVUS_REPLICA_ID,
                persona_id=TAVUS_PERSONA_ID,
            )
            await _asyncio.wait_for(avatar.start(session, room=ctx.room), timeout=15)
            logger.info("Tavus avatar started")
        except Exception as e:
            err_msg = f"TAVUS_FAILED replica={TAVUS_REPLICA_ID} persona={TAVUS_PERSONA_ID} error={type(e).__name__}: {e}"
            logger.info(err_msg)
            print(err_msg, flush=True)
            # Post error to Railway so we can see it in Railway logs
            try:
                import asyncio as _asyncio2
                async def _post_err():
                    async with httpx.AsyncClient() as c:
                        await c.post(f"{API_URL}/api/agent-debug", json={"msg": err_msg}, timeout=5)
                _asyncio2.create_task(_post_err())
            except Exception:
                pass

    agent = InterviewAgent(
        system_prompt=system_prompt,
        first_message=first_message,
    )

    # Collect transcript in real-time
    transcript_lines: list[str] = []
    room_name = ctx.room.name

    @session.on("conversation_item_added")
    def on_item(event):
        try:
            msg = event.item
            role = getattr(msg, "role", "")
            content = getattr(msg, "text_content", None) or ""
            if content:
                label = "Interviewer" if role == "assistant" else "Student"
                transcript_lines.append(f"{label}: {content}")
        except Exception:
            pass

    # Wait for participant to leave, then save transcript
    import asyncio
    participant_left = asyncio.Event()

    @ctx.room.on("participant_disconnected")
    def on_participant_left(participant):
        if participant.identity != ctx.room.local_participant.identity:
            logger.info(f"Participant left: {participant.identity}")
            participant_left.set()

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
            # Load GCS credentials: prefer env var (for LiveKit Cloud), fallback to file
            gcp_creds = ""
            base64_creds = os.getenv("GOOGLE_CREDENTIALS_BASE64", "")
            if base64_creds:
                import base64 as _b64
                gcp_creds = _b64.b64decode(base64_creds).decode("utf-8")
                logger.info("Loaded GCP credentials from GOOGLE_CREDENTIALS_BASE64 env var")
            else:
                cred_path = os.path.abspath(
                    os.path.join(os.path.dirname(__file__), "..", "google-credentials.json")
                )
                try:
                    with open(cred_path) as f:
                        gcp_creds = f.read()
                    logger.info(f"Loaded GCP credentials from {cred_path}")
                except FileNotFoundError:
                    logger.info(f"GCP credentials not found at {cred_path}")

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
                    layout="grid-dark",
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
            logger.info(f"Started egress recording for {ctx.room.name}")
            await lk.aclose()
        except Exception as e:
            logger.info(f"Failed to start egress: {e}")

    # Send the first greeting
    await session.generate_reply(instructions=f"Say exactly: {first_message}")

    # Block until participant leaves, then save transcript
    await participant_left.wait()
    # Small delay to let final conversation items settle
    await asyncio.sleep(2)

    if transcript_lines:
        await save_transcript(room_name, transcript_lines)
    else:
        # Try session.history as fallback
        try:
            lines = []
            for msg in session.history.messages():
                role = getattr(msg, "role", "")
                content = getattr(msg, "text_content", None) or ""
                if content:
                    label = "Interviewer" if role == "assistant" else "Student"
                    lines.append(f"{label}: {content}")
            if lines:
                await save_transcript(room_name, lines)
        except Exception as e:
            logger.info(f"Failed to save transcript from history: {e}")


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
