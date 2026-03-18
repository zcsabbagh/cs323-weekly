"use client";

import { copyToClipboard } from "@/lib/copy";
import { api } from "@/lib/api";
import { useState, useCallback, useEffect, use, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Assignment } from "@/lib/db";
import {
  LiveKitRoom,
  VideoTrack,
  RoomAudioRenderer,
  useTracks,
  useRoomContext,
  useConnectionState,
} from "@livekit/components-react";
import "@livekit/components-styles";
import {
  Track,
  ConnectionState,
  Room,
  RoomEvent,
  TranscriptionSegment,
  Participant,
} from "livekit-client";

const INTERVIEW_DURATION = 300; // 5 minutes in seconds

type Step = "loading" | "ready" | "connecting" | "interview" | "done" | "submitted";

interface TranscriptEntry {
  role: "agent" | "student";
  text: string;
  timestamp: number;
}

function usePermissions() {
  const [mic, setMic] = useState<"prompt" | "granted" | "denied">("prompt");
  const [cam, setCam] = useState<"prompt" | "granted" | "denied">("prompt");

  useEffect(() => {
    // Check existing permissions
    navigator.permissions?.query({ name: "microphone" as PermissionName }).then((p) => {
      setMic(p.state as "prompt" | "granted" | "denied");
      p.onchange = () => setMic(p.state as "prompt" | "granted" | "denied");
    });
    navigator.permissions?.query({ name: "camera" as PermissionName }).then((p) => {
      setCam(p.state as "prompt" | "granted" | "denied");
      p.onchange = () => setCam(p.state as "prompt" | "granted" | "denied");
    });
  }, []);

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMic("granted");
    } catch {
      setMic("denied");
    }
  }, []);

  const requestCam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setCam("granted");
    } catch {
      setCam("denied");
    }
  }, []);

  return { mic, cam, requestMic, requestCam };
}

export default function StudentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = use(params);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>("loading");
  const [roomName, setRoomName] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [sunnetId, setSunnetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Permissions
  const { mic, cam, requestMic, requestCam } = usePermissions();
  const permissionsGranted = mic === "granted" && cam === "granted";

  // LiveKit connection state
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);

  // Timer is started by InterviewRoom once avatar is ready
  const startTimer = useCallback(() => {
    setElapsed(INTERVIEW_DURATION);
    const interval = setInterval(() => {
      setElapsed((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setTimerInterval(interval);
  }, []);

  useEffect(() => {
    api(`/api/assignments/${assignmentId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setAssignment(data);
        setStep("ready");
      })
      .catch(() => setNotFound(true));
  }, [assignmentId]);

  const startInterview = useCallback(async () => {
    try {
      setStep("connecting");
      const res = await api(`/api/assignments/${assignmentId}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { token, roomName: rn, url } = await res.json();
      setLivekitToken(token);
      setLivekitUrl(url);
      setRoomName(rn);
    } catch (err) {
      console.error("Failed to start interview:", err);
      setStep("ready");
    }
  }, [assignmentId]);

  const onRoomConnected = useCallback(() => {
    // Don't start timer here — wait for avatar video
    setStep("interview");
  }, []);

  const endInterview = useCallback(async () => {
    if (timerInterval) clearInterval(timerInterval);
    if (roomRef.current) {
      roomRef.current.disconnect();
    }
    setStep("done");
  }, [timerInterval]);

  const submitInterview = useCallback(async () => {
    if (!roomName || !sunnetId.trim()) return;
    setSubmitting(true);
    const res = await api(`/api/assignments/${assignmentId}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sunnetId,
        roomName,
        duration: formatTime(INTERVIEW_DURATION - elapsed),
      }),
    });
    const data = await res.json();
    setSubmissionId(data.id);
    setSubmitting(false);
    setStep("submitted");
  }, [assignmentId, sunnetId, roomName, elapsed]);

  const restart = useCallback(() => {
    if (timerInterval) clearInterval(timerInterval);
    setStep("ready");
    setRoomName(null);
    setLivekitToken(null);
    setLivekitUrl(null);
    setElapsed(0);
  }, [timerInterval]);

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-base text-muted-foreground">Assignment not found.</p>
      </div>
    );
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-base text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl">
        <div
          className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-8 md:p-10 space-y-8"
          style={{
            boxShadow:
              "0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.03)",
          }}
        >
          {/* Assignment header */}
          {step !== "submitted" && assignment && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                CS 323
              </p>
              <h1
                className="font-display italic text-5xl md:text-6xl leading-[1.1]"
                style={{ textWrap: "balance" }}
              >
                {assignment.title}
              </h1>
              {assignment.description && (
                <p className="text-base text-muted-foreground leading-relaxed pt-2">
                  {assignment.description}
                </p>
              )}
            </div>
          )}

          {/* Ready */}
          {step === "ready" && (
            <div className="space-y-8">
              <div className="border-l-2 border-muted-foreground/20 pl-5">
                <p
                  className="text-lg leading-relaxed text-muted-foreground"
                  style={{ textWrap: "pretty" }}
                >
                  When you&apos;re ready to respond to the reading, click
                  &ldquo;Begin.&rdquo; You can re-record as many times as you&apos;d
                  like — the call will last 5 minutes.
                </p>
              </div>

              {/* Permission checks */}
              <div className="flex gap-3">
                <button
                  onClick={requestMic}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                    mic === "granted"
                      ? "border-green-500/40 bg-green-500/10 text-green-400"
                      : mic === "denied"
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                  </svg>
                  {mic === "granted" ? "Mic ready" : mic === "denied" ? "Mic blocked" : "Allow mic"}
                </button>
                <button
                  onClick={requestCam}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                    cam === "granted"
                      ? "border-green-500/40 bg-green-500/10 text-green-400"
                      : cam === "denied"
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  {cam === "granted" ? "Camera ready" : cam === "denied" ? "Camera blocked" : "Allow camera"}
                </button>
              </div>

              <Button
                onClick={startInterview}
                disabled={!permissionsGranted}
                className="w-full h-14 text-lg rounded-xl hover:scale-[1.01] active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{ transitionProperty: "transform, background-color" }}
              >
                {permissionsGranted ? "Begin" : "Grant permissions to begin"}
              </Button>
            </div>
          )}

          {/* Connecting */}
          {step === "connecting" && !livekitToken && (
            <div className="space-y-8 text-center">
              <p className="text-lg text-muted-foreground">Connecting...</p>
            </div>
          )}

          {/* Interview (LiveKit Room) */}
          {(step === "connecting" || step === "interview") &&
            livekitToken &&
            livekitUrl && (
              <LiveKitRoom
                token={livekitToken}
                serverUrl={livekitUrl}
                connect={true}
                video={true}
                audio={true}
                onConnected={onRoomConnected}
                onDisconnected={() => {
                  if (step === "interview") {
                    if (timerInterval) clearInterval(timerInterval);
                    setStep("done");
                  }
                }}
              >
                <RoomAudioRenderer />
                <InterviewRoom
                  elapsed={elapsed}
                  formatTime={formatTime}
                  onRestart={restart}
                  onEnd={endInterview}
                  roomRef={roomRef}
                  onAvatarReady={startTimer}
                />
              </LiveKitRoom>
            )}

          {/* Done */}
          {step === "done" && (
            <div className="space-y-8">
              <div className="text-center space-y-1">
                <p className="text-2xl font-medium">Interview Complete</p>
                <p className="text-base text-muted-foreground">
                  Duration: {formatTime(INTERVIEW_DURATION - elapsed)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sunnet" className="text-sm">
                  SUNNet ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sunnet"
                  value={sunnetId}
                  onChange={(e) => setSunnetId(e.target.value)}
                  placeholder="e.g. jdoe1"
                  required
                  className="h-12 text-base rounded-xl"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={restart}
                  variant="outline"
                  className="flex-1 h-14 text-base rounded-xl hover:scale-[1.01] active:scale-[0.96]"
                  style={{
                    transitionProperty:
                      "transform, background-color, border-color",
                  }}
                >
                  Re-record
                </Button>
                <Button
                  onClick={submitInterview}
                  disabled={!sunnetId.trim() || submitting}
                  className="flex-1 h-14 text-base rounded-xl hover:scale-[1.01] active:scale-[0.96]"
                  style={{
                    transitionProperty: "transform, background-color, opacity",
                  }}
                >
                  {submitting ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </div>
          )}

          {/* Submitted */}
          {step === "submitted" && (
            <div className="text-center space-y-3 py-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <svg
                  className="h-6 w-6 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              </div>
              <p className="text-2xl font-medium">Submitted</p>
              <p
                className="text-base text-muted-foreground"
                style={{ textWrap: "pretty" }}
              >
                Your interview has been recorded and will be processed shortly.
              </p>
              {submissionId && (
                <div className="pt-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    Submission ID
                  </p>
                  <div className="inline-flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-sm font-mono text-foreground select-all">
                      {submissionId}
                    </p>
                    <button
                      onClick={() => copyToClipboard(submissionId)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors shrink-0"
                      title="Copy"
                    >
                      <svg
                        className="h-3.5 w-3.5 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                        />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keep this for your records.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Inner component that renders inside LiveKitRoom context */
function InterviewRoom({
  elapsed,
  formatTime,
  onRestart,
  onEnd,
  roomRef,
  onAvatarReady,
}: {
  elapsed: number;
  formatTime: (secs: number) => string;
  onRestart: () => void;
  onEnd: () => void;
  roomRef: React.RefObject<Room | null>;
  onAvatarReady: () => void;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const videoTracks = useTracks(
    [Track.Source.Camera],
    { onlySubscribed: false }
  );

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [timerStarted, setTimerStarted] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Store room reference for parent to disconnect
  useEffect(() => {
    roomRef.current = room;
  }, [room, roomRef]);

  // Log connection state changes
  useEffect(() => {
    console.log(`[Interview] connectionState=${connectionState} ts=${Date.now()}`);
  }, [connectionState]);

  // Log video track changes
  useEffect(() => {
    const tracks = videoTracks.map((t) => ({
      participant: t.participant.identity,
      isLocal: t.participant.isLocal,
      hasTrack: !!t.publication?.track,
      source: t.source,
    }));
    console.log(`[Interview] videoTracks updated (${videoTracks.length}):`, tracks, `ts=${Date.now()}`);
  }, [videoTracks]);

  // Log room events — participants joining/leaving and track subscriptions
  useEffect(() => {
    if (!room) return;
    const joinedAt = Date.now();

    const onParticipantConnected = (p: Participant) => {
      console.log(`[Interview] participant connected: identity=${p.identity} elapsed=${Date.now() - joinedAt}ms`);
    };
    const onParticipantDisconnected = (p: Participant) => {
      console.log(`[Interview] participant disconnected: identity=${p.identity} elapsed=${Date.now() - joinedAt}ms`);
    };
    const onTrackSubscribed = (track: unknown, _pub: unknown, participant: Participant) => {
      const t = track as { kind: string };
      console.log(`[Interview] track subscribed: kind=${t.kind} participant=${participant.identity} elapsed=${Date.now() - joinedAt}ms`);
    };
    const onTrackUnsubscribed = (track: unknown, _pub: unknown, participant: Participant) => {
      const t = track as { kind: string };
      console.log(`[Interview] track unsubscribed: kind=${t.kind} participant=${participant.identity}`);
    };

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

    // Log existing participants immediately
    const existing = Array.from(room.remoteParticipants.values());
    console.log(`[Interview] room connected, existing remote participants (${existing.length}):`,
      existing.map((p) => ({ identity: p.identity, trackCount: p.trackPublications.size }))
    );

    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    };
  }, [room]);

  // Listen for transcription events
  useEffect(() => {
    if (!room) return;

    const handleTranscription = (
      segments: TranscriptionSegment[],
      participant?: Participant,
    ) => {
      for (const seg of segments) {
        if (!seg.text.trim()) continue;
        const isAgent = !participant?.isLocal;
        setTranscript((prev) => {
          // Update existing segment if it's a partial (same id)
          const existing = prev.findIndex(
            (e) => (e as TranscriptEntry & { id?: string }).id === seg.id
          );
          const entry = {
            role: (isAgent ? "agent" : "student") as "agent" | "student",
            text: seg.text,
            timestamp: Date.now(),
            id: seg.id,
          };
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = entry;
            return updated;
          }
          return [...prev, entry];
        });
      }
    };

    room.on(RoomEvent.TranscriptionReceived, handleTranscription);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handleTranscription);
    };
  }, [room]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Find avatar video (remote participant with camera track)
  const avatarTrack = videoTracks.find(
    (t) => !t.participant.isLocal && t.publication?.track
  );

  // Find self video (local participant camera)
  const selfTrack = videoTracks.find(
    (t) => t.participant.isLocal && t.publication?.track
  );

  // Start timer when avatar video first appears
  useEffect(() => {
    if (avatarTrack?.publication?.track && !timerStarted) {
      console.log(`[Interview] avatarTrack ready — starting timer. participant=${avatarTrack.participant.identity}`);
      setTimerStarted(true);
      onAvatarReady();
    } else if (!avatarTrack?.publication?.track) {
      console.log(`[Interview] avatarTrack not ready: avatarTrack=${!!avatarTrack} track=${!!avatarTrack?.publication?.track}`);
    }
  }, [avatarTrack, timerStarted, onAvatarReady]);

  if (connectionState !== ConnectionState.Connected) {
    return (
      <div className="space-y-4 text-center py-8">
        <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground">Connecting to room...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timer */}
      <div className="text-center">
        <p className="text-6xl font-mono font-light tabular-nums tracking-wider">
          {timerStarted ? formatTime(elapsed) : "--:--"}
        </p>
        {!timerStarted && (
          <p className="text-sm text-muted-foreground mt-1">
            Waiting for avatar to join...
          </p>
        )}
      </div>

      {/* Video grid — equal sized */}
      <div className="grid grid-cols-2 gap-3">
        {/* Avatar video */}
        <div className="aspect-[4/3] rounded-xl overflow-hidden bg-muted/20 flex items-center justify-center relative">
          {avatarTrack?.publication?.track ? (
            <VideoTrack
              trackRef={avatarTrack}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-10 h-10 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
              <p className="text-xs">Loading avatar...</p>
            </div>
          )}
          <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider bg-black/60 text-white/70 px-2 py-0.5 rounded">
            TA
          </span>
        </div>

        {/* Self video */}
        <div className="aspect-[4/3] rounded-xl overflow-hidden bg-muted/20 flex items-center justify-center relative">
          {selfTrack?.publication?.track ? (
            <VideoTrack
              trackRef={selfTrack}
              style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0"
                />
              </svg>
              <p className="text-xs">You</p>
            </div>
          )}
          <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider bg-black/60 text-white/70 px-2 py-0.5 rounded">
            You
          </span>
        </div>
      </div>

      {/* Live transcript */}
      {transcript.length > 0 && (
        <div className="rounded-xl bg-muted/20 border border-border/30 p-4 max-h-40 overflow-y-auto">
          <div className="space-y-2">
            {transcript.map((entry, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span
                  className={`font-medium shrink-0 ${
                    entry.role === "agent"
                      ? "text-blue-400"
                      : "text-green-400"
                  }`}
                >
                  {entry.role === "agent" ? "TA:" : "You:"}
                </span>
                <span className="text-muted-foreground">{entry.text}</span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        <Button
          onClick={onRestart}
          variant="outline"
          className="flex-1 h-14 text-base rounded-xl hover:scale-[1.01] active:scale-[0.96]"
          style={{
            transitionProperty: "transform, background-color, border-color",
          }}
        >
          Re-record
        </Button>
        <Button
          onClick={onEnd}
          variant="destructive"
          className="flex-1 h-14 text-base rounded-xl hover:scale-[1.01] active:scale-[0.96]"
          style={{ transitionProperty: "transform, background-color" }}
        >
          End Early
        </Button>
      </div>
    </div>
  );
}
