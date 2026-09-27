/**
 * Replace the bot's plant knowledge with knowledge/public/commercial-plants.jsonl.
 *
 *   npx tsx scripts/replacePlantKnowledge.ts
 *
 * (Build the JSONL first with scripts/buildPlantKnowledge.py.)
 *
 * 1. Switches OFF the older plant documents. They mixed commercial and
 *    dedicated plants, carried individual mobile numbers and gave three
 *    different plant counts. They are deactivated rather than deleted, so the
 *    record of what the bot used to know survives; retrieval ignores inactive
 *    documents.
 * 2. Loads the commercial list: one chunk per plant and one overview, each
 *    embedded afresh. Chunks from an earlier load that are no longer in the
 *    file (a plant closed or renamed) are removed.
 *
 * Safe to run again: nothing is duplicated.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { embedTexts, vectorLiteral, EMBEDDING_MODEL } from "../src/lib/knowledge/embeddings";

const prisma = new PrismaClient();
const FILE = "knowledge/public/commercial-plants.jsonl";
const SUPERSEDED = ["Address of all plants (1)", "Ongoing Captive Plants LIst", "commercial plants list"];

interface SourceChunk { id: string; text: string; metadata: { sourceName: string; tags?: string[] } }

const documentId = (sourceName: string) =>
  `source-${createHash("sha256").update(sourceName).digest("hex").slice(0, 24)}`;

async function main() {
  const chunks: SourceChunk[] = readFileSync(FILE, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  if (!chunks.length) throw new Error(`${FILE} is empty — run scripts/buildPlantKnowledge.py first.`);
  const sourceName = chunks[0].metadata.sourceName;
  if (chunks.some((c) => c.metadata.sourceName !== sourceName)) throw new Error("Every chunk must come from one source.");

  const off = await prisma.knowledgeDocument.updateMany({
    where: { OR: [{ sourceName: { in: SUPERSEDED } }, { title: { in: SUPERSEDED } }], isActive: true },
    data: { isActive: false, lastUpdated: new Date() },
  });
  console.log(`Switched off ${off.count} superseded plant document(s): ${SUPERSEDED.join(", ")}`);

  const docId = documentId(sourceName);
  await prisma.knowledgeDocument.upsert({
    where: { id: docId },
    create: {
      id: docId, title: sourceName, category: "plants", sourceType: "company", sourceName,
      tags: JSON.stringify(chunks[0].metadata.tags || []),
    },
    update: { isActive: true, lastUpdated: new Date(), tags: JSON.stringify(chunks[0].metadata.tags || []) },
  });

  const keep = chunks.map((c) => c.id);
  const removed = await prisma.knowledgeChunk.deleteMany({ where: { documentId: docId, id: { notIn: keep } } });
  if (removed.count) console.log(`Removed ${removed.count} chunk(s) no longer in the list`);

  for (let offset = 0; offset < chunks.length; offset += 24) {
    const batch = chunks.slice(offset, offset + 24);
    const vectors = await embedTexts(batch.map((c) => `${sourceName}\n${c.text}`));
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < batch.length; i++) {
        const c = batch[i];
        await tx.knowledgeChunk.upsert({
          where: { id: c.id },
          create: { id: c.id, documentId: docId, content: c.text, chunkIndex: offset + i,
                    metadata: JSON.stringify({ ...c.metadata, embeddingModel: EMBEDDING_MODEL }) },
          update: { content: c.text, chunkIndex: offset + i },
        });
        await tx.$executeRaw`UPDATE knowledge_chunks SET vector = ${vectorLiteral(vectors[i])}::vector WHERE id = ${c.id}`;
      }
    }, { timeout: 60000 });
    console.log(`Loaded ${Math.min(offset + batch.length, chunks.length)}/${chunks.length} plant chunks`);
  }
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
