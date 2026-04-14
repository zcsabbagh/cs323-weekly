"use client";

import { copyToClipboard } from "@/lib/copy";
import { api } from "@/lib/api";
import { useState, useCallback, useEffect, use, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Assignment } from "@/lib/db";
import DailyIframe from "@daily-co/daily-js";
import type { DailyCall, DailyParticipant } from "@daily-co/daily-js";
import { createClient } from "@supabase/supabase-js";
import fixWebmDuration from "fix-webm-duration";

const supabaseStorage = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const INTERVIEW_DURATION = 300; // 5 minutes in seconds

type Step = "loading" | "ready" | "connecting" | "interview" | "done" | "submitted";

function usePermissions() {
  const [mic, setMic] = useState<"prompt" | "granted" | "denied">("prompt");
  const [cam, setCam] = useState<"prompt" | "granted" | "denied">("prompt");

  useEffect(() => {
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [sunnetId, setSunnetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [driveLink, setDriveLink] = useState<string | null>(null);
  const [remoteJoined, setRemoteJoined] = useState(false);

  // Permissions
  const { mic, cam, requestMic, requestCam } = usePermissions();
  const permissionsGranted = mic === "granted" && cam === "granted";

  // Daily.js refs
  const callObjectRef = useRef<DailyCall | null>(null);
  const replicaVideoRef = useRef<HTMLVideoElement>(null);
  const selfVideoRef = useRef<HTMLVideoElement>(null);

  // Recording refs
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingBlobRef = useRef<Blob | null>(null);
  const recordingStartedRef = useRef(false);
  const recordingStartMsRef = useRef(0);
  const durationRef = useRef(0);
  // Composite pipeline cleanup — canvas draw loop, AudioContext, hidden
  // <video> elements for the two source streams. Stored as a single
  // teardown closure so endInterview/restart don't need to know the details.
  const recordingCleanupRef = useRef<(() => void) | null>(null);

  // Audio playback ref for remote participant
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

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

  // Try to start recording — needs ALL FOUR tracks (remote video+audio,
  // local video+audio) before starting. Composites the two videos
  // side-by-side via a hidden canvas and mixes the two audio streams
  // through an AudioContext, so the final recording shows both faces
  // with synchronized audio.
  const tryStartRecording = useCallback(() => {
    if (recordingStartedRef.current) return;

    const callObject = callObjectRef.current;
    if (!callObject) return;

    const participants = callObject.participants();

    const remote = Object.entries(participants).find(
      ([id]) => id !== "local"
    )?.[1] as DailyParticipant | undefined;

    if (!remote) {
      console.log("[Recording] tryStart: no remote participant yet");
      return;
    }

    const remoteVideo = remote.tracks?.video?.persistentTrack;
    const remoteAudio = remote.tracks?.audio?.persistentTrack;
    const localVideo = participants.local?.tracks?.video?.persistentTrack;
    const localAudio = participants.local?.tracks?.audio?.persistentTrack;

    if (!remoteVideo || !remoteAudio || !localVideo || !localAudio) {
      console.log("[Recording] tryStart: waiting for tracks", {
        remoteVideo: !!remoteVideo,
        remoteAudio: !!remoteAudio,
        localVideo: !!localVideo,
        localAudio: !!localAudio,
      });
      return;
    }

    // Canvas: two 640x480 (4:3) tiles side by side to match the UI grid.
    const TILE_W = 640;
    const TILE_H = 480;
    const CANVAS_W = TILE_W * 2;
    const CANVAS_H = TILE_H;

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("[Recording] Failed to get 2d context");
      return;
    }

    // Hidden <video> elements drive the canvas draw — detached from the
    // DOM but muted so they don't produce audio (remoteAudioRef handles
    // playback; mixing happens separately below).
    const makeHiddenVideo = (track: MediaStreamTrack) => {
      const el = document.createElement("video");
      el.srcObject = new MediaStream([track]);
      el.muted = true;
      el.playsInline = true;
      el.autoplay = true;
      el.play().catch(() => {});
      return el;
    };
    const leftVideo = makeHiddenVideo(remoteVideo);
    const rightVideo = makeHiddenVideo(localVideo);

    // Aspect-preserving "cover" fit — crops to fill the tile without stretching.
    const drawCover = (
      v: HTMLVideoElement,
      dx: number,
      dy: number,
      dw: number,
      dh: number
    ) => {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      if (!vw || !vh) return;
      const scale = Math.max(dw / vw, dh / vh);
      const sw = dw / scale;
      const sh = dh / scale;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      ctx.drawImage(v, sx, sy, sw, sh, dx, dy, dw, dh);
    };

    let rafId = 0;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawCover(leftVideo, 0, 0, TILE_W, TILE_H);
      drawCover(rightVideo, TILE_W, 0, TILE_W, TILE_H);
      rafId = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);
    const compositeVideoTrack = canvasStream.getVideoTracks()[0];

    // Mix the two audio tracks into one via the Web Audio graph.
    // Both sources feed the same destination node, which exposes a
    // single mixed track on its .stream.
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioCtx = new AudioCtx();
    const dest = audioCtx.createMediaStreamDestination();
    const remoteSrc = audioCtx.createMediaStreamSource(
      new MediaStream([remoteAudio])
    );
    const localSrc = audioCtx.createMediaStreamSource(
      new MediaStream([localAudio])
    );
    remoteSrc.connect(dest);
    localSrc.connect(dest);
    const mixedAudioTrack = dest.stream.getAudioTracks()[0];

    const stream = new MediaStream([compositeVideoTrack, mixedAudioTrack]);
    chunksRef.current = [];

    // Prefer MP4 — Google Drive's WebM transcoder is unreliable and
    // often leaves uploads stuck on "still being processed." Chrome 126+
    // and Safari produce playable fragmented MP4 from MediaRecorder;
    // Firefox falls back to WebM (and the fix-webm-duration patch).
    const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a")
      ? "video/mp4;codecs=avc1,mp4a"
      : MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";

    recordingStartedRef.current = true;
    recordingStartMsRef.current = Date.now();

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };
    recorder.start(1000);
    recorderRef.current = recorder;

    recordingCleanupRef.current = () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      try {
        remoteSrc.disconnect();
        localSrc.disconnect();
      } catch {}
      audioCtx.close().catch(() => {});
      compositeVideoTrack.stop();
      mixedAudioTrack.stop();
      leftVideo.srcObject = null;
      rightVideo.srcObject = null;
    };

    console.log(
      "[Recording] Started composite (2x video + mixed audio), mimeType:",
      mimeType
    );
  }, []);

  // Attach video tracks when participants update
  const attachTracks = useCallback(() => {
    const callObject = callObjectRef.current;
    if (!callObject) return;

    const participants = callObject.participants();

    // Local participant video
    const local = participants.local;
    if (local?.tracks?.video?.persistentTrack && selfVideoRef.current) {
      const stream = new MediaStream([local.tracks.video.persistentTrack]);
      if (selfVideoRef.current.srcObject !== stream) {
        selfVideoRef.current.srcObject = stream;
      }
    }

    // Remote participant video (first non-local)
    const remoteParticipant = Object.values(participants).find(
      (p: DailyParticipant) => !p.local
    ) as DailyParticipant | undefined;

    if (remoteParticipant?.tracks?.video?.persistentTrack && replicaVideoRef.current) {
      const stream = new MediaStream([remoteParticipant.tracks.video.persistentTrack]);
      if (replicaVideoRef.current.srcObject !== stream) {
        replicaVideoRef.current.srcObject = stream;
      }
    }

    // Attach remote audio for playback
    if (remoteParticipant?.tracks?.audio?.persistentTrack) {
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
      }
      const audioStream = new MediaStream([remoteParticipant.tracks.audio.persistentTrack]);
      if (remoteAudioRef.current.srcObject !== audioStream) {
        remoteAudioRef.current.srcObject = audioStream;
        remoteAudioRef.current.play().catch(() => {});
      }
    }

    // Try to start recording once tracks are available
    tryStartRecording();
  }, [tryStartRecording]);

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
      const res = await api(`/api/assignments/${assignmentId}/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { conversationId: cid, conversationUrl, conversationName } = await res.json();
      setConversationId(cid);

      const callObject = DailyIframe.createCallObject({
        videoSource: true,
        audioSource: true,
      });
      callObjectRef.current = callObject;

      callObject.on("joined-meeting", () => {
        setStep("interview");
        attachTracks();
      });

      callObject.on("participant-joined", (event) => {
        if (!event) return;
        attachTracks();

        // When remote participant joins, start timer (recording starts via attachTracks)
        if (!event.participant.local) {
          setRemoteJoined(true);
          startTimer();
        }
      });

      callObject.on("participant-updated", () => {
        attachTracks();
      });

      callObject.on("left-meeting", () => {
        if (timerInterval) clearInterval(timerInterval);
      });

      await callObject.join({ url: conversationUrl });

      void conversationName; // used for tracking if needed
    } catch (err) {
      console.error("Failed to start interview:", err);
      setStep("ready");
    }
  }, [assignmentId, attachTracks, startTimer, timerInterval]);

  const endInterview = useCallback(async () => {
    if (timerInterval) clearInterval(timerInterval);

    // Stop recorder and capture blob
    const recorder = recorderRef.current;
    console.log("[Recording] endInterview: recorder state =", recorder?.state, "chunks =", chunksRef.current.length);

    const buildBlob = async (type: string): Promise<Blob> => {
      const raw = new Blob(chunksRef.current, { type });
      const durationMs = recordingStartMsRef.current
        ? Date.now() - recordingStartMsRef.current
        : 0;
      // Patch missing duration metadata so Google Drive (and other players)
      // can preview/seek the webm file properly
      if (durationMs > 0 && type.includes("webm")) {
        try {
          const fixed = await fixWebmDuration(raw, durationMs);
          console.log("[Recording] Fixed webm duration:", durationMs, "ms");
          return fixed as Blob;
        } catch (err) {
          console.error("[Recording] fixWebmDuration failed:", err);
        }
      }
      return raw;
    };

    if (recorder) {
      if (recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(async () => {
            console.log("[Recording] onstop timeout, forcing blob creation");
            recordingBlobRef.current = await buildBlob(recorder.mimeType);
            resolve();
          }, 5000);
          recorder.onstop = async () => {
            clearTimeout(timeout);
            recordingBlobRef.current = await buildBlob(recorder.mimeType);
            console.log("[Recording] Blob created, size =", recordingBlobRef.current?.size);
            resolve();
          };
          recorder.stop();
        });
      } else {
        recordingBlobRef.current = await buildBlob(recorder.mimeType);
        console.log("[Recording] Recorder inactive, blob size =", recordingBlobRef.current?.size);
      }
    } else {
      console.log("[Recording] No recorder to stop");
    }

    durationRef.current = INTERVIEW_DURATION - elapsed;

    // Tear down the composite pipeline AFTER the recorder has stopped
    // so the final chunk flushes first.
    if (recordingCleanupRef.current) {
      recordingCleanupRef.current();
      recordingCleanupRef.current = null;
    }

    const callObject = callObjectRef.current;
    if (callObject) {
      await callObject.leave();
      callObject.destroy();
      callObjectRef.current = null;
    }

    setStep("done");
  }, [timerInterval, elapsed]);

  const restart = useCallback(async () => {
    if (timerInterval) clearInterval(timerInterval);

    // Stop recorder if still running
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      recorderRef.current = null;
    }
    if (recordingCleanupRef.current) {
      recordingCleanupRef.current();
      recordingCleanupRef.current = null;
    }
    chunksRef.current = [];
    recordingBlobRef.current = null;
    recordingStartedRef.current = false;
    recordingStartMsRef.current = 0;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    const callObject = callObjectRef.current;
    if (callObject) {
      await callObject.leave();
      callObject.destroy();
      callObjectRef.current = null;
    }

    setStep("ready");
    setConversationId(null);
    setElapsed(0);
    setRemoteJoined(false);
    setDriveLink(null);
  }, [timerInterval]);

  const submitInterview = useCallback(async () => {
    if (!conversationId || !sunnetId.trim()) return;
    setSubmitting(true);

    try {
      const res = await api(`/api/assignments/${assignmentId}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sunnetId,
          roomName: conversationId,
          conversationId,
          duration: formatTime(durationRef.current || INTERVIEW_DURATION - elapsed),
        }),
      });
      const data = await res.json();
      const sid = data.id;
      setSubmissionId(sid);
      setSubmitting(false);
      setStep("submitted");

      // Upload recording blob in background — upload to Supabase Storage directly
      // (bypasses Vercel's 4.5MB body limit), then notify server to transfer to Drive
      const blob = recordingBlobRef.current;
      console.log("[Recording] submit: blob =", blob ? `${blob.size} bytes, ${blob.type}` : "null");
      if (blob && blob.size > 0) {
        setUploadingRecording(true);
        try {
          const ext = blob.type.includes("mp4") ? "mp4" : "webm";
          const path = `${assignmentId}/${sid}.${ext}`;
          console.log("[Recording] uploading to Supabase Storage:", path);
          const { error: uploadError } = await supabaseStorage.storage
            .from("cs323-recordings")
            .upload(path, blob, {
              contentType: blob.type,
              upsert: true,
            });
          if (uploadError) throw uploadError;
          console.log("[Recording] Supabase upload complete");

          // Now tell the server to transfer to Google Drive
          const transferRes = await api(`/api/recordings/transfer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              storagePath: path,
              assignmentId,
              submissionId: sid,
              sunnetId,
              mimeType: blob.type,
            }),
          });
          const transferData = await transferRes.json().catch(() => ({}));
          if (transferData?.driveLink) {
            setDriveLink(transferData.driveLink);
          }
          console.log("[Recording] Transfer complete:", transferData?.driveLink);
        } catch (err) {
          console.error("Failed to upload recording:", err);
        } finally {
          setUploadingRecording(false);
        }
      }
    } catch (err) {
      console.error("Failed to submit:", err);
      setSubmitting(false);
    }
  }, [assignmentId, sunnetId, conversationId, elapsed]);

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
          {step === "connecting" && (
            <div className="space-y-4 text-center py-8">
              <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground">Connecting...</p>
            </div>
          )}

          {/* Interview */}
          {step === "interview" && (
            <div className="space-y-6">
              {/* Timer */}
              <div className="text-center">
                <p className="text-6xl font-mono font-light tabular-nums tracking-wider">
                  {remoteJoined ? formatTime(elapsed) : "--:--"}
                </p>
                {!remoteJoined && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Waiting for avatar to join...
                  </p>
                )}
              </div>

              {/* Video grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Avatar video */}
                <div className="aspect-[4/3] rounded-xl overflow-hidden bg-muted/20 flex items-center justify-center relative">
                  {!remoteJoined && (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <div className="w-10 h-10 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                      <p className="text-xs">Loading avatar...</p>
                    </div>
                  )}
                  <video
                    ref={replicaVideoRef}
                    autoPlay
                    playsInline
                    className={`w-full h-full object-cover ${remoteJoined ? "block" : "hidden"}`}
                  />
                  <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider bg-black/60 text-white/70 px-2 py-0.5 rounded">
                    TA
                  </span>
                </div>

                {/* Self video */}
                <div className="aspect-[4/3] rounded-xl overflow-hidden bg-muted/20 flex items-center justify-center relative">
                  <video
                    ref={selfVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider bg-black/60 text-white/70 px-2 py-0.5 rounded">
                    You
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-3">
                <Button
                  onClick={restart}
                  variant="outline"
                  className="flex-1 h-14 text-base rounded-xl hover:scale-[1.01] active:scale-[0.96]"
                  style={{
                    transitionProperty: "transform, background-color, border-color",
                  }}
                >
                  Re-record
                </Button>
                <Button
                  onClick={endInterview}
                  variant="destructive"
                  className="flex-1 h-14 text-base rounded-xl hover:scale-[1.01] active:scale-[0.96]"
                  style={{ transitionProperty: "transform, background-color" }}
                >
                  End Early
                </Button>
              </div>
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="space-y-8">
              <div className="text-center space-y-1">
                <p className="text-2xl font-medium">Interview Complete</p>
                <p className="text-base text-muted-foreground">
                  Duration: {formatTime(durationRef.current || INTERVIEW_DURATION - elapsed)}
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
              {uploadingRecording && !driveLink && (
                <p className="text-sm text-muted-foreground">Uploading recording...</p>
              )}
              {driveLink && (
                <div className="pt-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    Paste this into Canvas as proof of submission
                  </p>
                  <div className="inline-flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 max-w-full">
                    <p className="text-sm font-mono text-foreground select-all truncate">
                      {driveLink}
                    </p>
                    <button
                      onClick={() => copyToClipboard(driveLink)}
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
                          d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.927-2.185a48.208 48.208 0 0 1 1.927-.184"
                        />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The link won&apos;t open for you — course staff use it to verify your recording.
                  </p>
                </div>
              )}
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
