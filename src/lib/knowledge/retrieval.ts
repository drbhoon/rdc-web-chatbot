import { prisma } from "@/lib/db";
import { embedTexts, vectorLiteral } from "./embeddings";
export interface RetrievedChunk {
  id: string; documentId: string; title: string; category: string; content: string;
  score: number; sourceType: string; sourceName?: string; sourcePath?: string;
  page?: number; similarityScore?: number; retrievalMode?: "vector" | "keyword";
}
export async function retrieveRelevantChunks(query: string, options: {topK?: number; minScore?: number; categoryFilter?: string} = {}): Promise<RetrievedChunk[]> {
  const [embedding] = await embedTexts([query]);
  const category = options.categoryFilter || null;
  const limit = Math.min(options.topK || 8, 15);
  const rows = await prisma.$queryRaw<Array<Omit<RetrievedChunk, "score"> & {similarity: number}>>`
    SELECT c.id, c."documentId", c.content, d.title, d.category, d."sourceType", d."sourceName",
      1 - (c.vector <=> ${vectorLiteral(embedding)}::vector) AS similarity
    FROM knowledge_chunks c JOIN knowledge_documents d ON c."documentId" = d.id
    WHERE d."isActive" = true AND d.visibility = 'public' AND c.vector IS NOT NULL
      AND (${category}::text IS NULL OR d.category = ${category})
    ORDER BY c.vector <=> ${vectorLiteral(embedding)}::vector LIMIT ${limit}`;
  const chunks = rows.filter(r => r.similarity >= 0.25).map(r => ({...r, score: Math.round(r.similarity * 100), similarityScore: r.similarity, retrievalMode: "vector" as const}));
  return approvedFirst(chunks);
}
export const APPROVED_CATEGORY = "approved_answers";
/** An answer RDC reviewed for a question close to this one goes ahead of any document. */
export function approvedFirst(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const close = (c: RetrievedChunk) => c.category === APPROVED_CATEGORY && (c.similarityScore ?? 0) >= 0.5;
  return [...chunks.filter(close), ...chunks.filter(c => !close(c))];
}
export async function getChunksByCategory(category: string, limit = 5): Promise<RetrievedChunk[]> {
  const rows = await prisma.knowledgeChunk.findMany({ where: {document: {category, isActive: true, visibility: "public"}}, include: {document: true}, take: limit });
  return rows.map(c => ({id: c.id, documentId: c.documentId, content: c.content, title: c.document.title, category, sourceType: c.document.sourceType, score: 50}));
}
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  return chunks.map((c, i) => `[Source ${i + 1}: ${c.title}]\n${c.content}`).join("\n\n");
}
