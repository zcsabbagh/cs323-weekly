"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { GridBackground } from "@/components/grid-bg";
import type { Assignment, Student } from "@/lib/db";

const TEACHER_PASSWORD = "ebsy";

export default function TeacherPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  // Assignments
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState("");
  const [fileList, setFileList] = useState<File[]>([]);
  const [interviewEnabled, setInterviewEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Students
  const [students, setStudents] = useState<Student[]>([]);
  const [addingStudent, setAddingStudent] = useState(false);
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [studentSunnetId, setStudentSunnetId] = useState("");
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState("");

  // Submission counts
  const [submissionCounts, setSubmissionCounts] = useState<
    Record<string, number>
  >({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("teacher_auth");
      if (stored === "true") setAuthenticated(true);
    }
  }, []);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === TEACHER_PASSWORD) {
      setAuthenticated(true);
      sessionStorage.setItem("teacher_auth", "true");
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  }

  // Fetch assignments
  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/assignments")
      .then((r) => r.json())
      .then((data: Assignment[]) => {
        setAssignments(data);
        // Fetch submission counts for each
        data.forEach((a) => {
          fetch(`/api/assignments/${a.id}/submissions`)
            .then((r) => r.json())
            .then((subs: unknown[]) => {
              setSubmissionCounts((prev) => ({
                ...prev,
                [a.id]: subs.length,
              }));
            });
        });
      });
  }, [authenticated]);

  // Fetch students
  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/students")
      .then((r) => r.json())
      .then(setStudents);
  }, [authenticated]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !fileList.length) return;

    setLoading(true);

    const MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // 4MB

    // Upload each PDF individually (parallel) — large files get text extracted client-side
    const summaries = await Promise.all(
      fileList.map(async (f) => {
        let res: Response;

        if (f.size <= MAX_UPLOAD_SIZE) {
          // Small file — send as binary
          const fd = new FormData();
          fd.append("file", f);
          res = await fetch("/api/upload", { method: "POST", body: fd });
        } else {
          // Large file — extract text client-side with pdfjs, send as JSON
          const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
          pdfjsLib.GlobalWorkerOptions.workerSrc = "";
          const arrayBuf = await f.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
          let text = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item: { str?: string }) => item.str || "").join(" ") + "\n";
          }
          res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: f.name, text }),
          });
        }

        if (!res.ok) throw new Error(`Failed to process ${f.name}`);
        const data = await res.json();
        return data.summary as string;
      })
    );

    const context = summaries.join("\n\n---\n\n");

    // Create assignment with pre-processed context
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description: questions, context }),
    });

    if (res.ok) {
      const assignment = await res.json();
      setAssignments((prev) => [...prev, assignment]);
      setSubmissionCounts((prev) => ({ ...prev, [assignment.id]: 0 }));
      const link = `${window.location.origin}/student/${assignment.id}`;
      setCreatedLink(link);
      setTitle("");
      setQuestions("");
      setFileList([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      confetti();
    }
    setLoading(false);
  }

  async function handleDeleteAssignment(
    e: React.MouseEvent,
    assignmentId: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this assignment?")) return;

    const res = await fetch(`/api/assignments/${assignmentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!studentFirstName || !studentLastName || !studentSunnetId) return;

    setStudentLoading(true);
    setStudentError("");

    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: studentFirstName,
        lastName: studentLastName,
        sunnetId: studentSunnetId,
      }),
    });

    if (res.ok) {
      const student = await res.json();
      setStudents((prev) => [...prev, student]);
      setStudentFirstName("");
      setStudentLastName("");
      setStudentSunnetId("");
      setAddingStudent(false);
    } else {
      const err = await res.json();
      setStudentError(err.error || "Failed to add student");
    }
    setStudentLoading(false);
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  // ── Password gate ──
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-8">
        <GridBackground />
        <form
          onSubmit={handleLogin}
          className="w-full max-w-xs space-y-4 relative z-10"
        >
          <h1 className="font-display text-3xl text-center">
            Teacher Dashboard
          </h1>
          <div className="space-y-2">
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(false);
              }}
              placeholder="Password"
              autoFocus
              className="bg-card/80 backdrop-blur-sm"
            />
            {passwordError && (
              <p className="text-xs text-destructive">Incorrect password</p>
            )}
          </div>
          <Button type="submit" className="w-full">
            Enter
          </Button>
        </form>
      </div>
    );
  }

  // ── Authenticated dashboard ──
  return (
    <div className="min-h-screen bg-background relative">
      <GridBackground />

      <header className="border-b border-border px-8 py-5 relative z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="font-display text-2xl text-foreground">
            Teacher Dashboard
          </h1>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            CS 323
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-8 relative z-10 space-y-12">
        {/* ── Assignments section ── */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-4">
            Assignments
          </h2>

          {assignments.length === 0 ? (
            <div className="text-center py-16 border border-border/50 rounded-xl bg-card/40 backdrop-blur-sm">
              <p className="text-muted-foreground text-sm">
                No assignments yet. Click + to create one.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-[11px] text-muted-foreground font-medium h-9">Title</TableHead>
                    <TableHead className="text-[11px] text-muted-foreground font-medium h-9">Created</TableHead>
                    <TableHead className="text-[11px] text-muted-foreground font-medium h-9">Submissions</TableHead>
                    <TableHead className="text-[11px] text-muted-foreground font-medium h-9 w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer border-border/20 hover:bg-muted/30 group"
                      onClick={() =>
                        (window.location.href = `/teacher/${a.id}`)
                      }
                    >
                      <TableCell className="text-sm font-medium py-3">
                        {a.title}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-3">
                        {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-3">
                        {submissionCounts[a.id] ?? "—"}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ transitionProperty: "opacity" }}>
                          {/* Copy link */}
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                            title="Copy student link"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(`${window.location.origin}/student/${a.id}`);
                            }}
                          >
                            <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                            </svg>
                          </button>
                          {/* Delete */}
                          <button
                            className="group/trash h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors"
                            title="Delete assignment"
                            onClick={(e) => handleDeleteAssignment(e, a.id)}
                          >
                            <svg className="h-3.5 w-3.5 text-muted-foreground group-hover/trash:text-destructive transition-colors" style={{ transitionProperty: "color" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* ── Students section ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              Students
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingStudent(true)}
            >
              Add Student
            </Button>
          </div>

          {students.length === 0 ? (
            <div className="text-center py-16 border border-border/50 rounded-xl bg-card/40 backdrop-blur-sm">
              <p className="text-muted-foreground text-sm">
                No students yet. Add one above.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-[11px] text-muted-foreground font-medium h-9">Name</TableHead>
                    <TableHead className="text-[11px] text-muted-foreground font-medium h-9">SUNNet ID</TableHead>
                    <TableHead className="text-[11px] text-muted-foreground font-medium h-9 w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s) => (
                    <TableRow key={s.id} className="border-border/20 hover:bg-muted/30 group">
                      <TableCell className="text-sm py-3">
                        {s.firstName} {s.lastName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono py-3">
                        {s.sunnetId}
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors" style={{ transitionProperty: "color" }}>
                          View Submissions
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </main>

      {/* ── Circular + button ── */}
      <button
        onClick={() => {
          setCreating(true);
          setCreatedLink(null);
        }}
        className="fixed bottom-8 right-8 z-20 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-light hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/20"
        title="New Assignment"
      >
        +
      </button>

      {/* ── Create assignment dialog ── */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="bg-card/95 backdrop-blur-md border-border/50">
          <DialogHeader>
            <DialogTitle className="font-light text-lg">
              New Assignment
            </DialogTitle>
          </DialogHeader>

          {createdLink ? (
            <div className="space-y-5">
              <p className="text-base text-muted-foreground">
                Assignment published! Share this link with students:
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={createdLink}
                  className="font-mono text-sm h-11"
                />
                <Button
                  variant="outline"
                  onClick={() => copyLink(createdLink)}
                  className="h-11"
                >
                  {linkCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <Button
                variant="secondary"
                className="w-full h-11"
                onClick={() => {
                  setCreating(false);
                  setCreatedLink(null);
                }}
              >
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm">
                  Title
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Week 3: Attention Is All You Need"
                  className="h-11 text-base"
                />
              </div>

              {/* File upload zone */}
              <div className="space-y-2">
                <Label className="text-sm">Reading PDFs</Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files.length) {
                      setFileList((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
                    }
                  }}
                  className="border-2 border-dashed border-border/60 hover:border-border rounded-lg p-6 text-center cursor-pointer transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) setFileList((prev) => [...prev, ...Array.from(e.target.files!)]); }}
                  />
                  <div className="text-muted-foreground">
                    <svg className="mx-auto h-8 w-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                    </svg>
                    <p className="text-sm">
                      Drop PDFs here or <span className="text-foreground underline">browse</span>
                    </p>
                  </div>
                </div>

                {/* File preview list */}
                {fileList.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {fileList.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border/30"
                      >
                        <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                        <span className="text-sm truncate flex-1">{f.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(f.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => setFileList((prev) => prev.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Interview toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-sm">Voice Interview</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Students complete a 5-min AI interview
                  </p>
                </div>
                <Switch
                  checked={interviewEnabled}
                  onCheckedChange={setInterviewEnabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="questions" className="text-sm">
                  Questions (optional)
                </Label>
                <Textarea
                  id="questions"
                  value={questions}
                  onChange={(e) => setQuestions(e.target.value)}
                  placeholder="Any specific questions or topics to cover..."
                  rows={3}
                  className="text-base"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !title || !fileList.length}
                className="w-full h-12 text-base"
              >
                {loading ? "Publishing..." : "Publish"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add student dialog ── */}
      <Dialog open={addingStudent} onOpenChange={setAddingStudent}>
        <DialogContent className="bg-card/95 backdrop-blur-md border-border/50">
          <DialogHeader>
            <DialogTitle className="font-light text-lg">
              Add Student
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddStudent} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-xs">
                First Name
              </Label>
              <Input
                id="firstName"
                value={studentFirstName}
                onChange={(e) => setStudentFirstName(e.target.value)}
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-xs">
                Last Name
              </Label>
              <Input
                id="lastName"
                value={studentLastName}
                onChange={(e) => setStudentLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sunnetId" className="text-xs">
                SUNNet ID
              </Label>
              <Input
                id="sunnetId"
                value={studentSunnetId}
                onChange={(e) => setStudentSunnetId(e.target.value)}
                placeholder="jdoe"
              />
            </div>
            {studentError && (
              <p className="text-xs text-destructive">{studentError}</p>
            )}
            <Button
              type="submit"
              disabled={
                studentLoading ||
                !studentFirstName ||
                !studentLastName ||
                !studentSunnetId
              }
              className="w-full"
            >
              {studentLoading ? "Adding..." : "Add Student"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
