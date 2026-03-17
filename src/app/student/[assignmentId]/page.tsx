"use client";

import { copyToClipboard } from "@/lib/copy";
import { api } from "@/lib/api";
import { useState, useCallback, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Waveform } from "@/components/waveform";
import type { Assignment } from "@/lib/db";
import { useConversation } from "@11labs/react";

const INTERVIEW_DURATION = 300; // 5 minutes in seconds

type Step = "loading" | "ready" | "interview" | "done" | "submitted";

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
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(
    null
  );
  const [sunnetId, setSunnetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const conversation = useConversation({
    onConnect: () => {
      setStep("interview");
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
    },
    onDisconnect: () => {
      if (timerInterval) clearInterval(timerInterval);
    },
  });

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
      const res = await api(`/api/assignments/${assignmentId}/signed-url`);
      const { signedUrl } = await res.json();
      const convId = await conversation.startSession({ signedUrl });
      if (convId) setConversationId(convId);
      setStep("interview");
    } catch (err) {
      console.error("Failed to start interview:", err);
    }
  }, [assignmentId, conversation]);

  const endInterview = useCallback(async () => {
    if (timerInterval) clearInterval(timerInterval);
    const convId = conversation.getId();
    await conversation.endSession();
    if (convId) setConversationId(convId);
    setStep("done");
  }, [conversation, timerInterval]);

  const submitInterview = useCallback(async () => {
    if (!conversationId || !sunnetId.trim()) return;
    setSubmitting(true);
    const res = await api(`/api/assignments/${assignmentId}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sunnetId, conversationId, duration: formatTime(INTERVIEW_DURATION - elapsed) }),
    });
    const data = await res.json();
    setSubmissionId(data.id);
    setSubmitting(false);
    setStep("submitted");
  }, [assignmentId, sunnetId, conversationId]);

  const restart = useCallback(() => {
    setStep("ready");
    setConversationId(null);
    setElapsed(0);
  }, []);

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
      <div className="w-full max-w-lg">
        {/* Card container */}
        <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-8 md:p-10 space-y-8"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.03)" }}
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
                  &ldquo;Begin.&rdquo; You can re-record as many times as
                  you&apos;d like — the call will last 5 minutes.
                </p>
              </div>
              <Button
                onClick={startInterview}
                className="w-full h-14 text-lg rounded-xl hover:scale-[1.01] active:scale-[0.96]"
                style={{ transitionProperty: "transform, background-color" }}
              >
                Begin
              </Button>
            </div>
          )}

          {/* Interview */}
          {step === "interview" && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <p className="text-6xl font-mono font-light tabular-nums tracking-wider">
                  {formatTime(elapsed)}
                </p>
              </div>

              {/* Waveform */}
              <div className="space-y-2">
                <div className="h-20 w-full rounded-xl overflow-hidden bg-muted/20">
                  <Waveform isSpeaking={conversation.isSpeaking} />
                </div>
                <p className={`text-center text-sm font-medium ${
                  conversation.isSpeaking ? "text-green-400" : "text-blue-400"
                }`}
                  style={{ transitionProperty: "color" }}
                >
                  {conversation.isSpeaking ? "Speaking" : "Listening"}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={startInterview}
                  variant="outline"
                  className="flex-1 h-14 text-base rounded-xl hover:scale-[1.01] active:scale-[0.96]"
                  style={{ transitionProperty: "transform, background-color, border-color" }}
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
                  style={{ transitionProperty: "transform, background-color, border-color" }}
                >
                  Re-record
                </Button>
                <Button
                  onClick={submitInterview}
                  disabled={!sunnetId.trim() || submitting}
                  className="flex-1 h-14 text-base rounded-xl hover:scale-[1.01] active:scale-[0.96]"
                  style={{ transitionProperty: "transform, background-color, opacity" }}
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
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-2xl font-medium">Submitted</p>
              <p className="text-base text-muted-foreground" style={{ textWrap: "pretty" }}>
                Your interview has been recorded and will be processed shortly.
              </p>
              {submissionId && (
                <div className="pt-3 space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Submission ID</p>
                  <div className="inline-flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-sm font-mono text-foreground select-all">{submissionId}</p>
                    <button
                      onClick={() => copyToClipboard(submissionId)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors shrink-0"
                      title="Copy"
                    >
                      <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Keep this for your records.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
