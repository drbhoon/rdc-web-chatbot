import { requireAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { exportReview, parseReview } from "@/lib/knowledge/reviewWorkbook";
import { embedTexts, vectorLiteral, EMBEDDING_MODEL } from "@/lib/knowledge/embeddings";

export async function GET(req: Request) {
  if (!requireAdmin(req)) return Response.json({error: "Unauthorized"}, {status: 401});
  const url = new URL(req.url);
  const rows = await prisma.unansweredQuestion.findMany({where: url.searchParams.get("all") === "true" ? {} : {status: "pending"}, orderBy: {lastAskedAt: "desc"}, take: 1000});
  if (url.searchParams.get("format") !== "xlsx") return Response.json({questions: rows});
  return new Response(new Uint8Array(await exportReview(rows)), {headers: {"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="RDC-Unanswered-Questions.xlsx"', "Cache-Control": "no-store"}});
}

export async function POST(req: Request) {
  if (!requireAdmin(req)) return Response.json({error: "Unauthorized"}, {status: 401});
  try {
    const form = await req.formData(); const file = form.get("file");
    if (!(file instanceof File) || file.size > 5_000_000 || !file.name.endsWith(".xlsx")) return Response.json({error: "Upload an .xlsx file smaller than 5 MB."}, {status: 400});
    const rows = await parseReview(await file.arrayBuffer());
    const existing = await prisma.unansweredQuestion.findMany({where: {id: {in: rows.map(r => r.id)}}});
    const changes = rows.filter(row => {
      const saved = existing.find(e => e.id === row.id);
      if (!saved) throw new Error("Unknown question ID. Download a fresh workbook.");
      if (saved.status === "answered" && saved.answer === row.answer) return false;
      if (saved.version !== row.version) throw new Error("An answer has changed since export. Download a fresh workbook.");
      return true;
    });
    if (!changes.length) return Response.json({published: 0, skipped: rows.length});
    const vectors: number[][] = [];
    for (let i = 0; i < changes.length; i += 32) vectors.push(...await embedTexts(changes.slice(i, i + 32).map(r => `Question: ${existing.find(e => e.id === r.id)!.question}\nAnswer: ${r.answer}`)));
    await prisma.$transaction(async tx => {
      for (let i = 0; i < changes.length; i++) {
        const row = changes[i]; const saved = existing.find(e => e.id === row.id)!;
        const changed = await tx.unansweredQuestion.updateMany({where: {id: row.id, version: row.version}, data: {answer: row.answer, status: "answered", answeredAt: new Date(), version: {increment: 1}}});
        if (changed.count !== 1) throw new Error("Concurrent update detected. Download a fresh workbook.");
        const docId = `review-${row.id}`; const chunkId = `${docId}-0`;
        const content = `Question: ${saved.question}\nApproved answer: ${row.answer}`;
        await tx.knowledgeDocument.upsert({where: {id: docId}, create: {id: docId, title: saved.question, category: "approved_answers", sourceType: "faq", sourceName: "Administrator reviewed answer", tags: '["reviewed"]'}, update: {isActive: true, lastUpdated: new Date()}});
        await tx.knowledgeChunk.upsert({where: {id: chunkId}, create: {id: chunkId, documentId: docId, chunkIndex: 0, content, metadata: JSON.stringify({embeddingModel: EMBEDDING_MODEL})}, update: {content}});
        await tx.$executeRaw`UPDATE knowledge_chunks SET vector = ${vectorLiteral(vectors[i])}::vector WHERE id = ${chunkId}`;
      }
    }, {timeout: 60000});
    return Response.json({published: changes.length, skipped: rows.length - changes.length});
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : "Import failed"}, {status: 400});
  }
}
