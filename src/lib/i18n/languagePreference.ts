export type SupportedLanguagePreference = "en" | "hi";

const ENGLISH_SWITCH_PATTERNS = [
  /\b(?:switch|change|convert)\s+(?:over\s+)?to\s+english\b/i,
  /\b(?:reply|respond|answer|continue|speak|talk)\s+in\s+english\b/i,
  /\benglish\s+(?:please|pls|me|mein|main|language)\b/i,
  /\b(?:angrezi|angrej[iy])\s+(?:me|mein|main)\b/i,
  /(?:इंग्लिश|इंगलिश|अंग्रेजी|अंग्रेज़ी|अंगरेजी)/i,
  /इंग्लिश|इंगलिश|अंग्रेजी|अंग्रेज़ी|अंगरेजी|english/i,
];

const HINDI_SWITCH_PATTERNS = [
  /\b(?:switch|change|convert)\s+(?:over\s+)?to\s+hindi\b/i,
  /\b(?:reply|respond|answer|continue|speak|talk)\s+in\s+hindi\b/i,
  /\bhindi\s+(?:please|pls|me|mein|main|language)\b/i,
  /(?:हिंदी|हिन्दी)\s*(?:में|मे|मंे)?/i,
  /हिंदी|हिन्दी/i,
];

const INFORMATION_WORDS = [
  /\brdc\b/i,
  /\brmc\b/i,
  /\bvision\b/i,
  /\bemployee\b/i,
  /\babout\b/i,
  /\binformation\b/i,
  /\bdetails?\b/i,
  /जानकारी/,
  /बताओ|बताएं|बताइए/,
];

export function detectRequestedLanguage(text: string): SupportedLanguagePreference | null {
  if (ENGLISH_SWITCH_PATTERNS.some((pattern) => pattern.test(text))) return "en";
  if (HINDI_SWITCH_PATTERNS.some((pattern) => pattern.test(text))) return "hi";
  return null;
}

export function isOnlyLanguageSwitch(text: string): boolean {
  const requestedLanguage = detectRequestedLanguage(text);
  if (!requestedLanguage) return false;

  const compact = text
    .toLowerCase()
    .replace(/[?.!,।]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (INFORMATION_WORDS.some((pattern) => pattern.test(compact))) return false;

  return compact.length <= 80;
}

export function languageSwitchAcknowledgement(language: SupportedLanguagePreference): string {
  if (language === "hi") {
    return "ज़रूर, मैं आगे हिंदी में जवाब दूंगी। कृपया बताइए, मैं आपकी कैसे मदद कर सकती हूं?";
  }

  return "Sure, I will continue in English. How can I help you?";
}
