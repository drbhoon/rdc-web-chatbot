/**
 * POST /api/admin/login
 * Simple demo admin authentication
 */

import { NextRequest, NextResponse } from "next/server";
import { issueAdminToken, equalSecret } from "@/lib/admin/auth";
import { rateLimited } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  if (rateLimited(req, "admin-login", 10)) return NextResponse.json({error: "Please try again in one minute."}, {status: 429});
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const configuredEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_DEMO_EMAIL;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (typeof email !== "string" || typeof password !== "string" || !configuredEmail || !configuredPassword || !equalSecret(email.toLowerCase(), configuredEmail.toLowerCase()) || !equalSecret(password, configuredPassword)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const token = issueAdminToken();
  return NextResponse.json({
    success: true,
    token,
    admin: { email: configuredEmail, name: "RDC Administrator", role: "admin" },
  });
}
