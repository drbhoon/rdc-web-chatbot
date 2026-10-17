/**
 * Publishes reviewed answers kept as JSON in knowledge/approved/, without the
 * review workbook.
 *
 *     npx tsx scripts/publishApproved.ts <file.json | folder> [--if-unanswered]
 *
 * Each file is [{question, language, answer}]. Each question is recorded (or
 * found by its fingerprint) and its answer published exactly as Admin >
 * Knowledge upload publishes one; running it again changes nothing.
 *
 * --if-unanswered leaves alone any question that already has a published
 * answer. hr.rdcc.ai runs it that way on every start, so the answers arrive
 * with a deploy but never overwrite one a reviewer uploaded since. The one
 * exception: an entry may list in "replaces" the earlier texts it supersedes
 * (ones shipped here before); a published answer that is exactly one of those
 * is updated, since no reviewer has changed it.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { embedTexts } from "@/lib/knowledge/embeddings";
import { approvedEmbeddingText, needsPublishing, saveApprovedChunk, type Approved } from "@/lib/knowledge/approved";
import { questionFingerprint } from "@/lib/knowledge/unanswered";

function readAnswers(target: string): Approved[] {
  const files = statSync(target).isDirectory()
    ? readdirSync(target).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(target, f))
    : [target];
  const items: Approved[] = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")));
  if (!items.every((i) => i.question?.trim() && i.answer?.trim() && i.language)) throw new Error("Each entry needs question, language and answer.");
  return items;
}

async function main(target: string, ifUnanswered: boolean) {
  const items = readAnswers(target);
  const saved = await prisma.unansweredQuestion.findMany({where: {fingerprint: {in: items.map((i) => questionFingerprint(i.question))}}});
  const todo = items.filter((item) => needsPublishing(item, saved.find((s) => s.fingerprint === questionFingerprint(item.question)), ifUnanswered));
  if (!todo.length) return console.log(`[approved] all ${items.length} reviewed answers already published.`);

  const vectors = await embedTexts(todo.map((i) => approvedEmbeddingText(i.question, i.answer)));
  await prisma.$transaction(async (tx) => {
    for (const [n, item] of todo.entries()) {
      const fingerprint = questionFingerprint(item.question);
      const row = await tx.unansweredQuestion.upsert({
        where: {fingerprint},
        create: {fingerprint, question: item.question, language: item.language, reason: "reviewed", source: "daily"},
        update: {},
      });
      await tx.unansweredQuestion.update({where: {id: row.id}, data: {answer: item.answer, status: "answered", answeredAt: new Date(), version: {increment: 1}}});
      await saveApprovedChunk(tx, row.id, row.question, item.answer, vectors[n]);
    }
  }, {timeout: 120000});
  console.log(`[approved] ${todo.length} published, ${items.length - todo.length} left as they were.`);
}

main(process.argv[2], process.argv.includes("--if-unanswered")).then(() => prisma.$disconnect()).catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
