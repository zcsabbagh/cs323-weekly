"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Assignment, Submission } from "@/lib/db";

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = use(params);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/assignments/${assignmentId}`)
      .then((r) => r.json())
      .then(setAssignment);
    fetch(`/api/assignments/${assignmentId}/submissions`)
      .then((r) => r.json())
      .then(setSubmissions);
  }, [assignmentId]);

  const studentUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/student/${assignmentId}`
      : "";

  function copyLink() {
    navigator.clipboard.writeText(studentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-8 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/teacher"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              &larr; Back
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <h1 className="font-serif text-xl font-medium">{assignment.title}</h1>
          </div>
          <Button variant="secondary" onClick={copyLink}>
            {copied ? "Copied!" : "Copy Student Link"}
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-8 py-8 flex gap-8">
        {/* Submissions table */}
        <div className={selected ? "w-1/2" : "w-full"}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg font-medium">
              Submissions ({submissions.length})
            </h2>
          </div>

          {submissions.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground font-serif">
                No submissions yet. Share the student link to get started.
              </p>
              <p className="text-sm text-muted-foreground mt-2 font-mono">
                {studentUrl}
              </p>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((s) => (
                    <TableRow
                      key={s.id}
                      className={`cursor-pointer transition-colors ${
                        selected?.id === s.id
                          ? "bg-accent"
                          : "hover:bg-accent/50"
                      }`}
                      onClick={() =>
                        setSelected(selected?.id === s.id ? null : s)
                      }
                    >
                      <TableCell className="font-medium">
                        {s.studentName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.studentId}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.status === "complete"
                              ? "default"
                              : s.status === "error"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-1/2">
            <Card className="p-6 sticky top-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg font-medium">
                  {selected.studentName}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Summary
                  </h4>
                  <div className="font-serif text-sm leading-relaxed whitespace-pre-wrap">
                    {selected.summary || "Processing..."}
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Full Transcript
                  </h4>
                  <div className="font-serif text-sm leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {selected.transcript || "Processing..."}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
