/**
 * The daily question-and-answer sheet, on demand.
 *   GET  ?day=YYYY-MM-DD           → the sheet for that India-time day (default yesterday)
 *   GET  ?info=1                   → who receives it, when, and the last day sent
 *   POST {day?: "YYYY-MM-DD"}      → e-mail that day's sheet to the reviewers now
 */
import { requireAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { exportReview } from "@/lib/knowledge/reviewWorkbook";
import { collectDay, mailConfigured, reviewRecipients, sendDailyReview } from "@/lib/review/dailyReview";
import { istDate, previousDay } from "@/lib/review/pairs";

function dayFrom(value: unknown): string {
  const day = typeof value === "string" && value ? value : previousDay(istDate(new Date()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Use a date like 2026-09-27.");
  return day;
}

export async function GET(req: Request) {
  if (!requireAdmin(req)) return Response.json({error: "Unauthorized"}, {status: 401});
  const url = new URL(req.url);
  if (url.searchParams.get("info")) {
    const sent = await prisma.appConfig.findUnique({where: {key: "daily_review_sent_for"}});
    return Response.json({
      recipients: reviewRecipients(), mailConfigured: mailConfigured(),
      sendHourIst: Number(process.env.DAILY_REVIEW_HOUR_IST || 8), lastSentOn: sent?.value || null,
    });
  }
  try {
    const day = dayFrom(url.searchParams.get("day"));
    const rows = await collectDay(day);
    return new Response(new Uint8Array(await exportReview(rows)), {headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="TARA-Online-questions-${day}.xlsx"`,
      "Cache-Control": "no-store",
    }});
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : "Could not build the sheet"}, {status: 400});
  }
}

export async function POST(req: Request) {
  if (!requireAdmin(req)) return Response.json({error: "Unauthorized"}, {status: 401});
  try {
    const body = await req.json().catch(() => ({}));
    return Response.json(await sendDailyReview(dayFrom(body.day)));
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : "Sending failed"}, {status: 400});
  }
}
