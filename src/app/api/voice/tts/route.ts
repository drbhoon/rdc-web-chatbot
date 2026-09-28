import { NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/rateLimit";
import { speechInput, speechInstructions } from "@/lib/voice/speechInstructions";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "Indian English",
  hi: "Hindi",
  mr: "Marathi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  gu: "Gujarati",
  pa: "Punjabi",
  bn: "Bengali",
};

export async function POST(request: NextRequest) {
  // Each call is paid speech synthesis, and the endpoint is public.
  if (rateLimited(request, "tts", 60)) {
    return NextResponse.json({ error: "Please try again in one minute." }, { status: 429 });
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Natural voice is not configured" }, { status: 503 });
  }

  let payload: { text?: unknown; language?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof payload.text !== "string" || !payload.text.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const languageCode = typeof payload.language === "string" ? payload.language : "en";
  const language = LANGUAGE_NAMES[languageCode] || LANGUAGE_NAMES.en;
  const input = speechInput(payload.text, languageCode);

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        // "sage", chosen by RDC from recorded samples (2026-09-28).
        voice: process.env.OPENAI_TTS_VOICE || "sage",
        input,
        response_format: "mp3",
        stream_format: "audio",
        instructions: speechInstructions(languageCode, language),
      }),
      cache: "no-store",
    });

    if (!response.ok || !response.body) {
      const detail = await response.text();
      console.error("OpenAI TTS error:", response.status, detail.slice(0, 500));
      return NextResponse.json({ error: "Natural voice generation failed" }, { status: 502 });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("TTS request failed:", error);
    return NextResponse.json({ error: "Natural voice service is unavailable" }, { status: 502 });
  }
}
