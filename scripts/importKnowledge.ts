/**
 * Loads a knowledge file written by scripts/exportKnowledge.ts.
 *
 *     npx tsx scripts/importKnowledge.ts <file.jsonl.gz> [--if-empty]
 *
 * --if-empty does nothing when the database already holds knowledge. That is
 * how the hr.rdcc.ai container seeds itself on its first start and leaves the
 * knowledge alone on every later one (including answers reviewers added).
 * A missing file with --if-empty is not an error: the bot simply starts empty.
 */
import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import { createGunzip } from "zlib";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(file: string, ifEmpty: boolean) {
  if (ifEmpty) {
    const existing = await prisma.knowledgeDocument.count();
    if (existing > 0) return console.log(`[knowledge] ${existing} documents already loaded; nothing to import.`);
    if (!existsSync(file)) return console.log(`[knowledge] no seed file at ${file}; starting with an empty knowledge base.`);
  }

  const lines = createInterface({input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity});
  let documents = 0, chunks = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.kind === "document") {
      const {kind: _kind, lastUpdated, ...doc} = row;
      void _kind;
      await prisma.knowledgeDocument.upsert({where: {id: doc.id}, create: {...doc, lastUpdated: new Date(lastUpdated)}, update: {...doc, lastUpdated: new Date(lastUpdated)}});
      documents++;
    } else if (row.kind === "chunk") {
      await prisma.knowledgeChunk.upsert({
        where: {id: row.id},
        create: {id: row.id, documentId: row.documentId, content: row.content, chunkIndex: row.chunkIndex, metadata: row.metadata},
        update: {content: row.content, chunkIndex: row.chunkIndex, metadata: row.metadata},
      });
      if (row.vector) await prisma.$executeRaw`UPDATE knowledge_chunks SET vector = ${row.vector}::vector WHERE id = ${row.id}`;
      chunks++;
    }
  }
  console.log(`[knowledge] imported ${documents} documents and ${chunks} chunks from ${file}`);
}

const args = process.argv.slice(2);
main(args.find((a) => !a.startsWith("--")) || "tara-knowledge.jsonl.gz", args.includes("--if-empty"))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
