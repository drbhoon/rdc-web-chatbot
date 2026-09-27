const buckets = new Map<string, {count: number; expires: number}>();
export function rateLimited(req: Request, scope: string, limit = 30): boolean {
  const now = Date.now();
  if (buckets.size > 10000) for (const [key, entry] of buckets) if (entry.expires <= now) buckets.delete(key);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${scope}:${ip}`; const entry = buckets.get(key);
  if (!entry || entry.expires <= now) {buckets.set(key, {count: 1, expires: now + 60000}); return false;}
  entry.count++; return entry.count > limit;
}
