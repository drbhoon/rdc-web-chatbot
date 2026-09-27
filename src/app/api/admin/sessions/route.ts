/**
 * GET /api/admin/sessions
 * Returns paginated chat sessions with messages
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

import { requireAdmin } from "@/lib/admin/auth";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("id");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 20;
  const skip = (page - 1) * limit;

  if (sessionId) {
    // Get single session with all messages
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        leads: true,
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session });
  }

  // Get paginated sessions
  const [sessions, total] = await Promise.all([
    prisma.chatSession.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        messages: {
          take: 2,
          orderBy: { createdAt: "asc" },
          where: { role: "user" },
        },
        leads: { take: 1 },
      },
    }),
    prisma.chatSession.count(),
  ]);

  return NextResponse.json({
    sessions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
