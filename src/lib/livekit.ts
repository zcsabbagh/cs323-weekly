import { AccessToken } from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";

const LIVEKIT_URL = process.env.LIVEKIT_URL!;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;

export function getLiveKitUrl(): string {
  return LIVEKIT_URL;
}

export async function createParticipantToken(opts: {
  roomName: string;
  participantName: string;
  agentName?: string;
  metadata?: string;
}): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: opts.participantName,
  });

  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  // Dispatch the agent when this participant joins
  if (opts.agentName) {
    at.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: opts.agentName,
          metadata: opts.metadata || "",
        }),
      ],
    });
  }

  return await at.toJwt();
}
