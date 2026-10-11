/**
 * Publishes reviewed answers given as JSON, without the review workbook — for a
 * database that never saw the questions (the Railway test bed, for one).
 *
 *     npx tsx scripts/publishApproved.ts <answers.json>
 *
 * The file is [{question, language, answer}]. Each question is recorded (or
 * found by its fingerprint) and its answer published exactly as Admin >
 * Knowledge upload publishes one; running it again changes nothing.
 */
import { readFileSync } from "fs";
import { prisma } from "@/lib/db";
import { embedTexts } from "@/lib/knowledge/embeddings";
import { approvedEmbeddingText, saveApprovedChunk } from "@/lib/knowledge/approved";
import { questionFingerprint } from "@/lib/knowledge/unanswered";

interface Approved { question: string; language: string; answer: string }

async function main(file: string) {
  const items: Approved[] = JSON.parse(readFileSync(file, "utf8"));
  if (!items.every((i) => i.question?.trim() && i.answer?.trim() && i.language)) throw new Error("Each entry needs question, language and answer.");
  const vectors = await embedTexts(items.map((i) => approvedEmbeddingText(i.question, i.answer)));
  let published = 0;
  await prisma.$transaction(async (tx) => {
    for (const [n, item] of items.entries()) {
      const fingerprint = questionFingerprint(item.question);
      const saved = await tx.unansweredQuestion.upsert({
        where: {fingerprint},
        create: {fingerprint, question: item.question, language: item.language, reason: "reviewed", source: "daily"},
        update: {},
      });
      if (saved.status === "answered" && saved.answer === item.answer) continue;
      await tx.unansweredQuestion.update({where: {id: saved.id}, data: {answer: item.answer, status: "answered", answeredAt: new Date(), version: {increment: 1}}});
      await saveApprovedChunk(tx, saved.id, saved.question, item.answer, vectors[n]);
      published++;
    }
  }, {timeout: 120000});
  console.log(`[approved] ${published} published, ${items.length - published} already up to date.`);
}

main(process.argv[2]).then(() => prisma.$disconnect()).catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
