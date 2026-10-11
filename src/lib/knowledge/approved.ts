import type { Prisma } from "@prisma/client";
import { EMBEDDING_MODEL, vectorLiteral } from "@/lib/knowledge/embeddings";
import { APPROVED_CATEGORY } from "@/lib/knowledge/retrieval";

/** The text embedded for a reviewed answer, so a similar question finds it. */
export const approvedEmbeddingText = (question: string, answer: string) => `Question: ${question}\nAnswer: ${answer}`;

/**
 * Puts a reviewed answer into the knowledge base as an APPROVED ANSWER chunk.
 * Used by Admin > Knowledge upload and scripts/publishApproved.ts.
 */
export async function saveApprovedChunk(tx: Prisma.TransactionClient, questionId: string, question: string, answer: string, vector: number[]) {
  const docId = `review-${questionId}`; const chunkId = `${docId}-0`;
  const content = `Question: ${question}\nApproved answer: ${answer}`;
  await tx.knowledgeDocument.upsert({where: {id: docId}, create: {id: docId, title: question, category: APPROVED_CATEGORY, sourceType: "faq", sourceName: "Administrator reviewed answer", tags: '["reviewed"]'}, update: {isActive: true, lastUpdated: new Date()}});
  await tx.knowledgeChunk.upsert({where: {id: chunkId}, create: {id: chunkId, documentId: docId, chunkIndex: 0, content, metadata: JSON.stringify({embeddingModel: EMBEDDING_MODEL})}, update: {content}});
  await tx.$executeRaw`UPDATE knowledge_chunks SET vector = ${vectorLiteral(vector)}::vector WHERE id = ${chunkId}`;
}
