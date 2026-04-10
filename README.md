# CS323 Weekly

AI-powered weekly reading interviews for Stanford CS 323. Teachers upload course readings; students have a 5-minute spoken interview with an AI TA about the material. Recordings and transcripts are automatically saved to Google Drive and Supabase.

**Live:** [cs323.vercel.app](https://cs323.vercel.app)

---

## How it works

1. **Teacher portal** (`/teacher`, password `ebsy`)
   - Upload PDF readings → Claude summarizes them into reading context
   - Create an assignment with a title and reading context
   - When created, the app automatically:
     - Creates a Tavus persona with the CS323 interview system prompt + the reading context baked in
     - Creates a Google Drive subfolder named `CS323 - {title}` for recordings

2. **Student flow** (`/student/{assignmentId}`)
   - Student grants mic + camera permissions and clicks "Begin"
   - Backend creates a Tavus conversation tied to that assignment's persona
   - Client joins the Tavus room via Daily.js
   - The AI TA (Tavus replica) starts asking questions about the readings
   - 5-minute countdown timer, video+audio recorded client-side via MediaRecorder
   - On "End Early" or timer expiry, student enters their SUNet ID and submits
   - Recording uploads to Supabase Storage (bypasses Vercel's 4.5 MB body limit), then transfers server-side to Google Drive
   - Tavus webhook delivers the conversation transcript to our `/api/webhooks/tavus` endpoint, which updates the submission row in Supabase

3. **Data storage**
   - **Supabase Postgres** (`cs323_assignments`, `cs323_students`, `cs323_submissions` tables) — all metadata, transcripts, submission status
   - **Google Drive** — video recordings, one subfolder per assignment
   - **Supabase Storage** (`cs323-recordings` bucket) — temporary upload buffer before Drive transfer

---

## Architecture

```
Teacher ─┐                              ┌─ Supabase Postgres (metadata, transcripts)
         │                              │
         ▼                              ▼
   Vercel (Next.js App Router) ────▶ Supabase Storage (recording buffer)
         ▲                              │
         │                              ▼
         │                         Google Drive (final recordings)
         │
Student ─┴──▶ Tavus API ──▶ Daily.js video room ──▶ MediaRecorder (client)
                   │                                         │
                   ▼                                         ▼
           Transcript webhook ──▶ Vercel ──▶ Supabase        Upload blob ──▶ Supabase Storage
                                                                      │
                                                                      ▼
                                                             Server transfer to Drive
```

**Key tech:**
- Frontend: Next.js 16 (App Router), React 19, Tailwind, shadcn/ui
- Video: Tavus REST API for conversations, `@daily-co/daily-js` client SDK for joining rooms
- Database: Supabase Postgres (`@supabase/supabase-js`)
- Storage: Supabase Storage + Google Drive via `googleapis`
- PDF summarization: `@anthropic-ai/sdk` with Claude Sonnet
- Recording: Browser-native MediaRecorder, patched with `fix-webm-duration` for Drive previews
- Hosting: Vercel

---

## Running locally

### Prerequisites
- Node.js 20+
- All env vars set in `.env.local` (see below)

### Environment variables

Copy the credentials file you were given to `.env.local` at the project root, or set these yourself:

```bash
# Tavus
TAVUS_API_KEY=...
TAVUS_REPLICA_ID=...   # e.g. rf8f3aa4b33e
TAVUS_PERSONA_ID=...   # fallback persona; each assignment creates its own

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://epoviaqcrixushetuoze.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Google Drive (service account with access to the shared drive)
GOOGLE_DRIVE_PARENT_FOLDER_ID=...   # the shared drive root
GOOGLE_CREDENTIALS_BASE64=...       # base64-encoded service account JSON

# Anthropic (for PDF summarization in upload route)
ANTHROPIC_API_KEY=sk-ant-...
```

### Install + run

```bash
npm install
npm run dev
```

Then open:
- Teacher portal: http://localhost:3000/teacher (password: `ebsy`)
- Student page: http://localhost:3000/student/{assignmentId}

### Deploying

The app is deployed to Vercel at [cs323.vercel.app](https://cs323.vercel.app) from the `main` branch. To deploy changes:

```bash
git push origin main
# or manually:
vercel --prod
```

All env vars must be set in the Vercel project dashboard (Settings → Environment Variables).

---

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── assignments/          # CRUD for assignments
│   │   │   ├── route.ts          # POST creates assignment + Tavus persona + Drive folder
│   │   │   └── [id]/
│   │   │       ├── conversation/ # POST creates a Tavus conversation
│   │   │       └── submissions/  # Submissions CRUD
│   │   ├── recordings/
│   │   │   ├── upload/           # (legacy) direct multipart upload — 4.5 MB limit
│   │   │   └── transfer/         # Moves recording from Supabase Storage to Drive
│   │   ├── students/             # Student roster CRUD
│   │   ├── upload/               # PDF upload + Claude summarization
│   │   └── webhooks/tavus/       # Tavus webhook handler (transcripts, shutdown)
│   ├── student/[assignmentId]/   # Student interview page
│   └── teacher/                  # Teacher dashboard (password-gated)
├── lib/
│   ├── db.ts                     # Supabase data access layer
│   ├── tavus.ts                  # Tavus REST API client
│   ├── google-drive.ts           # Drive upload + folder creation
│   ├── supabase.ts               # Supabase client
│   └── api.ts                    # Frontend fetch wrapper
└── components/ui/                # shadcn/ui components
```

---

## Outstanding TODO

### Recording pipeline: agent + student composite

The recording currently captures:
- Remote (Tavus replica) video
- Remote audio
- Local (student) audio

**Missing:** The student's camera is visible in the UI during the interview, but is **not included in the recorded file**. The final goal is a side-by-side composite recording showing both the agent and the student, with both audio tracks mixed.

**Approaches to implement this:**

1. **Canvas compositing (client-side)**
   - Draw both `<video>` elements onto a `<canvas>` in a loop (e.g. 30 fps using `requestAnimationFrame`)
   - Capture the canvas as a MediaStream via `canvas.captureStream()`
   - Mix audio tracks using the Web Audio API (`AudioContext.createMediaStreamSource` + `createMediaStreamDestination`)
   - Feed the combined video+audio stream into MediaRecorder
   - Pro: self-contained, no server cost, no extra infra
   - Con: browser CPU overhead; quality depends on client hardware

2. **Server-side composition (ffmpeg on Vercel or a worker)**
   - Keep recording agent and student as separate streams
   - On submit, send both to a backend job that composites them with ffmpeg
   - Pro: consistent quality, server has full control
   - Con: needs ffmpeg in the runtime (tricky on Vercel serverless), or a separate worker service

3. **Use Tavus's native recording**
   - Tavus supports conversation recordings via AWS S3 (requires IAM role trust with Tavus's AWS account)
   - Tavus emits an `application.recording_ready` webhook when the file is ready
   - Pro: no client-side CPU hit, proper server-side composite
   - Con: requires setting up an AWS S3 bucket with a specific IAM trust policy (see `https://docs.tavus.io/sections/conversational-video-interface/quickstart/conversation-recordings`)

**Recommendation:** Option 3 (Tavus native recording) is cleanest long-term. Option 1 (canvas compositing) is the fastest to ship and keeps everything in one stack.

Once the composite is in place, the final recordings in the `CS323 - {assignment title}` Drive folder should show both the agent and the student with synchronized audio — exactly what's needed for TA review.

### Other known issues

- **Transcripts sometimes don't arrive**: The Tavus webhook delivers `application.transcription_ready` events, but in testing they haven't always fired. Needs verification that Tavus is actually calling `https://cs323.vercel.app/api/webhooks/tavus` — check Tavus dashboard webhook delivery logs.
- **WebM preview in Drive**: The `fix-webm-duration` library patches missing duration metadata so Google Drive can process and preview the recordings. If Drive still shows "still being processed," wait a few minutes — transcoding can take a while for larger files.
