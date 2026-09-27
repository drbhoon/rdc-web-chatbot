/**
 * Language detection utility using franc-min
 * Supports detection of major Indian languages + English
 */

// Mapping of franc language codes to our app language codes
const FRANC_TO_LANG: Record<string, string> = {
  eng: "en",
  hin: "hi",
  mar: "mr",
  tam: "ta",
  tel: "te",
  kan: "kn",
  mal: "ml",
  guj: "gu",
  pan: "pa",
  ben: "bn",
  ori: "or",
  urd: "ur",
  asm: "as",
};

// Language names for display
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
  ta: "தமிழ்",
  te: "తెలుగు",
  kn: "ಕನ್ನಡ",
  ml: "മലയാളം",
  gu: "ગુજરાતી",
  pa: "ਪੰਜਾਬੀ",
  bn: "বাংলা",
  or: "ଓଡ଼ିଆ",
  ur: "اردو",
  as: "অসমীয়া",
};

// Polite greeting in each language
export const GREETINGS: Record<string, string> = {
  en: "Good day! How can I help you?",
  hi: "नमस्ते! मैं आपकी कैसे सहायता कर सकती हूँ?",
  mr: "नमस्कार! मी तुम्हाला कशी मदत करू शकतो?",
  ta: "வணக்கம்! நான் உங்களுக்கு எவ்வாறு உதவலாம்?",
  te: "నమస్కారం! నేను మీకు ఎలా సహాయం చేయగలను?",
  kn: "ನಮಸ್ಕಾರ! ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
  ml: "നമസ്കാരം! ഞാൻ നിങ്ങൾക്ക് എങ്ങനെ സഹായിക്കാം?",
  gu: "નમસ્કાર! હું તમને કઈ રીતે મદદ કરી શકું?",
  pa: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
  bn: "নমস্কার! আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
};

// Script detection for Indian languages
const SCRIPT_PATTERNS: Array<{ pattern: RegExp; lang: string }> = [
  { pattern: /[\u0900-\u097F]/, lang: "hi" }, // Devanagari (Hindi/Marathi)
  { pattern: /[\u0B80-\u0BFF]/, lang: "ta" }, // Tamil
  { pattern: /[\u0C00-\u0C7F]/, lang: "te" }, // Telugu
  { pattern: /[\u0C80-\u0CFF]/, lang: "kn" }, // Kannada
  { pattern: /[\u0D00-\u0D7F]/, lang: "ml" }, // Malayalam
  { pattern: /[\u0A80-\u0AFF]/, lang: "gu" }, // Gujarati
  { pattern: /[\u0A00-\u0A7F]/, lang: "pa" }, // Gurmukhi (Punjabi)
  { pattern: /[\u0980-\u09FF]/, lang: "bn" }, // Bengali
  { pattern: /[\u0B00-\u0B7F]/, lang: "or" }, // Odia
  { pattern: /[\u0600-\u06FF]/, lang: "ur" }, // Arabic/Urdu
];

/**
 * Detect language from text using script patterns + franc fallback.
 * Returns ISO 639-1 like short code (en, hi, mr, ta, etc.)
 */
export async function detectLanguage(text: string): Promise<string> {
  if (!text || text.trim().length < 3) return "en";

  // First check for non-Latin scripts (very reliable)
  for (const { pattern, lang } of SCRIPT_PATTERNS) {
    if (pattern.test(text)) {
      // Differentiate Hindi vs Marathi by common Marathi-specific words
      if (lang === "hi") {
        const marathiWords = ["आहे", "आहेत", "माझ्या", "तुमच्या", "आणि", "किंवा"];
        const isMarathi = marathiWords.some((w) => text.includes(w));
        return isMarathi ? "mr" : "hi";
      }
      return lang;
    }
  }

  const hinglishPattern =
    /\b(kya|kaise|batao|bataye|bataen|bataein|bataiye|samjhao|hai|hain|chahiye|karna|kaun|kitna|mujhe|aap|apka|ke liye|ke baare|ke bare|bare mein|order karna)\b/i;
  if (hinglishPattern.test(text)) return "hi";

  // For Latin script, use franc (detects between English and other Latin-script languages)
  try {
    const { franc } = await import("franc-min");
    const detected = franc(text, { only: Object.keys(FRANC_TO_LANG) });
    if (detected && detected !== "und" && FRANC_TO_LANG[detected]) {
      return FRANC_TO_LANG[detected];
    }
  } catch {
    // franc not available - default to English
  }

  return "en";
}

/**
 * Get language display name
 */
export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || "English";
}

/**
 * Check if language is RTL
 */
export function isRTL(code: string): boolean {
  return code === "ur" || code === "ar";
}
