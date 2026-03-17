"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Assignment } from "@/lib/db";

export default function StudentLanding() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/assignments")
      .then((r) => r.json())
      .then((data) => {
        setAssignments(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="font-display text-3xl">CS 323</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select an assignment
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No assignments available.
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <Link
                key={a.id}
                href={`/student/${a.id}`}
                className="block rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors"
              >
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(a.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
