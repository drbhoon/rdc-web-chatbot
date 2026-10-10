/** GET /api/auth/google/callback — Google's answer: an @rdc.in address gets a session, anything else is turned away. */
import { NextResponse } from "next/server";
import {
  LOGIN_COOKIE, SESSION_MAX_AGE, STATE_COOKIE, cookieOptions, exchangeGoogleCode, isAllowedEmail, issueLoginToken,
  publicBase, safeNext,
} from "@/lib/auth/rdcLogin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = publicBase(req);
  const cookie = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${STATE_COOKIE}=([^;]+)`))?.[1];
  let saved: {state?: string; next?: string} = {};
  try { saved = JSON.parse(decodeURIComponent(cookie || "")); } catch { /* no sign-in in progress */ }

  const signin = (error: string) => {
    const res = NextResponse.redirect(`${base}/signin?error=${error}&next=${encodeURIComponent(safeNext(saved.next))}`);
    res.cookies.set(STATE_COOKIE, "", cookieOptions(0));
    return res;
  };

  const code = url.searchParams.get("code");
  if (!code || !saved.state || url.searchParams.get("state") !== saved.state) return signin("failed");
  const profile = await exchangeGoogleCode(code, `${base}/api/auth/google/callback`).catch(() => null);
  if (!profile) return signin("failed");
  if (!isAllowedEmail(profile.email)) return signin("domain");

  const res = NextResponse.redirect(`${base}${safeNext(saved.next)}`);
  res.cookies.set(STATE_COOKIE, "", cookieOptions(0));
  res.cookies.set(LOGIN_COOKIE, issueLoginToken(profile.email, profile.name), cookieOptions(SESSION_MAX_AGE));
  return res;
}
