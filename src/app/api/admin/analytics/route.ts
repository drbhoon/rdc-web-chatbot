/**
 * GET /api/admin/analytics
 * Returns dashboard analytics summary
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

import { requireAdmin } from "@/lib/admin/auth";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    totalSessions,
    totalMessages,
    totalLeads,
    recentSessions,
    languageCounts,
    intentCounts,
    fallbackEvents,
    recentLeads,
    recentMessages,
  ] = await Promise.all([
    prisma.chatSession.count(),
    prisma.chatMessage.count({ where: { role: "user" } }),
    prisma.lead.count(),
    prisma.chatSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        messages: { take: 1, orderBy: { createdAt: "asc" } },
        leads: { take: 1 },
      },
    }),
    // Language distribution from messages
    prisma.chatMessage.groupBy({
      by: ["language"],
      where: { role: "user" },
      _count: { language: true },
      orderBy: { _count: { language: "desc" } },
      take: 10,
    }),
    // Intent distribution
    prisma.chatMessage.groupBy({
      by: ["intent"],
      where: { role: "user", intent: { not: null } },
      _count: { intent: true },
      orderBy: { _count: { intent: "desc" } },
      take: 10,
    }),
    // Fallback rate (mock mode messages)
    prisma.chatMessage.count({ where: { role: "assistant", usedMockMode: true } }),
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    // Recent messages for review
    prisma.chatMessage.findMany({
      where: { role: "user", confidence: { lt: 0.3 } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const totalAssistantMessages = await prisma.chatMessage.count({
    where: { role: "assistant" },
  });
  const fallbackRate =
    totalAssistantMessages > 0
      ? ((fallbackEvents / totalAssistantMessages) * 100).toFixed(1)
      : "0";

  return NextResponse.json({
    summary: {
      totalSessions,
      totalMessages,
      totalLeads,
      fallbackRate: `${fallbackRate}%`,
    },
    languageDistribution: languageCounts.map((l) => ({
      language: l.language,
      count: l._count.language,
    })),
    intentDistribution: intentCounts.map((i) => ({
      intent: i.intent,
      count: i._count.intent,
    })),
    recentSessions: recentSessions.map((s) => ({
      id: s.id,
      language: s.language,
      createdAt: s.createdAt,
      leadCaptured: s.leadCaptured,
      messageCount: s.messages.length,
    })),
    recentLeads,
    lowConfidenceMessages: recentMessages.map((m) => ({
      id: m.id,
      content: m.content,
      intent: m.intent,
      confidence: m.confidence,
      createdAt: m.createdAt,
    })),
  });
}
