import { createHmac, timingSafeEqual } from "crypto";

export function issueAdminToken(): string {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("Admin signing secret is not configured");
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function requireAdmin(req: Request): boolean {
  const token = req.headers.get("x-admin-token") || "";
  const [payload, signature, extra] = token.split(".");
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!payload || !signature || extra || !secret || secret.length < 32) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); } catch { return false; }
}

export function equalSecret(a: string, b: string): boolean {
  const ah = createHmac("sha256", "credential-compare").update(a).digest();
  const bh = createHmac("sha256", "credential-compare").update(b).digest();
  return timingSafeEqual(ah, bh);
}
