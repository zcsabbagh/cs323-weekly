"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GridBackground } from "@/components/grid-bg";
import type { Assignment } from "@/lib/db";

const TEACHER_PASSWORD = "ebsy";

export default function TeacherPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/assignments")
      .then((r) => r.json())
      .then(setAssignments);
  }, [authenticated]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !files?.length) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    const res = await fetch("/api/assignments", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const assignment = await res.json();
      setAssignments((prev) => [...prev, assignment]);
      setTitle("");
      setDescription("");
      setFiles(null);
      setCreating(false);
    }
    setLoading(false);
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-8">
        <GridBackground />
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4 relative z-10">
          <h1 className="text-xl font-light text-center">
            Teacher Access
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

  return (
    <div className="min-h-screen bg-background relative">
      <GridBackground />

      <header className="border-b border-border px-8 py-5 relative z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-light text-foreground">
            CS 323
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-8 relative z-10">
        {assignments.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-sm">
              No assignments yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <Link key={a.id} href={`/teacher/${a.id}`}>
                <div className="flex items-center justify-between py-4 px-4 border border-border/50 rounded-lg bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-colors cursor-pointer mb-2">
                  <div>
                    <h3 className="text-sm font-medium">{a.title}</h3>
                    {a.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Circular plus button — fixed bottom right */}
      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-8 right-8 z-20 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-light hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/20"
        title="New Assignment"
      >
        +
      </button>

      {/* Create assignment dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="bg-card/95 backdrop-blur-md border-border/50">
          <DialogHeader>
            <DialogTitle className="font-light text-lg">New Assignment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-xs">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Week 3: Attention Is All You Need"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the readings..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="files" className="text-xs">Reading PDFs</Label>
              <Input
                id="files"
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => setFiles(e.target.files)}
              />
            </div>
            <Button type="submit" disabled={loading || !title || !files?.length} className="w-full">
              {loading ? "Creating..." : "Create & Publish"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
