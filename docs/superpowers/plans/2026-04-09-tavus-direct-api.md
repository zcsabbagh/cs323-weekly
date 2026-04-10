# Tavus Direct API Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LiveKit + Python agent with Tavus direct API, keeping transcripts and recordings flowing to Google Drive.

**Architecture:** Create Tavus conversations server-side via their REST API, embed them client-side using `@daily-co/daily-react`. Tavus handles all AI orchestration (LLM, TTS, STT, avatar). Transcripts come via Tavus callback webhooks. Recordings are captured client-side using the browser MediaRecorder API and uploaded to our server, which forwards them to Google Drive. This eliminates the Python agent, LiveKit infrastructure, and the need for AWS S3.

**Tech Stack:** Tavus REST API, `@daily-co/daily-react`, `@daily-co/daily-js`, browser MediaRecorder API, existing Google Drive integration.

**Environment Variables:**
- Remove: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Add: `TAVUS_API_KEY` (already provided: `45a13dc28cbb4a238c64bd284e4ea8ee`)
- Keep: `TAVUS_REPLICA_ID`, `TAVUS_PERSONA_ID`, `GOOGLE_CREDENTIALS_BASE64`, `GOOGLE_DRIVE_PARENT_FOLDER_ID`

---

## File Structure

```
src/lib/tavus.ts                          — CREATE: Tavus API client (create/end/get conversation)
src/app/api/assignments/[id]/conversation/route.ts — CREATE: Creates Tavus conversation, returns conversation_url
src/app/api/webhooks/tavus/route.ts       — CREATE: Handles Tavus callback webhooks (transcript, shutdown)
src/app/api/recordings/upload/route.ts    — CREATE: Accepts recorded video blob, uploads to Google Drive
src/app/student/[assignmentId]/page.tsx   — MODIFY: Replace LiveKit with Daily React + MediaRecorder
src/lib/livekit.ts                        — DELETE
src/app/api/assignments/[id]/token/route.ts — DELETE
src/app/api/webhooks/livekit/route.ts     — DELETE
agent/                                    — DELETE (entire directory)
package.json                              — MODIFY: Remove LiveKit deps, add Daily deps
```

---

### Task 1: Create Tavus API Client

**Files:**
- Create: `src/lib/tavus.ts`

- [ ] **Step 1: Create `src/lib/tavus.ts`**

```ts
const TAVUS_API_KEY = process.env.TAVUS_API_KEY!;
const TAVUS_BASE_URL = "https://tavusapi.com/v2";

export interface TavusConversation {
  conversation_id: string;
  conversation_name: string;
  conversation_url: string;
  status: string;
  created_at: string;
}

export async function createConversation(opts: {
  personaId: string;
  replicaId: string;
  conversationName: string;
  conversationalContext: string;
  customGreeting: string;
  callbackUrl: string;
  maxCallDuration?: number;
}): Promise<TavusConversation> {
  const res = await fetch(`${TAVUS_BASE_URL}/conversations`, {
    method: "POST",
    headers: {
      "x-api-key": TAVUS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persona_id: opts.personaId,
      replica_id: opts.replicaId,
      conversation_name: opts.conversationName,
      conversational_context: opts.conversationalContext,
      custom_greeting: opts.customGreeting,
      callback_url: opts.callbackUrl,
      properties: {
        max_call_duration: opts.maxCallDuration || 360,
        participant_left_timeout: 5,
        participant_absent_timeout: 120,
        enable_recording: false,
        enable_closed_captions: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tavus API error ${res.status}: ${err}`);
  }

  return res.json();
}

export async function endConversation(conversationId: string): Promise<void> {
  const res = await fetch(
    `${TAVUS_BASE_URL}/conversations/${conversationId}/end`,
    {
      method: "POST",
      headers: { "x-api-key": TAVUS_API_KEY },
    }
  );
  if (!res.ok && res.status !== 400) {
    throw new Error(`Failed to end conversation: ${res.status}`);
  }
}

export async function getConversation(
  conversationId: string
): Promise<TavusConversation & { transcript?: unknown }> {
  const res = await fetch(
    `${TAVUS_BASE_URL}/conversations/${conversationId}?verbose=true`,
    {
      headers: { "x-api-key": TAVUS_API_KEY },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to get conversation: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tavus.ts
git commit -m "feat: add Tavus API client library"
```

---

### Task 2: Create Conversation API Route

**Files:**
- Create: `src/app/api/assignments/[id]/conversation/route.ts`

This replaces the old `/api/assignments/[id]/token` route. Instead of creating a LiveKit room + token, it creates a Tavus conversation and returns the `conversation_url` for the client to join via Daily.

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAssignment } from "@/lib/db";
import { createConversation } from "@/lib/tavus";
import { v4 as uuid } from "uuid";

const TAVUS_REPLICA_ID = process.env.TAVUS_REPLICA_ID!;
const TAVUS_PERSONA_ID = process.env.TAVUS_PERSONA_ID!;
const APP_URL =
  process.env.NEXT_PUBLIC_URL ||
  process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "http://localhost:3000";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assignment = await getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conversationName = `interview-${id}-${uuid().slice(0, 8)}`;

  // Build the system prompt context from assignment readings
  const context = buildContext(assignment.context, assignment.description);

  const conversation = await createConversation({
    personaId: TAVUS_PERSONA_ID,
    replicaId: TAVUS_REPLICA_ID,
    conversationName,
    conversationalContext: context,
    customGreeting:
      "Let's get started. What surprised you about the readings?",
    callbackUrl: `${APP_URL}/api/webhooks/tavus`,
    maxCallDuration: 360, // 6 min (buffer over 5 min timer)
  });

  return NextResponse.json({
    conversationId: conversation.conversation_id,
    conversationUrl: conversation.conversation_url,
    conversationName,
  });
}

function buildContext(context: string, description: string): string {
  return `You interview students about assigned readings for CS 323. This is a 5-minute interview.

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
${context}

${description ? "FOCUS ON THESE TOPICS:\n" + description : ""}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/assignments/[id]/conversation/route.ts
git commit -m "feat: add conversation creation route using Tavus API"
```

---

### Task 3: Create Tavus Webhook Handler

**Files:**
- Create: `src/app/api/webhooks/tavus/route.ts`

Handles Tavus callback events. The key events:
- `application.transcription_ready` — saves transcript to filesystem
- `system.shutdown` — logs conversation end

- [ ] **Step 1: Create the webhook route**

```ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

interface TavusTranscriptMessage {
  role: string;
  content: string;
}

interface TavusWebhookPayload {
  event_type: string;
  conversation_id: string;
  properties?: {
    transcript?: TavusTranscriptMessage[];
    shutdown_reason?: string;
    replica_id?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const payload: TavusWebhookPayload = await req.json();
    const { event_type, conversation_id } = payload;

    console.log(`[Tavus Webhook] ${event_type} for ${conversation_id}`);

    if (event_type === "application.transcription_ready") {
      const messages = payload.properties?.transcript || [];
      const transcript = messages
        .map((m) => {
          const label = m.role === "replica" ? "Interviewer" : "Student";
          return `${label}: ${m.content}`;
        })
        .join("\n\n");

      if (transcript) {
        const dir = path.join(DATA_DIR, "transcripts");
        await fs.mkdir(dir, { recursive: true });
        // Use conversation_id as filename — we'll map this in submission processing
        await fs.writeFile(
          path.join(dir, `${conversation_id}.txt`),
          transcript,
          "utf-8"
        );
        console.log(
          `[Tavus Webhook] Saved transcript for ${conversation_id} (${messages.length} messages)`
        );
      }
    }

    if (event_type === "system.shutdown") {
      console.log(
        `[Tavus Webhook] Conversation ${conversation_id} shut down: ${payload.properties?.shutdown_reason}`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Tavus Webhook] Error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/tavus/route.ts
git commit -m "feat: add Tavus webhook handler for transcripts"
```

---

### Task 4: Create Recording Upload Endpoint

**Files:**
- Create: `src/app/api/recordings/upload/route.ts`

Accepts a video/audio blob from the client, uploads it to Google Drive.

- [ ] **Step 1: Create the upload route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { uploadToDrive } from "@/lib/google-drive";
import { getAssignments, getSubmissions } from "@/lib/db";
import { Readable } from "stream";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("recording") as File;
    const assignmentId = formData.get("assignmentId") as string;
    const submissionId = formData.get("submissionId") as string;
    const sunnetId = formData.get("sunnetId") as string;

    if (!file || !assignmentId) {
      return NextResponse.json(
        { error: "recording and assignmentId required" },
        { status: 400 }
      );
    }

    // Find the assignment's Drive folder
    const assignments = await getAssignments();
    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment?.driveFolderId) {
      return NextResponse.json(
        { error: "No Drive folder for assignment" },
        { status: 404 }
      );
    }

    // Build filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const student = sunnetId || "unknown";
    const subId = submissionId || "nosub";
    const ext = file.type.includes("webm") ? "webm" : "mp4";
    const fileName = `${student}_${timestamp}_${subId}.${ext}`;

    // Convert File to ReadableStream for Google Drive upload
    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = Readable.from(buffer);

    const driveLink = await uploadToDrive({
      fileName,
      mimeType: file.type || "video/webm",
      body: stream,
      folderId: assignment.driveFolderId,
    });

    console.log(`[Recording] Uploaded ${fileName} to Drive: ${driveLink}`);

    return NextResponse.json({ ok: true, driveLink });
  } catch (err) {
    console.error("[Recording] Upload error:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/recordings/upload/route.ts
git commit -m "feat: add recording upload endpoint for client-side recordings"
```

---

### Task 5: Replace Student Page Frontend

**Files:**
- Modify: `src/app/student/[assignmentId]/page.tsx`

Replace all LiveKit components with Daily React SDK. The interview flow stays the same (ready → connecting → interview → done → submitted) but the video call uses Daily to join the Tavus `conversation_url`. Client-side MediaRecorder captures audio+video for Google Drive upload.

- [ ] **Step 1: Install Daily React SDK**

```bash
cd /Users/zane/cs323-weekly && npm install @daily-co/daily-js @daily-co/daily-react
```

- [ ] **Step 2: Rewrite the student page**

Replace the entire file. Key changes:
- Remove all `livekit-client` and `@livekit/components-react` imports
- Use `DailyProvider`, `DailyVideo`, `useDaily`, `useParticipantIds`, `useDailyEvent` from `@daily-co/daily-react`
- Join the Tavus `conversation_url` via `daily.join({ url })`
- Start MediaRecorder on remote participant's audio + local audio when call joins
- Stop recording and upload blob when interview ends
- Keep the same visual layout (timer, video grid, transcript, controls)

```tsx
"use client";

import { copyToClipboard } from "@/lib/copy";
import { api } from "@/lib/api";
import { useState, useCallback, useEffect, use, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Assignment } from "@/lib/db";
import DailyIframe, { DailyCall, DailyEventObjectParticipant } from "@daily-co/daily-js";

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
  const [conversationName, setConversationName] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [sunnetId, setSunnetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [uploadingRecording, setUploadingRecording] = useState(false);

  const { mic, cam, requestMic, requestCam } = usePermissions();
  const permissionsGranted = mic === "granted" && cam === "granted";

  // Daily call object
  const callRef = useRef<DailyCall | null>(null);

  // MediaRecorder for client-side recording
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Video element refs
  const replicaVideoRef = useRef<HTMLVideoElement>(null);
  const selfVideoRef = useRef<HTMLVideoElement>(null);

  // Timer
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

  // Fetch assignment
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

  // Attach video tracks to <video> elements when participants join/update
  const attachTracks = useCallback((callObject: DailyCall) => {
    const participants = callObject.participants();

    // Self video
    const local = participants.local;
    if (local?.tracks?.video?.persistentTrack && selfVideoRef.current) {
      const stream = new MediaStream([local.tracks.video.persistentTrack]);
      selfVideoRef.current.srcObject = stream;
    }

    // Replica video (first remote participant)
    for (const [id, p] of Object.entries(participants)) {
      if (id === "local") continue;
      if (p?.tracks?.video?.persistentTrack && replicaVideoRef.current) {
        const stream = new MediaStream([p.tracks.video.persistentTrack]);
        replicaVideoRef.current.srcObject = stream;
      }
    }
  }, []);

  // Start MediaRecorder to capture all audio
  const startRecording = useCallback((callObject: DailyCall) => {
    try {
      const participants = callObject.participants();
      const audioTracks: MediaStreamTrack[] = [];

      // Collect all audio tracks (local + remote)
      for (const [, p] of Object.entries(participants)) {
        if (p?.tracks?.audio?.persistentTrack) {
          audioTracks.push(p.tracks.audio.persistentTrack);
        }
      }

      if (audioTracks.length === 0) {
        console.log("[Recording] No audio tracks yet, will retry");
        return;
      }

      const stream = new MediaStream(audioTracks);
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000); // Collect chunks every second
      recorderRef.current = recorder;
      console.log("[Recording] Started MediaRecorder with", audioTracks.length, "audio tracks");
    } catch (err) {
      console.error("[Recording] Failed to start:", err);
    }
  }, []);

  // Start interview
  const startInterview = useCallback(async () => {
    try {
      setStep("connecting");

      // Create Tavus conversation
      const res = await api(`/api/assignments/${assignmentId}/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { conversationUrl, conversationName: cn, conversationId: cid } =
        await res.json();
      setConversationName(cn);
      setConversationId(cid);

      // Create Daily call object and join
      const callObject = DailyIframe.createCallObject({
        videoSource: true,
        audioSource: true,
      });
      callRef.current = callObject;

      // Handle participant track updates
      callObject.on("participant-updated", () => attachTracks(callObject));
      callObject.on("participant-joined", () => {
        attachTracks(callObject);
        // Start recording once remote participant (replica) joins
        const remotes = Object.keys(callObject.participants()).filter(
          (id) => id !== "local"
        );
        if (remotes.length > 0 && !recorderRef.current) {
          // Small delay to let tracks settle
          setTimeout(() => startRecording(callObject), 1000);
          startTimer();
        }
      });
      callObject.on("left-meeting", () => {
        if (step === "interview") {
          if (timerInterval) clearInterval(timerInterval);
          setStep("done");
        }
      });

      await callObject.join({ url: conversationUrl });
      setStep("interview");
      attachTracks(callObject);
    } catch (err) {
      console.error("Failed to start interview:", err);
      setStep("ready");
    }
  }, [assignmentId, attachTracks, startRecording, startTimer, step, timerInterval]);

  // End interview
  const endInterview = useCallback(async () => {
    if (timerInterval) clearInterval(timerInterval);

    // Stop recorder
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }

    // Leave Daily call
    if (callRef.current) {
      await callRef.current.leave();
      callRef.current.destroy();
      callRef.current = null;
    }

    setStep("done");
  }, [timerInterval]);

  // Submit interview
  const submitInterview = useCallback(async () => {
    if (!conversationName || !sunnetId.trim()) return;
    setSubmitting(true);

    // Create submission
    const res = await api(`/api/assignments/${assignmentId}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sunnetId,
        roomName: conversationId, // Use Tavus conversation_id for transcript lookup
        conversationId: conversationId,
        duration: formatTime(INTERVIEW_DURATION - elapsed),
      }),
    });
    const data = await res.json();
    setSubmissionId(data.id);

    // Upload recording in background
    if (chunksRef.current.length > 0) {
      setUploadingRecording(true);
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("recording", blob, `${conversationName}.webm`);
      formData.append("assignmentId", assignmentId);
      formData.append("submissionId", data.id);
      formData.append("sunnetId", sunnetId);

      api("/api/recordings/upload", {
        method: "POST",
        body: formData,
      })
        .then(() => console.log("[Recording] Upload complete"))
        .catch((err) => console.error("[Recording] Upload failed:", err))
        .finally(() => setUploadingRecording(false));
    }

    setSubmitting(false);
    setStep("submitted");
  }, [assignmentId, sunnetId, conversationName, conversationId, elapsed]);

  // Restart
  const restart = useCallback(() => {
    if (timerInterval) clearInterval(timerInterval);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    if (callRef.current) {
      callRef.current.leave();
      callRef.current.destroy();
      callRef.current = null;
    }
    setStep("ready");
    setConversationName(null);
    setConversationId(null);
    setElapsed(0);
  }, [timerInterval]);

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
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
          {step === "connecting" && (
            <div className="space-y-8 text-center">
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
                  {elapsed > 0 ? formatTime(elapsed) : "--:--"}
                </p>
                {elapsed === 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Waiting for avatar to join...
                  </p>
                )}
              </div>

              {/* Video grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Replica video */}
                <div className="aspect-[4/3] rounded-xl overflow-hidden bg-muted/20 flex items-center justify-center relative">
                  <video
                    ref={replicaVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
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
              {uploadingRecording && (
                <p className="text-sm text-muted-foreground">
                  Uploading recording...
                </p>
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
```

- [ ] **Step 3: Commit**

```bash
git add src/app/student/[assignmentId]/page.tsx
git commit -m "feat: replace LiveKit with Daily React for Tavus conversations"
```

---

### Task 6: Update Submission Processing for Tavus

**Files:**
- Modify: `src/app/api/assignments/[id]/submissions/route.ts`
- Modify: `src/app/api/assignments/[id]/submissions/[submissionId]/process/route.ts`

The submission processing currently polls for transcripts by `roomName` (LiveKit room name). With Tavus, transcripts are saved by `conversation_id` (from the Tavus webhook). Update the lookup to use `conversationId` field.

- [ ] **Step 1: Update submissions route transcript lookup**

In `src/app/api/assignments/[id]/submissions/route.ts`, the `getTranscriptFromStorage` function reads from `data/transcripts/{roomName}.txt`. Since we now save transcripts by Tavus `conversation_id`, and the submission's `conversationId` field stores the Tavus conversation_id, no code changes are needed — the field mapping already matches.

Verify the POST handler passes `conversationId` correctly (it does — the student page sends `conversationId: conversationId` which is the Tavus conversation ID).

- [ ] **Step 2: Commit (if any changes needed)**

```bash
git add src/app/api/assignments/[id]/submissions/route.ts
git commit -m "chore: verify submission processing works with Tavus conversation IDs"
```

---

### Task 7: Remove LiveKit Infrastructure

**Files:**
- Delete: `src/lib/livekit.ts`
- Delete: `src/app/api/assignments/[id]/token/route.ts`
- Delete: `src/app/api/webhooks/livekit/route.ts`
- Delete: `agent/` (entire directory)
- Modify: `package.json` (remove LiveKit deps, remove `@google-cloud/storage` since we no longer download from GCS)

- [ ] **Step 1: Delete LiveKit files**

```bash
rm src/lib/livekit.ts
rm src/app/api/assignments/[id]/token/route.ts
rm -r src/app/api/webhooks/livekit/
rm -rf agent/
```

- [ ] **Step 2: Remove LiveKit and GCS packages**

```bash
npm uninstall livekit-client livekit-server-sdk @livekit/components-react @livekit/components-styles @livekit/protocol @google-cloud/storage
```

Note: Keep `googleapis` (used for Google Drive uploads). Keep `@anthropic-ai/sdk` (used for PDF summarization in upload route).

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit 2>&1 | grep -v "Cannot find module" | head -20
```

(Pre-existing errors about missing `node_modules` are fine since we haven't run `npm install` in CI. We just need to confirm no NEW errors from our changes — specifically no dangling imports to deleted files.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove LiveKit infrastructure and Python agent"
```

---

### Task 8: Set TAVUS_API_KEY Environment Variable

- [ ] **Step 1: Add to .env.local**

```bash
echo 'TAVUS_API_KEY=45a13dc28cbb4a238c64bd284e4ea8ee' >> .env.local
```

If `.env.local` doesn't exist, create it. Also ensure `TAVUS_REPLICA_ID` and `TAVUS_PERSONA_ID` are set (these should already exist from the LiveKit agent setup).

- [ ] **Step 2: Verify env vars are present**

```bash
grep -E "TAVUS_|GOOGLE_DRIVE|GOOGLE_CREDENTIALS" .env.local
```

Expected: `TAVUS_API_KEY`, `TAVUS_REPLICA_ID`, `TAVUS_PERSONA_ID`, `GOOGLE_CREDENTIALS_BASE64`, `GOOGLE_DRIVE_PARENT_FOLDER_ID` should all be present.

- [ ] **Step 3: Commit (do NOT commit .env.local)**

This step is just verification — `.env.local` should be in `.gitignore`.

---

### Task 9: End-to-End Smoke Test

- [ ] **Step 1: Install deps and start dev server**

```bash
npm install && npm run dev
```

- [ ] **Step 2: Test conversation creation**

Open browser, navigate to a student assignment page. Click "Begin" and verify:
- Tavus conversation is created (check server logs)
- Daily call connects and shows replica video
- Timer starts when replica joins
- Audio recording starts (check console logs)

- [ ] **Step 3: Test end and submit flow**

End the interview, enter SUNNet ID, submit. Verify:
- Recording blob uploads to Google Drive
- Submission is created with correct `conversationId`
- Transcript appears (may take a few seconds for Tavus webhook)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete migration from LiveKit to Tavus direct API"
```
