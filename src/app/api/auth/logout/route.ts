/** GET /api/auth/logout — ends the TARA sign-in on this browser. */
import { NextResponse } from "next/server";
import { LOGIN_COOKIE, cookieOptions, publicBase } from "@/lib/auth/rdcLogin";

export async function GET(req: Request) {
  const res = NextResponse.redirect(`${publicBase(req)}/signin?signedout=1`);
  res.cookies.set(LOGIN_COOKIE, "", cookieOptions(0));
  return res;
}
