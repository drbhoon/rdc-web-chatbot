import { speechInput } from "@/lib/voice/speechInstructions";

/**
 * TARA's voice from Sarvam AI (Bulbul): an Indian voice, where OpenAI's voices
 * stayed American however the accent was described. RDC chose Sanchita from
 * recorded samples (2026-10-12): the "companion" style in English, the
 * "assistant" style in Hindi.
 */
export const SARVAM_SPEAKERS: Record<string, { languageCode: string; speaker: string }> = {
  en: { languageCode: "en-IN", speaker: process.env.SARVAM_SPEAKER_EN || "sanchita_en_companion" },
  hi: { languageCode: "hi-IN", speaker: process.env.SARVAM_SPEAKER_HI || "sanchita_hi_assistant" },
};

/** Whether this reply is spoken by Sarvam (key set, not switched off, a language Sanchita speaks). */
export function usesSarvam(languageCode: string): boolean {
  return Boolean(process.env.SARVAM_API_KEY?.trim()) && process.env.TTS_PROVIDER !== "openai" && languageCode in SARVAM_SPEAKERS;
}

/**
 * The text as Sanchita should read it: like the OpenAI voice's ("Taara", no
 * markdown), but "RDC" left as written — she says the letters herself, as in
 * the samples RDC approved.
 */
export function sarvamInput(text: string, languageCode: string): string {
  return speechInput(text, languageCode).replace(/\bR D C\b/g, "RDC");
}

/** MP3 audio of the text, or an error naming what went wrong. */
export async function sarvamSpeech(text: string, languageCode: string): Promise<Uint8Array> {
  const voice = SARVAM_SPEAKERS[languageCode] ?? SARVAM_SPEAKERS.en;
  const response = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY!.trim(), "Content-Type": "application/json" },
    body: JSON.stringify({
      text: sarvamInput(text, languageCode),
      language_code: voice.languageCode,
      model: process.env.SARVAM_TTS_MODEL || "bulbul:v4-flash",
      speaker: voice.speaker,
      speech_sample_rate: 24000,
      output_audio_codec: "mp3",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Sarvam ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = (await response.json()) as { audios?: string[] };
  const audio = body.audios?.[0];
  if (!audio) throw new Error("Sarvam returned no audio");
  return new Uint8Array(Buffer.from(audio, "base64"));
}
