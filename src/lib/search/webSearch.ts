/**
 * Web Search Service (Optional)
 * Default: OFF unless USE_WEB_SEARCH=true and provider is configured
 *
 * Supported providers: tavily | serpapi | stub
 * Curated-first behavior is enforced by constraining provider queries to
 * approved company sources.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  formattedContext: string;
  provider: string;
  usedSearch: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stub (No-op) Search
// ─────────────────────────────────────────────────────────────────────────────

function stubSearch(): WebSearchResponse {
  return {
    results: [],
    formattedContext: "",
    provider: "stub",
    usedSearch: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tavily Search
// ─────────────────────────────────────────────────────────────────────────────

async function tavilySearch(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: buildCuratedQuery(query),
      search_depth: "basic",
      max_results: 3,
      include_answer: true,
    }),
  });

  if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
  const data = await res.json();

  const results: WebSearchResult[] = (data.results || []).map(
    (r: { title: string; url: string; content: string }) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 300) || "",
    })
  );

  const formattedContext = results
    .map((r, i) => `[Web ${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`)
    .join("\n\n");

  return { results, formattedContext, provider: "tavily", usedSearch: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision: Should we use web search?
// ─────────────────────────────────────────────────────────────────────────────

export function shouldUseWebSearch(
  intent: string,
  retrievedChunkCount: number,
  topChunkScore: number,
  userMessage: string
): boolean {
  if (process.env.USE_WEB_SEARCH !== "true") return false;

  // Always use web search for freshness-required queries
  const freshnessKeywords = ["latest", "recent", "news", "current", "today", "2024", "2025", "2026"];
  if (freshnessKeywords.some((kw) => userMessage.toLowerCase().includes(kw))) return true;

  // Use web search if internal knowledge is insufficient (low score or no chunks)
  if (retrievedChunkCount === 0 || topChunkScore < 10) return true;

  return false;
}

function buildCuratedQuery(query: string): string {
  const domains = (process.env.CURATED_WEB_DOMAINS || "rdcconcrete.in,www.rdcconcrete.in")
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);

  if (domains.length === 0) return query;
  return `${query} (${domains.map((domain) => `site:${domain}`).join(" OR ")})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export async function performWebSearch(query: string): Promise<WebSearchResponse> {
  if (process.env.USE_WEB_SEARCH !== "true") return stubSearch();

  const provider = process.env.WEB_SEARCH_PROVIDER || "tavily";

  try {
    if (provider === "tavily") {
      return await tavilySearch(query);
    }
    // Add more providers here (serpapi, etc.)
    return stubSearch();
  } catch (err) {
    console.error("[WebSearch] Error:", err);
    return stubSearch();
  }
}
