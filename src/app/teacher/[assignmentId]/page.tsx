"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/teacher"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              &larr; Back
            </Link>
            <Separator orientation="vertical" className="h-4" />
            <h1 className="text-sm font-medium">{assignment.title}</h1>
          </div>
          <Button variant="outline" size="sm" onClick={copyLink}>
            {copied ? "Copied!" : "Copy Student Link"}
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-8 py-6 flex gap-6">
        {/* Submissions table */}
        <div className={selected ? "w-1/2" : "w-full"}>
          <p className="text-xs text-muted-foreground mb-3">
            {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
          </p>

          {submissions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">
                No submissions yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {studentUrl}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
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
                    <TableCell className="text-sm font-medium">
                      {s.studentName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.studentId}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs ${
                          s.status === "complete"
                            ? "text-foreground"
                            : s.status === "error"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {s.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-1/2 border-l border-border pl-6">
            <div className="sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">
                  {selected.studentName}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
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
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground pr-4">
                      {selected.transcript || "Processing..."}
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
