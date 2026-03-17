"""
End-to-end test: joins a room, triggers agent dispatch, waits for avatar,
checks audio, verifies transcript is saved. No browser needed.
"""
import asyncio
import os
import json
import httpx
from dotenv import load_dotenv
from livekit import rtc, api

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
# Token comes from Railway (production dispatch), transcript saved to local agent API
RAILWAY_URL = "https://cs323-weekly-production.up.railway.app"
API_URL = os.getenv("NEXT_PUBLIC_URL", "http://localhost:3005")
ASSIGNMENT_ID = "0962ec28-f80a-4900-b2ed-6230bbd0ccfd"


async def main():
    print("=" * 60)
    print("CS323 Interview E2E Test")
    print("=" * 60)

    # Step 1: Get token from the API (same as browser would)
    print("\n[1/6] Getting token from API...")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{RAILWAY_URL}/api/assignments/{ASSIGNMENT_ID}/token",
            json={},
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"  FAIL: token endpoint returned {resp.status_code}: {resp.text}")
            return
        token_data = resp.json()

    room_name = token_data["roomName"]
    token = token_data["token"]
    url = token_data["url"]
    print(f"  OK: room={room_name}, url={url}")
    print(f"  Token size: {len(token)} bytes")

    # Step 2: Connect to room
    print("\n[2/6] Connecting to LiveKit room...")
    room = rtc.Room()

    agent_joined = asyncio.Event()
    avatar_joined = asyncio.Event()
    audio_received = asyncio.Event()
    audio_bytes = 0
    participants_seen = []

    @room.on("participant_connected")
    def on_participant(p: rtc.RemoteParticipant):
        participants_seen.append(p.identity)
        print(f"  Participant joined: {p.identity}")
        if p.identity.startswith("agent-"):
            agent_joined.set()
        if "tavus" in p.identity:
            avatar_joined.set()

    @room.on("track_subscribed")
    def on_track(track: rtc.Track, pub: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        nonlocal audio_bytes
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            print(f"  Audio track from {participant.identity}")
            stream = rtc.AudioStream(track)

            async def read():
                nonlocal audio_bytes
                async for ev in stream:
                    audio_bytes += len(ev.frame.data)
                    if not audio_received.is_set():
                        print(f"  First audio frame: rate={ev.frame.sample_rate}, channels={ev.frame.num_channels}")
                        audio_received.set()

            asyncio.create_task(read())
        elif track.kind == rtc.TrackKind.KIND_VIDEO:
            print(f"  Video track from {participant.identity}")

    await room.connect(url, token)
    print(f"  OK: connected as {room.local_participant.identity}")

    # Step 3: Wait for agent
    print("\n[3/6] Waiting for agent to join (max 20s)...")
    try:
        await asyncio.wait_for(agent_joined.wait(), timeout=20)
        print("  OK: Agent joined!")
    except asyncio.TimeoutError:
        print("  FAIL: Agent did not join after 20s")
        print(f"  Participants seen: {participants_seen}")
        await room.disconnect()
        return

    # Step 4: Wait for avatar + audio
    print("\n[4/6] Waiting for avatar and audio (max 20s)...")
    try:
        await asyncio.wait_for(
            asyncio.gather(avatar_joined.wait(), audio_received.wait()),
            timeout=20,
        )
        print(f"  OK: Avatar joined, audio streaming ({audio_bytes} bytes so far)")
    except asyncio.TimeoutError:
        print(f"  PARTIAL: avatar={'yes' if avatar_joined.is_set() else 'no'}, audio={'yes' if audio_received.is_set() else 'no'}")

    # Step 5: Let it run for a bit to accumulate transcript
    print("\n[5/6] Letting interview run for 10s to build transcript...")
    await asyncio.sleep(10)
    print(f"  Audio bytes received: {audio_bytes}")
    print(f"  All participants: {participants_seen}")

    # Disconnect (triggers on_session_end in agent)
    print("\n[6/6] Disconnecting and checking transcript...")
    await room.disconnect()
    print("  Disconnected. Waiting 15s for agent to save transcript...")
    await asyncio.sleep(15)

    # Check if transcript was saved — try Railway first, then local
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{RAILWAY_URL}/api/transcripts?roomName={room_name}",
            timeout=10,
        )
        if resp.status_code != 200:
            resp = await client.get(
                f"{API_URL}/api/transcripts?roomName={room_name}",
                timeout=10,
            )
        if resp.status_code == 200:
            data = resp.json()
            transcript = data.get("transcript", "")
            print(f"  OK: Transcript saved! ({len(transcript)} chars)")
            print(f"  Preview: {transcript[:200]}...")
        else:
            print(f"  FAIL: No transcript found (status {resp.status_code})")

    # Summary
    print("\n" + "=" * 60)
    print("RESULTS:")
    print(f"  Agent dispatch:  {'PASS' if agent_joined.is_set() else 'FAIL'}")
    print(f"  Avatar joined:   {'PASS' if avatar_joined.is_set() else 'FAIL'}")
    print(f"  Audio received:  {'PASS' if audio_received.is_set() else 'FAIL'} ({audio_bytes} bytes)")
    print(f"  Transcript saved: {'PASS' if resp.status_code == 200 else 'FAIL'}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
