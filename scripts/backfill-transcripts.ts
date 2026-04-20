/**
 * One-shot backfill: for every submission stuck at status="pending",
 * pull the full transcript from Tavus's REST API and write it back to the
 * DB — flipping status to "complete".
 *
 * Why this is needed: a trailing `\n` in the production NEXT_PUBLIC_URL
 * env var produced a malformed Tavus callback URL
 * ("https://cs323-weekly.vercel.app\n/api/webhooks/tavus"), so every
 * `application.transcription_ready` webhook failed to deliver. Tavus
 * retains the transcript server-side regardless, queryable via
 * GET /v2/conversations/{id}?verbose=true.
 *
 * Run locally with prod credentials:
 *   npx tsx scripts/backfill-transcripts.ts
 */

import { createClient } from "@supabase/supabase-js";
import { getConversation } from "../src/lib/tavus";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY || !process.env.TAVUS_API_KEY) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or service role), TAVUS_API_KEY."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tavus's verbose conversation response embeds an `events[]` array. The
// transcript lives on the `application.transcription_ready` event's
// `properties.transcript` field — same shape the live webhook handler
// already knows how to parse.
interface TavusEvent {
  event_type: string;
  properties?: {
    transcript?: { role: string; content: string }[];
  };
}

interface TavusConversationVerbose {
  conversation_id: string;
  status: string;
  events?: TavusEvent[];
}

function formatTranscript(
  messages: { role: string; content: string }[]
): string {
  return messages
    .filter((m) => m.role !== "system") // drop the giant system prompt
    .map(({ role, content }) => {
      const speaker =
        role === "assistant" || role === "replica" ? "Interviewer" : "Student";
      return `${speaker}: ${content}`;
    })
    .join("\n\n");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  // --repair pulls rows whose stored transcript is malformed (contains the
  // system prompt leak — e.g. starts with "Student: You interview") and
  // overwrites them with a clean re-fetch from Tavus.
  const repair = process.argv.includes("--repair");
  console.log(
    `[Backfill] Starting${dryRun ? " (DRY RUN)" : ""}${repair ? " (REPAIR MODE)" : ""}...`
  );

  let query = supabase
    .from("cs323_submissions")
    .select("id, sunnet_id, conversation_id, status, transcript, created_at");

  if (repair) {
    // Malformed rows start with "Student: You interview" (the system prompt
    // leak) — these need a clean re-fetch.
    query = query.like("transcript", "Student: You interview%");
  } else {
    // Default mode: only pending rows that haven't received a transcript.
    query = query.eq("status", "pending");
  }

  const { data: pending, error } = await query;

  if (error) {
    console.error("[Backfill] DB query failed:", error);
    process.exit(1);
  }

  console.log(`[Backfill] Found ${pending?.length ?? 0} pending submissions`);

  let successes = 0;
  let failures = 0;
  let empties = 0;

  for (const row of pending ?? []) {
    const { id: submissionId, sunnet_id, conversation_id } = row;
    if (!conversation_id) {
      console.log(`  · ${submissionId} (${sunnet_id}): no conversation_id — skip`);
      empties += 1;
      continue;
    }

    try {
      const conv = (await getConversation(
        conversation_id
      )) as unknown as TavusConversationVerbose;

      const transcriptEvent = conv.events?.find(
        (e) => e.event_type === "application.transcription_ready"
      );
      const messages = transcriptEvent?.properties?.transcript ?? [];

      if (messages.length === 0) {
        console.log(
          `  · ${submissionId} (${sunnet_id}) conv=${conversation_id}: no transcript event (status=${conv.status})`
        );
        empties += 1;
        continue;
      }

      const transcript = formatTranscript(messages);

      if (dryRun) {
        console.log(
          `  ✓ [dry] ${submissionId} (${sunnet_id}): ${messages.length - 1} turns, ${transcript.length} chars`
        );
      } else {
        const { error: upErr } = await supabase
          .from("cs323_submissions")
          .update({ transcript, status: "complete" })
          .eq("id", submissionId);
        if (upErr) {
          console.error(
            `  ✗ ${submissionId} (${sunnet_id}): DB update failed:`,
            upErr.message
          );
          failures += 1;
          continue;
        }
        console.log(
          `  ✓ ${submissionId} (${sunnet_id}): ${messages.length - 1} turns, ${transcript.length} chars → complete`
        );
      }
      successes += 1;
    } catch (err) {
      console.error(
        `  ✗ ${submissionId} (${sunnet_id}) conv=${conversation_id}:`,
        err instanceof Error ? err.message : err
      );
      failures += 1;
    }
  }

  console.log(
    `\n[Backfill] Done — ${successes} success, ${failures} failure, ${empties} empty`
  );
}

main().catch((err) => {
  console.error("[Backfill] Fatal:", err);
  process.exit(1);
});
