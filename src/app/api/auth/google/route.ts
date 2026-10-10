/** GET /api/auth/google?next=/… — sends the visitor to Google to sign in with their @rdc.in account. */
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { STATE_COOKIE, cookieOptions, googleAuthUrl, publicBase, safeNext } from "@/lib/auth/rdcLogin";

export async function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const state = randomBytes(18).toString("base64url");
  const res = NextResponse.redirect(googleAuthUrl(`${publicBase(req)}/api/auth/google/callback`, state));
  // The state proves the answer comes back to the browser that asked; next is
  // where to land afterwards. Ten minutes is ample for a sign-in.
  res.cookies.set(STATE_COOKIE, JSON.stringify({state, next}), cookieOptions(600));
  return res;
}
