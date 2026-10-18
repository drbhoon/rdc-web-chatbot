import { withBase } from "@/lib/basePath";
/**
 * Voice service for TARA Online.
 *
 * Listening: the browser's speech recognition.
 *
 * Speaking: RDC's voice (OpenAI speech, /api/voice/tts), falling back to an
 * installed browser voice. A reply is spoken in pieces as it is written, each
 * piece fetched while the one before plays, so TARA starts talking a second
 * or two after a question instead of after the whole answer (RDC, 2026-10-11).
 *
 * Why she sometimes stayed silent before, and what changed:
 * - Each reply's audio was routed through a new Web Audio context (for the lip
 *   movement). A context the browser keeps suspended plays SILENCE, which
 *   iPhones and some desktop browsers do. The audio now plays straight from
 *   one <audio> element; the lip movement reads the decoded sound instead.
 * - That element is unlocked by the visitor's own tap or Enter key
 *   (unlockAudio), so later replies may play; if a browser still refuses, the
 *   caller is told (onBlocked) and can offer a "tap to hear" button.
 * - A piece the server cannot voice is spoken by the browser voice instead.
 */

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface SpeakerOptions {
  language: string;
  /** The first sound of this reply. */
  onStart?: () => void;
  /** Everything spoken, or stopped. */
  onEnd?: () => void;
  /** Loudness 0..1 for the lips, many times a second. */
  onEnergy?: (energy: number) => void;
  /** Characters of the pushed (readable) text spoken so far. */
  onSpokenChars?: (chars: number) => void;
  /** The browser would not play without a tap: call resume() from a click. */
  onBlocked?: (resume: () => void) => void;
  /** Stop after about this many characters: a safety cap, well above an answer's length. */
  maxChars?: number;
}

export interface TTSOptions extends SpeakerOptions {
  text: string;
}

const LANGUAGE_TAGS: Record<string, string> = {
  en: "en-IN", hi: "hi-IN", mr: "mr-IN", ta: "ta-IN", te: "te-IN",
  kn: "kn-IN", ml: "ml-IN", gu: "gu-IN", pa: "pa-IN", bn: "bn-IN",
};

/** The browser's speech-recognition language for one of TARA's language codes. */
export function speechLanguageTag(code: string): string {
  return LANGUAGE_TAGS[code] || LANGUAGE_TAGS.en;
}

// "R D C", so the voice spells it out instead of reading a word.
const forSpeech = (text: string) => text.replace(/\bRDC\b/g, "R D C");

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
}

export function createSpeechRecognition(
  language: string,
  onResult: (result: SpeechRecognitionResult) => void,
  onError: (error: string) => void,
  onEnd: () => void
): (() => void) | null {
  if (!isSpeechRecognitionSupported()) return null;

  const bcp47 = LANGUAGE_TAGS[language] || LANGUAGE_TAGS.en;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRecognitionClass = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  const recognition = new SpeechRecognitionClass();

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = bcp47;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const last = event.results[event.results.length - 1];
    onResult({
      transcript: last[0].transcript,
      confidence: last[0].confidence,
      isFinal: last.isFinal,
    });
  };
  recognition.onerror = (event: SpeechRecognitionErrorEvent) => onError(event.error);
  recognition.onend = onEnd;
  recognition.start();

  return () => recognition.stop();
}

export function isTTSSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof Audio !== "undefined" || "speechSynthesis" in window;
}

/**
 * A reply as it is read aloud and captioned: links reduced to their text, list
 * markers and markdown symbols dropped, one line. The caption shows this, and
 * the voice speaks the start of it, so the two stay in step.
 */
export function readableText(text: string): string {
  return text
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^\s*(?:[-•*]|\d+\.)\s+/gm, "")
    .replace(/[*_~#`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The part of a reply the voice actually reads: whole sentences, up to ~560 characters. */
export function spokenExcerpt(text: string, maxLength = 560): string {
  const cleaned = readableText(text);
  if (cleaned.length <= maxLength) return cleaned;

  const sentences = cleaned.match(/[^.!?।]+[.!?।]+/g) || [];
  let excerpt = "";
  for (const sentence of sentences) {
    if (excerpt && excerpt.length + sentence.length > maxLength) break;
    excerpt += sentence;
  }

  if (excerpt.trim().length >= 80) return excerpt.trim();
  const clipped = cleaned.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : maxLength).trim()}.`;
}

/**
 * Splits text that is still arriving into speakable pieces: whole sentences,
 * at least `min` characters (a short first piece, so the voice starts soon).
 * Returns the pieces ready now and the remainder to keep waiting on.
 */
export function takePieces(buffer: string, min: number): { pieces: string[]; rest: string } {
  const pieces: string[] = [];
  let rest = buffer;
  for (;;) {
    // Only where a space or line break follows: text still arriving may go on
    // ("Rs." then "5,000", "3." then "5 lakh"). The final flush takes the rest.
    const ends = [...rest.matchAll(/[.!?।](?=\s)|\n/g)].map((m) => (m.index ?? 0) + 1);
    const cut = ends.find((end) => rest.slice(0, end).trim().length >= min);
    if (!cut) break;
    const piece = rest.slice(0, cut).trim();
    if (piece) pieces.push(piece);
    rest = rest.slice(cut);
    min = Math.max(min, 140); // later pieces can be longer: they are fetched while one plays
  }
  return { pieces, rest };
}

// ── The one audio element ─────────────────────────────────────────────────────

let sharedAudio: HTMLAudioElement | null = null;
let activeSpeaker: Speaker | null = null;

// A tenth of a second of silence (8 kHz, 8-bit WAV), played to unlock audio.
function silentWav(): string {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const write = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + samples, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  write(36, "data"); view.setUint32(40, samples, true); bytes.fill(128, 44);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function audioElement(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
    sharedAudio.setAttribute("playsinline", "");
  }
  return sharedAudio;
}

/**
 * Call from the visitor's own click or key press (send, Enter, mic, speaker
 * button). Browsers only let a page play sound it has been given permission
 * for by a gesture; once this element has played inside one, later replies can
 * play on it.
 */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  const audio = audioElement();
  if (audio.dataset.unlocked) return;
  audio.src = silentWav();
  audio.play().then(() => { audio.dataset.unlocked = "1"; }).catch(() => { /* not this time */ });
  // The browser voice (fallback) needs the same nudge on some phones.
  if ("speechSynthesis" in window) window.speechSynthesis.resume();
}

/** Loudness every 25 ms of decoded audio, for the lips. Null if it cannot be decoded. */
async function loudnessEnvelope(data: ArrayBuffer): Promise<Float32Array | null> {
  try {
    const OfflineContext = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OfflineContext) return null;
    const decoded = await new OfflineContext(1, 1, 22050).decodeAudioData(data.slice(0));
    const samples = decoded.getChannelData(0);
    const step = Math.max(1, Math.round(decoded.sampleRate * 0.025));
    const out = new Float32Array(Math.ceil(samples.length / step));
    let peak = 0.0001;
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      const end = Math.min(samples.length, (i + 1) * step);
      for (let j = i * step; j < end; j++) sum += samples[j] * samples[j];
      out[i] = Math.sqrt(sum / Math.max(1, end - i * step));
      peak = Math.max(peak, out[i]);
    }
    for (let i = 0; i < out.length; i++) out[i] = Math.min(1, out[i] / (peak * 0.7));
    return out;
  } catch {
    return null;
  }
}

interface Clip { text: string; url: string | null; envelope: Float32Array | null }

/**
 * Speaks one reply. push() text as it arrives, finish() when it is complete,
 * stop() to cut it off. Starting a new speaker stops the previous one.
 */
export class Speaker {
  private buffer = "";
  private queued: Array<{ text: string; clip: Promise<Clip> }> = [];
  private finished = false;
  private stopped = false;
  private playing = false;
  private started = false;
  private spokenChars = 0;
  private budget: number;
  private timer: number | null = null;
  private readonly useServerVoice = process.env.NEXT_PUBLIC_USE_AI_TTS !== "false";

  constructor(private readonly options: SpeakerOptions) {
    activeSpeaker?.stop();
    // One voice at a time: remember this one so a new reply can stop it.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeSpeaker = this;
    // Answers are read in full (RDC, 2026-10-18); addresses and catalogues come
    // as a short spoken summary instead, so this only stops a runaway reply.
    this.budget = options.maxChars ?? 2500;
  }

  push(text: string): void {
    if (this.stopped || this.budget <= 0) return;
    this.buffer += text;
    this.enqueue(false);
  }

  finish(): void {
    this.finished = true;
    this.enqueue(true);
    if (!this.playing && this.queued.length === 0) this.end();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.queued = [];
    if (this.timer !== null) window.clearInterval(this.timer);
    if (sharedAudio && activeSpeaker === this) sharedAudio.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    this.options.onEnergy?.(0);
    if (activeSpeaker === this) activeSpeaker = null;
  }

  private enqueue(all: boolean): void {
    const { pieces, rest } = takePieces(this.buffer, this.started || this.queued.length ? 140 : 40);
    this.buffer = rest;
    if (all && rest.trim()) {
      pieces.push(rest.trim());
      this.buffer = "";
    }
    for (const raw of pieces) {
      const text = readableText(raw);
      if (!text || this.budget <= 0) continue;
      this.budget -= text.length;
      this.queued.push({ text, clip: this.fetchClip(text) });
    }
    if (!this.playing) void this.playNext();
  }

  private async fetchClip(text: string): Promise<Clip> {
    if (!this.useServerVoice) return { text, url: null, envelope: null };
    try {
      const res = await fetch(withBase("/api/voice/tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: forSpeech(text), language: this.options.language }),
      });
      if (!res.ok) throw new Error(`voice ${res.status}`);
      const data = await res.arrayBuffer();
      const envelope = await loudnessEnvelope(data);
      return { text, url: URL.createObjectURL(new Blob([data], { type: "audio/mpeg" })), envelope };
    } catch (error) {
      console.warn("RDC voice unavailable for this piece; using the browser voice.", error);
      return { text, url: null, envelope: null };
    }
  }

  private async playNext(): Promise<void> {
    if (this.stopped) return;
    const next = this.queued.shift();
    if (!next) {
      this.playing = false;
      if (this.finished) this.end();
      return;
    }
    this.playing = true;
    const clip = await next.clip;
    if (this.stopped) return;
    const spokenBefore = this.spokenChars;
    const ok = clip.url ? await this.playClip(clip, spokenBefore) : await this.speakWithBrowser(clip.text, spokenBefore);
    if (clip.url) URL.revokeObjectURL(clip.url);
    if (!ok || this.stopped) return;
    this.spokenChars = spokenBefore + clip.text.length;
    this.options.onSpokenChars?.(this.spokenChars);
    void this.playNext();
  }

  private begin(): void {
    if (this.started) return;
    this.started = true;
    this.options.onStart?.();
  }

  private playClip(clip: Clip, spokenBefore: number): Promise<boolean> {
    const audio = audioElement();
    return new Promise((resolve) => {
      let guard: number | null = null;
      const done = (ok: boolean) => {
        if (guard !== null) window.clearTimeout(guard);
        guard = null;
        if (this.timer !== null) window.clearInterval(this.timer);
        this.timer = null;
        audio.onended = null;
        audio.onerror = null;
        this.options.onEnergy?.(0);
        resolve(ok);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(true); // skip a broken piece rather than stall
      audio.src = clip.url!;
      const tick = () => {
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : clip.text.length / 14;
        const at = audio.currentTime;
        this.options.onSpokenChars?.(spokenBefore + Math.min(1, at / duration) * clip.text.length);
        const env = clip.envelope;
        // Real loudness when the audio could be decoded; a lively guess otherwise.
        this.options.onEnergy?.(env ? env[Math.min(env.length - 1, Math.floor(at / 0.025))] : 0.25 + Math.random() * 0.6);
      };
      const start = () => {
        this.begin();
        this.timer = window.setInterval(tick, 40);
        // A clip that stalls never reports "ended", and the open mic waits for
        // the end of TARA's answer to listen again: move on regardless.
        const seconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : clip.text.length / 12;
        guard = window.setTimeout(() => done(true), (seconds + 4) * 1000);
      };
      audio.play().then(start).catch((error: Error) => {
        if (error?.name !== "NotAllowedError" || !this.options.onBlocked) return done(true);
        // The browser wants a tap first: hand the caller a way to resume.
        this.options.onBlocked(() => {
          audio.dataset.unlocked = "1";
          audio.play().then(start).catch(() => done(true));
        });
      });
    });
  }

  private speakWithBrowser(text: string, spokenBefore: number): Promise<boolean> {
    if (!("speechSynthesis" in window)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(forSpeech(text));
      const targetLang = LANGUAGE_TAGS[this.options.language] || LANGUAGE_TAGS.en;
      utterance.lang = targetLang;
      utterance.rate = 0.94;
      utterance.pitch = 1.08;
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith(this.options.language));
      const voice = voices.find((v) => /female|woman|zira|heera|kalpana|veena/i.test(v.name)) || voices.find((v) => v.lang.replace("_", "-") === targetLang) || voices[0];
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        this.begin();
        this.timer = window.setInterval(() => this.options.onEnergy?.(0.22 + Math.random() * 0.7), 105);
      };
      utterance.onboundary = (event) => this.options.onSpokenChars?.(spokenBefore + Math.min(text.length, event.charIndex));
      const finish = () => {
        if (this.timer !== null) window.clearInterval(this.timer);
        this.timer = null;
        this.options.onEnergy?.(0);
        resolve(true);
      };
      // Chrome's own voice sometimes never fires "end" on a long sentence.
      const guard = window.setTimeout(finish, (text.length / 10 + 5) * 1000);
      utterance.onend = utterance.onerror = () => {
        window.clearTimeout(guard);
        finish();
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  private end(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (activeSpeaker === this) activeSpeaker = null;
    this.options.onEnergy?.(0);
    this.options.onEnd?.();
  }
}

/** Speaks a whole reply at once (replies that did not stream). */
export function speakText(options: TTSOptions): boolean {
  if (!isTTSSupported() || process.env.NEXT_PUBLIC_ENABLE_TTS !== "true") return false;
  const speaker = new Speaker(options);
  speaker.push(options.text);
  speaker.finish();
  return true;
}

/** Whether TARA has a reply under way (fetching or playing her voice). */
export function isSpeaking(): boolean {
  return activeSpeaker !== null;
}

export function stopSpeaking(): void {
  activeSpeaker?.stop();
  activeSpeaker = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult2;
}

interface SpeechRecognitionResult2 {
  length: number;
  isFinal: boolean;
  [index: number]: { transcript: string; confidence: number };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}
