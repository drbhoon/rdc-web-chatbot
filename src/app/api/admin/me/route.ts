/**
 * GET /api/admin/me — on hr.rdcc.ai, nginx has already checked the portal
 * sign-in and passes the address as X-Auth-Email; nginx clears that header on
 * every other request, so it cannot be forged from outside. With REQUIRE_SSO
 * on, that is the admin sign-in: this hands the page a session token and the
 * password screen is skipped. Anywhere else (Railway, local) the header is
 * ignored and the password login stays.
 */
import { issueAdminToken } from "@/lib/admin/auth";

export async function GET(req: Request) {
  const email = req.headers.get("x-auth-email")?.trim();
  if (process.env.REQUIRE_SSO !== "true" || !email) return Response.json({sso: false}, {status: 401});
  return Response.json({sso: true, email, token: issueAdminToken()});
}
