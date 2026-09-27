import { prisma } from "@/lib/db";
import { loadEmployees } from "@/lib/employee/workbook";
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const knowledge = await prisma.knowledgeChunk.count();
    const employees = await loadEmployees().then(rows => rows.length).catch(() => 0);
    return Response.json({status: knowledge && employees ? "ready" : "initializing", knowledgeChunks: knowledge, employeeDirectory: employees > 0 ? "available" : "missing"});
  } catch {return Response.json({status: "initializing"}, {status: 503});}
}
