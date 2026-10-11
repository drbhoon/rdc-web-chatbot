import { requireAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { exportReview, parseReview } from "@/lib/knowledge/reviewWorkbook";
import { embedTexts } from "@/lib/knowledge/embeddings";
import { approvedEmbeddingText, saveApprovedChunk } from "@/lib/knowledge/approved";
import { istDate } from "@/lib/review/pairs";

export async function GET(req: Request) {
  if (!requireAdmin(req)) return Response.json({error: "Unauthorized"}, {status: 401});
  const url = new URL(req.url);
  const rows = await prisma.unansweredQuestion.findMany({where: url.searchParams.get("all") === "true" ? {} : {status: "pending"}, orderBy: {lastAskedAt: "desc"}, take: 1000});
  if (url.searchParams.get("format") !== "xlsx") return Response.json({questions: rows});
  const sheetRows = rows.map(r => ({...r, askedOn: istDate(r.lastAskedAt)}));
  return new Response(new Uint8Array(await exportReview(sheetRows)), {headers: {"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="TARA-Online-questions.xlsx"', "Cache-Control": "no-store"}});
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
    for (let i = 0; i < changes.length; i += 32) vectors.push(...await embedTexts(changes.slice(i, i + 32).map(r => approvedEmbeddingText(existing.find(e => e.id === r.id)!.question, r.answer))));
    await prisma.$transaction(async tx => {
      for (let i = 0; i < changes.length; i++) {
        const row = changes[i]; const saved = existing.find(e => e.id === row.id)!;
        const changed = await tx.unansweredQuestion.updateMany({where: {id: row.id, version: row.version}, data: {answer: row.answer, status: "answered", answeredAt: new Date(), version: {increment: 1}}});
        if (changed.count !== 1) throw new Error("Concurrent update detected. Download a fresh workbook.");
        await saveApprovedChunk(tx, row.id, saved.question, row.answer, vectors[i]);
      }
    }, {timeout: 60000});
    return Response.json({published: changes.length, skipped: rows.length - changes.length});
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : "Import failed"}, {status: 400});
  }
}
