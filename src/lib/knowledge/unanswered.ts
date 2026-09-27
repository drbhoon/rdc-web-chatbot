import { createHash } from "crypto";
import { prisma } from "@/lib/db";
export async function recordUnanswered(question: string, language: string, reason: string) {
  const fingerprint = createHash("sha256").update(question.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");
  await prisma.unansweredQuestion.upsert({where: {fingerprint}, create: {fingerprint, question, language, reason}, update: {occurrences: {increment: 1}, lastAskedAt: new Date(), reason}});
}
