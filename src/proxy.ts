/**
 * Where REQUIRE_RDC_LOGIN is on (hr.rdcc.ai), every page and API call needs an
 * @rdc.in Google sign-in: pages go to /signin, API calls get 401. The chat and
 * voice routes check the cookie again themselves (lib/auth/rdcLogin), so this
 * is the front door, not the only lock.
 *
 * Left out: the sign-in flow itself, the admin console (behind the HR portal
 * sign-in at nginx), the health check and static files.
 */
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_COOKIE, loginRequired, readLoginToken } from "@/lib/auth/rdcLogin";

export function proxy(req: NextRequest) {
  if (!loginRequired() || readLoginToken(req.cookies.get(LOGIN_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({error: "Please sign in with your company Google account."}, {status: 401});
  }
  const signin = req.nextUrl.clone();
  signin.pathname = "/signin";
  signin.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(signin);
}

export const config = {
  // "/" on its own: under a basePath the catch-all compiles to "/chatbot/…",
  // which does not match the bare "/chatbot" — the page people actually open.
  matcher: ["/", "/((?!_next/static|_next/image|favicon\\.ico|signin|api/auth|api/admin|api/health|admin|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
