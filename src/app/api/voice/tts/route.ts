import { NextRequest, NextResponse } from "next/server";

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

function prepareSpeechText(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[*_~#`]/g, "")
    .replace(/\bRDC\b/g, "R D C")
    .trim()
    .slice(0, 4000);
}

export async function POST(request: NextRequest) {
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
  const input = prepareSpeechText(payload.text);

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: process.env.OPENAI_TTS_VOICE || "coral",
        input,
        response_format: "mp3",
        stream_format: "audio",
        instructions: [
          `Speak in ${language}.`,
          "Use a warm, natural Indian female voice with a clear Indian accent.",
          "Sound friendly, confident, and conversational, like a helpful professional colleague.",
          "Use expressive but restrained intonation, gentle pauses, and a comfortable pace.",
          "Avoid an American accent, exaggerated enthusiasm, and robotic delivery.",
        ].join(" "),
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
