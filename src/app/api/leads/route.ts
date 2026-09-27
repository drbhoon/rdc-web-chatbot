/**
 * POST /api/leads
 * Save a lead captured from the chatbot
 *
 * GET /api/leads
 * Get all leads (admin only - simple auth for MVP)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";

const SALES_LEAD_EMAIL = process.env.SALES_LEAD_EMAIL || "sales@rdc.in";

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isMailConfigured(): boolean {
  const smtpPass = process.env.SMTP_PASS?.trim() || "";
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      smtpPass &&
      smtpPass !== "replace_with_app_password" &&
      process.env.SMTP_FROM
  );
}

async function sendLeadEmail(lead: {
  id: string;
  name?: string | null;
  company?: string | null;
  mobile?: string | null;
  email?: string | null;
  city?: string | null;
  projectType?: string | null;
  estimatedQty?: string | null;
  requirementTiming?: string | null;
  notes?: string | null;
  detectedIntent?: string | null;
  transcriptSummary?: string | null;
}) {
  if (!isMailConfigured()) {
    throw new Error("SMTP is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS?.replace(/\s+/g, ""),
    },
  });

  const rows = [
    ["Lead ID", lead.id],
    ["Name", lead.name],
    ["Company / Organisation", lead.company],
    ["Mobile", lead.mobile],
    ["Email", lead.email],
    ["City / Location", lead.city],
    ["Project Type", lead.projectType],
    ["Estimated Quantity", lead.estimatedQty],
    ["Requirement Timing", lead.requirementTiming],
    ["Detected Intent", lead.detectedIntent],
    ["Notes", lead.notes],
  ];

  const htmlRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(value) || "-"}</td>
        </tr>`
    )
    .join("");

  const textRows = rows.map(([label, value]) => `${label}: ${value || "-"}`).join("\n");

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: SALES_LEAD_EMAIL,
    replyTo: lead.email || undefined,
    subject: `New RDC Saathi Lead: ${lead.name || lead.mobile || lead.email || lead.id}`,
    text: [
      "A new customer lead was submitted from RDC Saathi.",
      "",
      textRows,
      "",
      "Recent chat transcript:",
      lead.transcriptSummary || "-",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.5;">
        <h2 style="margin:0 0 12px;color:#1b2a4a;">New RDC Saathi Lead</h2>
        <p>A customer submitted the sales contact form in RDC Saathi.</p>
        <table style="border-collapse:collapse;width:100%;max-width:720px;">${htmlRows}</table>
        <h3 style="margin:20px 0 8px;color:#1b2a4a;">Recent chat transcript</h3>
        <pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">${escapeHtml(
          lead.transcriptSummary || "-"
        )}</pre>
      </div>`,
  });
}

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    sessionId,
    name,
    company,
    mobile,
    email,
    city,
    projectType,
    estimatedQty,
    requirementTiming,
    notes,
    detectedIntent,
  } = body;

  if (!mobile && !email) {
    return NextResponse.json(
      { error: "At least mobile or email is required" },
      { status: 400 }
    );
  }

  // Build transcript summary from recent messages
  let transcriptSummary = "";
  if (sessionId) {
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 6,
    });
    transcriptSummary = messages
      .map((m) => `${m.role === "user" ? "User" : "Bot"}: ${m.content.slice(0, 100)}`)
      .join("\n");
  }

  const lead = await prisma.lead.create({
    data: {
      id: uuidv4(),
      sessionId: sessionId || null,
      name,
      company,
      mobile,
      email,
      city,
      projectType,
      estimatedQty,
      requirementTiming,
      notes,
      status: "new",
      transcriptSummary,
      detectedIntent,
    },
  });

  // Mark session as lead captured
  if (sessionId) {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { leadCaptured: true },
    }).catch(() => {}); // Silently fail if session doesn't exist

    // Log analytics event
    await prisma.analyticsEvent.create({
      data: {
        sessionId,
        eventType: "lead_captured",
        metadata: JSON.stringify({ leadId: lead.id, city, projectType }),
      },
    });
  }

  try {
    await sendLeadEmail({
      id: lead.id,
      name: lead.name,
      company: lead.company,
      mobile: lead.mobile,
      email: lead.email,
      city: lead.city,
      projectType: lead.projectType,
      estimatedQty: lead.estimatedQty,
      requirementTiming: lead.requirementTiming,
      notes: lead.notes,
      detectedIntent: lead.detectedIntent,
      transcriptSummary: lead.transcriptSummary,
    });
  } catch (error) {
    console.error("[Leads] Email delivery failed:", error);
    return NextResponse.json(
      {
        success: false,
        leadId: lead.id,
        error: "Lead was saved, but email delivery failed.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, leadId: lead.id, emailSent: true });
}

export async function GET(req: NextRequest) {
  // Simple admin auth check
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ leads });
}
