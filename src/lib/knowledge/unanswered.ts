import { createHash } from "crypto";
import { prisma } from "@/lib/db";

/** One key per question, ignoring case, spacing and Unicode form: "same question" everywhere. */
export function questionFingerprint(question: string): string {
  return createHash("sha256").update(question.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");
}

export async function recordUnanswered(question: string, language: string, reason: string) {
  const fingerprint = questionFingerprint(question);
  await prisma.unansweredQuestion.upsert({where: {fingerprint}, create: {fingerprint, question, language, reason}, update: {occurrences: {increment: 1}, lastAskedAt: new Date(), reason}});
}

/** An answer RDC has refined for exactly this question, if there is one. */
export async function approvedAnswerFor(question: string): Promise<{question: string; answer: string; language: string} | null> {
  const row = await prisma.unansweredQuestion.findUnique({where: {fingerprint: questionFingerprint(question)}});
  return row?.status === "answered" && row.answer ? {question: row.question, answer: row.answer, language: row.language} : null;
}
