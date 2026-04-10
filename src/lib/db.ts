import { supabase } from "./supabase";

export interface Assignment {
  id: string;
  title: string;
  description: string;
  context: string; // extracted PDF text
  agentId: string; // "tavus" or legacy agent ID
  personaId?: string; // Tavus persona ID (per-assignment)
  driveFolderId?: string; // Google Drive folder for recordings
  createdAt: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  sunnetId: string;
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  sunnetId: string;
  conversationId: string;
  transcript: string;
  summary: string;
  score: "pass" | "fail" | "pending";
  duration: string;
  status: "pending" | "processing" | "complete" | "error";
  createdAt: string;
}

// ---------- Row mappers ----------

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  context: string;
  agent_id: string | null;
  persona_id: string | null;
  drive_folder_id: string | null;
  created_at: string;
}

function rowToAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    context: row.context,
    agentId: row.agent_id || "tavus",
    personaId: row.persona_id || undefined,
    driveFolderId: row.drive_folder_id || undefined,
    createdAt: row.created_at,
  };
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  sunnet_id: string;
  created_at: string;
}

function rowToStudent(row: StudentRow): Student {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    sunnetId: row.sunnet_id,
    createdAt: row.created_at,
  };
}

interface SubmissionRow {
  id: string;
  assignment_id: string;
  sunnet_id: string;
  conversation_id: string;
  transcript: string | null;
  summary: string | null;
  score: string;
  duration: string | null;
  status: string;
  created_at: string;
}

function rowToSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    sunnetId: row.sunnet_id,
    conversationId: row.conversation_id,
    transcript: row.transcript || "",
    summary: row.summary || "",
    score: row.score as Submission["score"],
    duration: row.duration || "0:00",
    status: row.status as Submission["status"],
    createdAt: row.created_at,
  };
}

// ---------- Assignments ----------

export async function getAssignments(): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from("cs323_assignments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToAssignment);
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const { data, error } = await supabase
    .from("cs323_assignments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAssignment(data) : null;
}

export async function saveAssignment(assignment: Assignment): Promise<void> {
  const { error } = await supabase.from("cs323_assignments").upsert({
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    context: assignment.context,
    agent_id: assignment.agentId,
    persona_id: assignment.personaId || null,
    drive_folder_id: assignment.driveFolderId || null,
    created_at: assignment.createdAt,
  });
  if (error) throw error;
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase
    .from("cs323_assignments")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---------- Students ----------

export async function getStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from("cs323_students")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToStudent);
}

export async function saveStudent(student: Student): Promise<void> {
  const { error } = await supabase.from("cs323_students").upsert({
    id: student.id,
    first_name: student.firstName,
    last_name: student.lastName,
    sunnet_id: student.sunnetId,
    created_at: student.createdAt,
  });
  if (error) throw error;
}

export async function deleteStudent(id: string): Promise<void> {
  const { error } = await supabase
    .from("cs323_students")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---------- Submissions ----------

export async function getSubmissions(assignmentId: string): Promise<Submission[]> {
  const { data, error } = await supabase
    .from("cs323_submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToSubmission);
}

export async function getSubmission(
  assignmentId: string,
  submissionId: string
): Promise<Submission | null> {
  const { data, error } = await supabase
    .from("cs323_submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSubmission(data) : null;
}

export async function saveSubmission(submission: Submission): Promise<void> {
  const { error } = await supabase.from("cs323_submissions").upsert({
    id: submission.id,
    assignment_id: submission.assignmentId,
    sunnet_id: submission.sunnetId,
    conversation_id: submission.conversationId,
    transcript: submission.transcript,
    summary: submission.summary,
    score: submission.score,
    duration: submission.duration,
    status: submission.status,
    created_at: submission.createdAt,
  });
  if (error) throw error;
}

// Look up submission by conversation_id (Tavus) — used by webhook
export async function getSubmissionByConversationId(
  conversationId: string
): Promise<Submission | null> {
  const { data, error } = await supabase
    .from("cs323_submissions")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSubmission(data) : null;
}
