/**
 * Writes the active public knowledge (documents, chunks and their embeddings)
 * to one gzipped JSON-lines file, for loading into another deployment with
 * scripts/importKnowledge.ts. Chat history, reviews and employee data are NOT
 * included.
 *
 *     npx tsx scripts/exportKnowledge.ts /tmp/tara-knowledge.jsonl.gz
 */
import { createWriteStream } from "fs";
import { createGzip } from "zlib";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(out: string) {
  const documents = await prisma.knowledgeDocument.findMany({where: {isActive: true, visibility: "public"}, orderBy: {id: "asc"}});
  const gzip = createGzip();
  const done = new Promise<void>((resolve, reject) => gzip.pipe(createWriteStream(out)).on("finish", () => resolve()).on("error", reject));
  const write = (line: object) => gzip.write(JSON.stringify(line) + "\n");

  write({kind: "meta", exportedAt: new Date().toISOString(), documents: documents.length});
  let chunks = 0;
  for (const d of documents) {
    write({kind: "document", ...d});
    const rows = await prisma.$queryRaw<Array<{id: string; content: string; chunkIndex: number; metadata: string | null; vector: string | null}>>`
      SELECT id, content, "chunkIndex", metadata, vector::text AS vector FROM knowledge_chunks WHERE "documentId" = ${d.id} ORDER BY "chunkIndex"`;
    for (const c of rows) write({kind: "chunk", documentId: d.id, ...c});
    chunks += rows.length;
  }
  gzip.end();
  await done;
  console.log(`Exported ${documents.length} documents and ${chunks} chunks to ${out}`);
}

main(process.argv[2] || "tara-knowledge.jsonl.gz")
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
