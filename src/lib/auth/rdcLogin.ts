/**
 * Sign-in with Google, limited to company addresses, for deployments where
 * TARA is shared with employees by link (hr.rdcc.ai/chatbot). Anyone with an
 * @rdc.in Google account gets in; nobody else does. Off unless
 * REQUIRE_RDC_LOGIN=true, so Railway and local stay open.
 *
 * The session is a signed cookie (HMAC, no database): the address, the name
 * and an expiry. It also tells the chat who asked each question, and counts
 * as the @rdc.in verification for employee lookups.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { BASE_PATH } from "@/lib/basePath";

export const LOGIN_COOKIE = "tara_session";
export const STATE_COOKIE = "tara_oauth";
const SESSION_DAYS = 7;

export interface RdcLogin { email: string; name: string; exp: number }

export function loginRequired(): boolean {
  return process.env.REQUIRE_RDC_LOGIN === "true";
}

export function allowedDomain(): string {
  return (process.env.LOGIN_EMAIL_DOMAIN || "rdc.in").toLowerCase();
}

export function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${allowedDomain()}`);
}

function secret(): string {
  const value = process.env.LOGIN_SESSION_SECRET || process.env.ADMIN_JWT_SECRET || "";
  if (value.length < 32) throw new Error("Sign-in secret is not configured (ADMIN_JWT_SECRET, 32+ characters)");
  return value;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`login.${payload}`).digest("base64url");

export function issueLoginToken(email: string, name: string): string {
  const payload = Buffer.from(JSON.stringify({email, name, exp: Date.now() + SESSION_DAYS * 86_400_000})).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readLoginToken(token: string | undefined | null): RdcLogin | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const expected = sign(payload);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const login = JSON.parse(Buffer.from(payload, "base64url").toString()) as RdcLogin;
    return login.exp > Date.now() && typeof login.email === "string" && isAllowedEmail(login.email) ? login : null;
  } catch {
    return null;
  }
}

/** The signed-in visitor of a request, from the cookie, or null. */
export function loginFromRequest(req: Request): RdcLogin | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${LOGIN_COOKIE}=([^;]+)`));
  return readLoginToken(match ? decodeURIComponent(match[1]) : null);
}

/** Where the app is reached from outside, e.g. https://hr.rdcc.ai/chatbot. */
export function publicBase(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}${BASE_PATH}`;
}

/** Only a path inside this app, never another site: "/?open=1" yes, "//evil" no. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/?open=1";
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: BASE_PATH || "/",
    maxAge: maxAgeSeconds,
  };
}

export const SESSION_MAX_AGE = SESSION_DAYS * 86_400;

export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    // A hint only (Google shows company accounts first); the address is
    // checked again after sign-in.
    hd: allowedDomain(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Exchanges the code for the verified Google address and name, or null. */
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{email: string; name: string} | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID || "", client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri, grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const { id_token } = (await res.json()) as {id_token?: string};
  if (!id_token) return null;
  const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
  if (!info.ok) return null;
  const claims = (await info.json()) as {aud?: string; email?: string; email_verified?: string; name?: string};
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !claims.email || claims.email_verified !== "true") return null;
  return {email: claims.email.toLowerCase(), name: claims.name || claims.email};
}
