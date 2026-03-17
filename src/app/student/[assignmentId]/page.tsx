"use client";

import { useState, useCallback, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Assignment } from "@/lib/db";
import { useConversation } from "@11labs/react";

type Step = "info" | "ready" | "interview" | "done";

export default function StudentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = use(params);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [step, setStep] = useState<Step>("info");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);

  const conversation = useConversation({
    onConnect: () => {
      setStep("interview");
      // Start timer
      const interval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
      setTimerInterval(interval);
    },
    onDisconnect: () => {
      if (timerInterval) clearInterval(timerInterval);
    },
  });

  useEffect(() => {
    fetch(`/api/assignments/${assignmentId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setAssignment)
      .catch(() => setNotFound(true));
  }, [assignmentId]);

  const startInterview = useCallback(async () => {
    try {
      // Get signed URL from our backend
      const res = await fetch(`/api/assignments/${assignmentId}/signed-url`);
      const { signedUrl } = await res.json();

      // Start ElevenLabs conversation (returns conversation ID)
      const convId = await conversation.startSession({
        signedUrl,
      });
      if (convId) setConversationId(convId);

      setStep("interview");
    } catch (err) {
      console.error("Failed to start interview:", err);
    }
  }, [assignmentId, conversation]);

  const endInterview = useCallback(async () => {
    if (timerInterval) clearInterval(timerInterval);

    // Get the conversation ID before ending
    const convId = conversation.getId();
    await conversation.endSession();

    if (convId) {
      setConversationId(convId);
    }

    setStep("done");
  }, [conversation, timerInterval]);

  const submitInterview = useCallback(async () => {
    if (!conversationId) return;
    setSubmitting(true);

    await fetch(`/api/assignments/${assignmentId}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName,
        studentId,
        conversationId,
      }),
    });

    setSubmitted(true);
    setSubmitting(false);
  }, [assignmentId, studentName, studentId, conversationId]);

  const restart = useCallback(() => {
    setStep("ready");
    setConversationId(null);
    setElapsed(0);
    setSubmitted(false);
  }, []);

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground font-serif text-lg">
          Assignment not found.
        </p>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <Card className="w-full max-w-lg p-8 space-y-6">
        <div>
          <h1 className="font-serif text-2xl font-medium text-foreground">
            {assignment.title}
          </h1>
          {assignment.description && (
            <p className="text-sm text-muted-foreground mt-1 font-serif">
              {assignment.description}
            </p>
          )}
        </div>

        {step === "info" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep("ready");
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sid">Student ID</Label>
              <Input
                id="sid"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="12345678"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!studentName || !studentId}
            >
              Continue
            </Button>
          </form>
        )}

        {step === "ready" && (
          <div className="space-y-4 text-center">
            <p className="font-serif text-muted-foreground">
              When you&apos;re ready, start the interview. You&apos;ll have a
              5-minute voice conversation about the readings.
            </p>
            <Button onClick={startInterview} size="lg" className="w-full">
              Start Interview
            </Button>
          </div>
        )}

        {step === "interview" && (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <Badge
                variant={elapsed >= 300 ? "destructive" : "secondary"}
                className="text-lg px-4 py-1 font-mono"
              >
                {formatTime(elapsed)}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {conversation.isSpeaking
                  ? "Interviewer is speaking..."
                  : "Listening..."}
              </p>
            </div>

            {/* Pulsing indicator */}
            <div className="flex justify-center">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  conversation.isSpeaking
                    ? "bg-primary/20 animate-pulse"
                    : "bg-muted"
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full ${
                    conversation.isSpeaking ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
              </div>
            </div>

            <Button
              onClick={endInterview}
              variant="secondary"
              size="lg"
              className="w-full"
            >
              End Interview
            </Button>
          </div>
        )}

        {step === "done" && !submitted && (
          <div className="space-y-4 text-center">
            <p className="font-serif text-muted-foreground">
              Interview complete! Duration: {formatTime(elapsed)}
            </p>
            <div className="flex gap-3">
              <Button onClick={restart} variant="secondary" className="flex-1">
                Re-record
              </Button>
              <Button
                onClick={submitInterview}
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </div>
        )}

        {submitted && (
          <div className="text-center space-y-2">
            <p className="font-serif text-lg font-medium text-foreground">
              Submitted successfully
            </p>
            <p className="text-sm text-muted-foreground">
              Your interview has been recorded and will be processed shortly.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
