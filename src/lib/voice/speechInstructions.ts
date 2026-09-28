/**
 * How TARA should sound. The speech model follows these closely, so the accent
 * is described concretely rather than just named: "Indian accent" alone came
 * out close to American (RDC, 2026-09-28).
 */
export function speechInstructions(languageCode: string, language: string): string {
  return [
    `Speak in ${language}.`,
    "Voice: a warm Indian woman in her early thirties, an experienced customer-care executive at a Mumbai company.",
    "Accent: a clear, natural Indian accent throughout, the way an educated professional from Mumbai speaks. " +
      "Indian vowels, a soft retroflex 't' and 'd', a lightly tapped 'r', and the even, syllable-timed rhythm of Indian English. " +
      "Not American, not British, and not exaggerated or comic.",
    "Say Indian names, places and numbers the Indian way: Thane, Navi Mumbai, Ghodbunder Road, lakh and crore.",
    "Her own name is Taara, as in Hindi तारा: a long 'aa' in both syllables, TAA-raa, never 'Tara' as in English.",
    "Tone: friendly, polite and confident; unhurried, with natural pauses between sentences.",
    languageCode === "hi"
      ? "Speak natural everyday Hindi, as spoken in Mumbai offices, not stiff textbook Hindi. Words such as RDC, concrete, plant, order and WhatsApp keep their Indian-English sound."
      : "",
  ].filter(Boolean).join(" ");
}

/**
 * The text as the voice should read it (the caption keeps the written form).
 * "RDC" is spelled out letter by letter. "TARA"/"Tara" is the Hindi name
 * तारा, "Taara", which English spelling cannot show: an English voice reading
 * "Tara" says TAR-uh (RDC, 2026-09-28). A Hindi reply gets the Devanagari,
 * which the voice already says correctly.
 */
export function speechInput(text: string, languageCode: string): string {
  return text
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[*_~#`]/g, "")
    .replace(/\bRDC\b/g, "R D C")
    .replace(/\bTARA\b|\bTara\b/g, languageCode === "hi" ? "तारा" : "Taara")
    .trim()
    // An answer is 150-250 words; anything much longer is not a chat reply.
    .slice(0, 2000);
}
