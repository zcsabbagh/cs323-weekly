"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GridBackground } from "@/components/grid-bg";
import type { Assignment, Submission, Student } from "@/lib/db";

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = use(params);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [reprocessing, setReprocessing] = useState<string | null>(null);

  async function handleReprocess(sub: Submission) {
    setReprocessing(sub.id);
    const res = await fetch(
      `/api/assignments/${assignmentId}/submissions/${sub.id}/process`,
      { method: "POST" }
    );
    if (res.ok) {
      const updated = await res.json();
      setSubmissions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      if (selected?.id === updated.id) setSelected(updated);
    }
    setReprocessing(null);
  }

  useEffect(() => {
    fetch(`/api/assignments/${assignmentId}`)
      .then((r) => r.json())
      .then(setAssignment);
    fetch(`/api/assignments/${assignmentId}/submissions`)
      .then((r) => r.json())
      .then(setSubmissions);
    fetch("/api/students")
      .then((r) => r.json())
      .then(setStudents);
  }, [assignmentId]);

  const studentUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/student/${assignmentId}`
      : "";

  function copyLink() {
    navigator.clipboard.writeText(studentUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function lookupStudent(sunnetId: string): string {
    const student = students.find((s) => s.sunnetId === sunnetId);
    if (student) return `${student.firstName} ${student.lastName}`;
    return sunnetId;
  }

  async function toggleScore(sub: Submission, e?: React.MouseEvent) {
    if (e) { e.stopPropagation(); }
    const newScore = sub.score === "pass" ? "fail" : "pass";
    const res = await fetch(
      `/api/assignments/${assignmentId}/submissions/${sub.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: newScore }),
      }
    );
    if (res.ok) {
      const updated = await res.json();
      setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      if (selected?.id === updated.id) setSelected(updated);
    }
  }

  function scoreBadge(sub: Submission, clickable = true) {
    const colors = {
      pass: "bg-green-500/15 text-green-400 border-green-500/20 hover:bg-green-500/25",
      fail: "bg-red-500/15 text-red-400 border-red-500/20 hover:bg-red-500/25",
      pending: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
    };
    return (
      <button
        type="button"
        onClick={clickable ? (e) => toggleScore(sub, e) : undefined}
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors ${colors[sub.score]}`}
        title={clickable ? "Click to toggle pass/fail" : undefined}
      >
        {sub.score}
      </button>
    );
  }

  function statusBadge(status: Submission["status"]) {
    const colors: Record<string, string> = {
      complete: "bg-green-500/15 text-green-400 border-green-500/20",
      error: "bg-red-500/15 text-red-400 border-red-500/20",
      processing: "bg-amber-500/15 text-amber-400 border-amber-500/20",
      pending: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.pending}`}
      >
        {status}
      </span>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <GridBackground />

      <header className="border-b border-border px-8 py-4 relative z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/teacher"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </Link>
            <Separator orientation="vertical" className="h-4" />
            <h1 className="font-display text-lg">{assignment.title}</h1>
          </div>
          <Button variant="outline" size="sm" onClick={copyLink}>
            {linkCopied ? "Copied!" : "Copy Student Link"}
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-8 py-6 flex gap-6 relative z-10">
        {/* Submissions table */}
        <div
          className={`transition-all duration-200 ${selected ? "w-1/2" : "w-full"}`}
        >
          <p className="text-xs text-muted-foreground mb-3">
            {submissions.length} submission
            {submissions.length !== 1 ? "s" : ""}
          </p>

          {submissions.length === 0 ? (
            <div className="py-16 text-center border border-border/50 rounded-lg bg-card/40 backdrop-blur-sm">
              <p className="text-sm text-muted-foreground">
                No submissions yet.
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Input
                  readOnly
                  value={studentUrl}
                  className="max-w-xs font-mono text-xs"
                />
                <Button variant="outline" size="sm" onClick={copyLink}>
                  {linkCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Submission ID</TableHead>
                  <TableHead className="text-xs">Student Name</TableHead>
                  <TableHead className="text-xs">SUNNet ID</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Score</TableHead>
                  <TableHead className="text-xs">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow
                    key={s.id}
                    className={`cursor-pointer transition-colors ${
                      selected?.id === s.id
                        ? "bg-muted"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() =>
                      setSelected(selected?.id === s.id ? null : s)
                    }
                  >
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {s.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {lookupStudent(s.sunnetId)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {s.sunnetId}
                    </TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell>{scoreBadge(s)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ── Side panel ── */}
        {selected && (
          <div className="w-1/2 border-l border-border pl-6">
            <div className="sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-medium">
                    {lookupStudent(selected.sunnetId)}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {selected.sunnetId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {scoreBadge(selected)}
                  <button
                    className="group relative h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors"
                    title="Delete submission"
                    onClick={async () => {
                      if (!confirm("Delete this submission?")) return;
                      // For now just remove from local state
                      setSubmissions((prev) => prev.filter((s) => s.id !== selected.id));
                      setSelected(null);
                    }}
                  >
                    {/* Closed trash (default) */}
                    <svg
                      className="h-3.5 w-3.5 text-muted-foreground group-hover:text-destructive group-hover:opacity-0 transition-opacity absolute"
                      style={{ transitionProperty: "opacity, color" }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                    {/* Open trash (hover) */}
                    <svg
                      className="h-3.5 w-3.5 text-destructive opacity-0 group-hover:opacity-100 transition-opacity absolute scale-110"
                      style={{ transitionProperty: "opacity, transform" }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors disabled:opacity-40"
                    title="Reprocess"
                    disabled={reprocessing === selected.id}
                    onClick={() => handleReprocess(selected)}
                  >
                    <svg
                      className={`h-3.5 w-3.5 text-muted-foreground ${reprocessing === selected.id ? "animate-spin" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M20.015 4.356v4.992" />
                    </svg>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-2">
                    Summary
                  </h4>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {selected.summary || "Processing..."}
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-2">
                    Transcript
                  </h4>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2 pr-4">
                      {selected.transcript ? (
                        selected.transcript.split("\n\n").map((line, i) => {
                          const isInterviewer = line.startsWith("Interviewer:");
                          const text = line.replace(/^(Interviewer|Student):\s*/, "");
                          return (
                            <div
                              key={i}
                              className={`flex ${isInterviewer ? "justify-start" : "justify-end"}`}
                            >
                              <div
                                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                                  isInterviewer
                                    ? "bg-muted text-foreground rounded-bl-md"
                                    : "bg-primary text-primary-foreground rounded-br-md"
                                }`}
                              >
                                {text}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground">Processing...</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
