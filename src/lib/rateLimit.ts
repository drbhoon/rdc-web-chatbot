/**
 * Simple fixed-window rate limits, held in memory.
 *
 * Two kinds of key:
 *  - per IP address (`rateLimited`): a ceiling against a single machine
 *    hammering the service. It has to be generous, because many people share
 *    one address — an office behind one connection, or mobile users on Jio and
 *    Airtel, whose carriers put thousands of phones behind the same IP.
 *  - per chat (`rateLimitedKey` with the session id): the real guard against
 *    one conversation spamming the AI.
 *
 * The client IP is the first X-Forwarded-For entry. On Railway and behind the
 * platform nginx that is set by the proxy, not the browser (tested 2026-09-27:
 * a forged header did not change the key). Held in memory, so the counts reset
 * on a redeploy and are per instance — fine for one instance.
 */
const buckets = new Map<string, { count: number; expires: number }>();

export function rateLimitedKey(key: string, limit: number, windowMs = 60000): boolean {
  const now = Date.now();
  if (buckets.size > 10000) for (const [k, entry] of buckets) if (entry.expires <= now) buckets.delete(k);
  const entry = buckets.get(key);
  if (!entry || entry.expires <= now) {
    buckets.set(key, { count: 1, expires: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function rateLimited(req: Request, scope: string, limit = 30): boolean {
  return rateLimitedKey(`${scope}:${clientIp(req)}`, limit);
}
