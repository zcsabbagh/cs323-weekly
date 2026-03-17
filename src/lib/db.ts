import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

export interface Assignment {
  id: string;
  title: string;
  description: string;
  context: string; // extracted PDF text
  agentId: string; // ElevenLabs agent ID
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentName: string;
  studentId: string;
  conversationId: string;
  transcript: string;
  summary: string;
  status: "pending" | "processing" | "complete" | "error";
  createdAt: string;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function assignmentsFile() {
  return path.join(DATA_DIR, "assignments.json");
}

function submissionsFile(assignmentId: string) {
  return path.join(DATA_DIR, "submissions", `${assignmentId}.json`);
}

export async function getAssignments(): Promise<Assignment[]> {
  await ensureDir(DATA_DIR);
  try {
    const data = await fs.readFile(assignmentsFile(), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const assignments = await getAssignments();
  return assignments.find((a) => a.id === id) || null;
}

export async function saveAssignment(assignment: Assignment) {
  await ensureDir(DATA_DIR);
  const assignments = await getAssignments();
  const idx = assignments.findIndex((a) => a.id === assignment.id);
  if (idx >= 0) assignments[idx] = assignment;
  else assignments.push(assignment);
  await fs.writeFile(assignmentsFile(), JSON.stringify(assignments, null, 2));
}

export async function getSubmissions(assignmentId: string): Promise<Submission[]> {
  await ensureDir(path.join(DATA_DIR, "submissions"));
  try {
    const data = await fs.readFile(submissionsFile(assignmentId), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function getSubmission(
  assignmentId: string,
  submissionId: string
): Promise<Submission | null> {
  const submissions = await getSubmissions(assignmentId);
  return submissions.find((s) => s.id === submissionId) || null;
}

export async function saveSubmission(submission: Submission) {
  await ensureDir(path.join(DATA_DIR, "submissions"));
  const submissions = await getSubmissions(submission.assignmentId);
  const idx = submissions.findIndex((s) => s.id === submission.id);
  if (idx >= 0) submissions[idx] = submission;
  else submissions.push(submission);
  await fs.writeFile(
    submissionsFile(submission.assignmentId),
    JSON.stringify(submissions, null, 2)
  );
}
