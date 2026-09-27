/**
 * The URL prefix the app is served under: "" on Railway and locally,
 * "/chatbot" on hr.rdcc.ai. Next adds it to routes and <Link> by itself, but
 * NOT to fetch() calls or next/image sources — those go through withBase().
 * Baked in at build time from BASE_PATH (see next.config.ts).
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
