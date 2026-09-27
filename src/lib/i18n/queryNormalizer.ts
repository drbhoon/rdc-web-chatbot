const OPENAI_PLACEHOLDER_VALUES = new Set([
  "",
  "your_openai_key_here",
  "sk-your-openai-key",
  "your-key-here",
]);

const HINGLISH_TERMS: Array<[RegExp, string]> = [
  [/\bkya\b|\bkaun\b|\bkaise\b|\bbatao\b|\bbataye\b|\bbataen\b|\bbataein\b|\bbataiye\b|\bsamjhao\b/gi, ""],
  [/\bke baare mein\b|\bke bare mein\b|\bke baare\b|\bke bare\b|\bke liye\b|\bka\b|\bki\b|\bko\b|\bmein\b|\bme\b/gi, ""],
  [/\bdigital systems?\b|\bdigital initiatives?\b/gi, "digital initiatives technology systems"],
  [/\bvision\s*2030\b/gi, "Vision 2030 strategy growth plan"],
  [/\brdctrak\b/gi, "RDCTRAK outbound logistics transit mixer tracking"],
  [/\bcustomer connect\b/gi, "Customer Connect online order management"],
  [/\bqms\b/gi, "QMS quality management QA QC"],
  [/\border\b|\bbooking\b|\bkharid\b|\bkhareed\b/gi, "ordering process concrete order"],
  [/\bplant\b|\bplants\b|\blocation\b|\bshehar\b|\bcity\b/gi, "plant locations city presence"],
  [/\brate\b|\bprice\b|\bcost\b|\bkitna\b|\bquotation\b|\bquote\b/gi, "pricing quotation cost"],
];

export interface NormalizedQuery {
  originalMessage: string;
  retrievalQuery: string;
  usedOpenAI: boolean;
  provider: "openai" | "local" | "none";
}

function hasRealOpenAIKey(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim() || "";
  return !OPENAI_PLACEHOLDER_VALUES.has(key);
}

function shouldNormalize(language: string, message: string): boolean {
  if (language !== "en") return true;
  return /\b(kya|kaise|batao|bataye|samjhao|hai|hain|chahiye|karna|kaun|kitna)\b/i.test(message);
}

function localNormalize(message: string): string {
  let query = message;
  for (const [pattern, replacement] of HINGLISH_TERMS) {
    query = query.replace(pattern, replacement);
  }

  return query
    .replace(/[?।,.;:!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || message;
}

async function openAINormalize(message: string, language: string): Promise<string | null> {
  if (!hasRealOpenAIKey()) return null;

  const model =
    process.env.OPENAI_LANGUAGE_MODEL ||
    process.env.OPENAI_TEXT_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Convert the visitor's Indian-language or Hinglish question into one concise English search query for retrieving RDC Concrete company knowledge. Keep brand/product names exactly: RDC, RMC, RDCTRAK, QMS, Customer Connect. Return only the query.",
          },
          {
            role: "user",
            content: `Language: ${language}\nQuestion: ${message}`,
          },
        ],
        temperature: 0,
        max_tokens: 80,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.warn("[QueryNormalizer] OpenAI normalization failed:", error);
    return null;
  }
}

export async function normalizeQueryForRetrieval(
  message: string,
  language: string
): Promise<NormalizedQuery> {
  if (!shouldNormalize(language, message)) {
    return {
      originalMessage: message,
      retrievalQuery: message,
      usedOpenAI: false,
      provider: "none",
    };
  }

  const openAIQuery = await openAINormalize(message, language);
  if (openAIQuery) {
    return {
      originalMessage: message,
      retrievalQuery: openAIQuery,
      usedOpenAI: true,
      provider: "openai",
    };
  }

  return {
    originalMessage: message,
    retrievalQuery: localNormalize(message),
    usedOpenAI: false,
    provider: "local",
  };
}
