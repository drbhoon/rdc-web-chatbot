import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { embedTexts, vectorLiteral, EMBEDDING_MODEL } from "../src/lib/knowledge/embeddings";
const prisma = new PrismaClient();
interface SourceChunk {id: string; text: string; metadata: {sourceName: string; tags?: string[]; page?: number}}
async function main() {
  const filename = process.argv[2] || "knowledge/generated/public-knowledge-chunks.jsonl";
  const chunks: SourceChunk[] = readFileSync(filename, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  if (chunks.some(c => /employee|employees|payroll/i.test(c.metadata.sourceName))) throw new Error("Employee sources must remain separate.");
  let imported = 0;
  for (let offset = 0; offset < chunks.length; offset += 24) {
    const batch = chunks.slice(offset, offset + 24);
    const vectors = await embedTexts(batch.map(c => `${c.metadata.sourceName}\n${c.text}`));
    await prisma.$transaction(async tx => {
      for (let i = 0; i < batch.length; i++) {
        const c = batch[i]; const docId = `source-${createHash("sha256").update(c.metadata.sourceName).digest("hex").slice(0, 24)}`;
        await tx.knowledgeDocument.upsert({where: {id: docId}, create: {id: docId, title: c.metadata.sourceName, category: c.metadata.tags?.[0] || "company", sourceType: "company", sourceName: c.metadata.sourceName, tags: JSON.stringify(c.metadata.tags || [])}, update: {lastUpdated: new Date()}});
        await tx.knowledgeChunk.upsert({where: {id: c.id}, create: {id: c.id, documentId: docId, content: c.text, chunkIndex: offset + i, metadata: JSON.stringify({page: c.metadata.page, embeddingModel: EMBEDDING_MODEL})}, update: {content: c.text}});
        await tx.$executeRaw`UPDATE knowledge_chunks SET vector = ${vectorLiteral(vectors[i])}::vector WHERE id = ${c.id}`;
      }
    }, {timeout: 60000});
    imported += batch.length; console.log(`Imported ${imported}/${chunks.length} knowledge chunks`);
  }
}
main().catch(error => {console.error(error.message); process.exitCode = 1;}).finally(() => prisma.$disconnect());
