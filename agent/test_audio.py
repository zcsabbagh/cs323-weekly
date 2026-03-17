"""Test script to join a LiveKit room and verify audio is being received."""
import asyncio
import os
from dotenv import load_dotenv
from livekit import rtc, api

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")


async def main():
    room_name = "audio-test-2"

    # Create token with agent dispatch
    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity("audio-tester")
        .with_grants(api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
        ))
        .with_room_config(
            api.RoomConfiguration(
                agents=[
                    api.RoomAgentDispatch(
                        agent_name="cs323-interviewer",
                        metadata='{"assignmentId":"test","systemPrompt":"Say hello. Keep it to one sentence.","firstMessage":"Hello, testing audio!"}'
                    )
                ]
            )
        )
    )

    jwt = token.to_jwt()
    room = rtc.Room()

    audio_received = asyncio.Event()
    audio_byte_count = 0

    @room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        print(f"[SUBSCRIBED] kind={track.kind}, participant={participant.identity}, sid={track.sid}")

        if track.kind == rtc.TrackKind.KIND_AUDIO:
            print(f"[AUDIO] Got audio track from {participant.identity}!")
            audio_stream = rtc.AudioStream(track)

            async def read_audio():
                nonlocal audio_byte_count
                async for frame_event in audio_stream:
                    frame = frame_event.frame
                    audio_byte_count += len(frame.data)
                    if not audio_received.is_set():
                        print(f"[AUDIO] First frame! samples={frame.samples_per_channel}, rate={frame.sample_rate}, channels={frame.num_channels}")
                        audio_received.set()

            asyncio.create_task(read_audio())

    @room.on("track_published")
    def on_track_published(publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        print(f"[PUBLISHED] kind={publication.kind}, source={publication.source}, participant={participant.identity}, subscribed={publication.subscribed}")

    @room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant):
        print(f"[JOINED] {participant.identity}")
        # List their existing tracks
        for sid, pub in participant.track_publications.items():
            print(f"  existing track: kind={pub.kind}, source={pub.source}")

    print(f"Connecting to {LIVEKIT_URL} room={room_name}...")
    await room.connect(LIVEKIT_URL, jwt)
    print(f"Connected as {room.local_participant.identity}")

    # List what's already in the room
    for identity, p in room.remote_participants.items():
        print(f"Already here: {identity}")
        for sid, pub in p.track_publications.items():
            print(f"  track: kind={pub.kind}, source={pub.source}, subscribed={pub.subscribed}, muted={pub.muted}")

    print("\nWaiting up to 45s for audio...")
    try:
        await asyncio.wait_for(audio_received.wait(), timeout=45)
        await asyncio.sleep(3)
        print(f"\nSUCCESS - Audio bytes received: {audio_byte_count}")
    except asyncio.TimeoutError:
        print(f"\nFAILED - No audio after 45s")
        print("\nFinal room state:")
        for identity, p in room.remote_participants.items():
            print(f"  Participant: {identity}")
            for sid, pub in p.track_publications.items():
                print(f"    track sid={sid}, kind={pub.kind}, source={pub.source}, subscribed={pub.subscribed}, muted={pub.muted}")

    await room.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
