"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Assignment } from "@/lib/db";

export default function TeacherPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/assignments")
      .then((r) => r.json())
      .then(setAssignments);
  }, []);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="font-serif text-2xl font-medium text-foreground">
            CS 323 Weekly
          </h1>
          <Button
            onClick={() => setCreating(!creating)}
            variant={creating ? "secondary" : "default"}
          >
            {creating ? "Cancel" : "New Assignment"}
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-8 space-y-6">
        {creating && (
          <Card className="p-6">
            <h2 className="font-serif text-xl font-medium mb-4">
              Create Assignment
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Week 3: Attention Is All You Need"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the readings..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="files">Reading PDFs</Label>
                <Input
                  id="files"
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={(e) => setFiles(e.target.files)}
                />
              </div>
              <Button type="submit" disabled={loading || !title || !files?.length}>
                {loading ? "Creating..." : "Create & Publish"}
              </Button>
            </form>
          </Card>
        )}

        {assignments.length === 0 && !creating ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground font-serif text-lg">
              No assignments yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => (
              <Link key={a.id} href={`/teacher/${a.id}`}>
                <Card className="p-5 hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-serif text-lg font-medium">
                        {a.title}
                      </h3>
                      {a.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {a.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">
                        {new Date(a.createdAt).toLocaleDateString()}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
