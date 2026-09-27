import { withBase } from "@/lib/basePath";
/**
 * Voice service for RDC Saathi.
 * Speech recognition uses the browser API; speech output prefers server-generated
 * OpenAI audio and falls back to an installed browser voice.
 */

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface TTSOptions {
  text: string;
  language: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onEnergy?: (energy: number) => void;
  onBoundary?: (event: { charIndex: number; charLength?: number; name?: string }) => void;
}

const LANGUAGE_TAGS: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  gu: "gu-IN",
  pa: "pa-IN",
  bn: "bn-IN",
};

let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
let activeAudioContext: AudioContext | null = null;
let activeAnimationFrame: number | null = null;
let activeRequest: AbortController | null = null;
let fallbackEnergyTimer: number | null = null;

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

function cleanSpeechText(text: string): string {
  return text
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[*_~#`]/g, "")
    .replace(/\bRDC\b/g, "R D C")
    .trim();
}

function conversationalSpeechText(text: string, maxLength = 560): string {
  const cleaned = cleanSpeechText(text).replace(/\s+/g, " ");
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

function releaseGeneratedAudio(): void {
  if (activeAnimationFrame !== null) {
    window.cancelAnimationFrame(activeAnimationFrame);
    activeAnimationFrame = null;
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if (activeAudioContext) {
    void activeAudioContext.close();
    activeAudioContext = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
}

function startEnergyTracking(
  audio: HTMLAudioElement,
  context: AudioContext,
  onEnergy?: (energy: number) => void
): void {
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  const source = context.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(context.destination);
  const samples = new Uint8Array(analyser.frequencyBinCount);

  const update = () => {
    analyser.getByteFrequencyData(samples);
    let total = 0;
    for (let i = 2; i < samples.length; i += 1) total += samples[i];
    const average = total / Math.max(1, samples.length - 2);
    onEnergy?.(Math.min(1, Math.max(0.08, average / 72)));
    activeAnimationFrame = window.requestAnimationFrame(update);
  };
  update();
}

async function speakGeneratedAudio(options: TTSOptions): Promise<boolean> {
  activeRequest = new AbortController();
  const response = await fetch(withBase("/api/voice/tts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: conversationalSpeechText(options.text), language: options.language }),
    signal: activeRequest.signal,
  });
  if (!response.ok) throw new Error(`Natural voice request failed: ${response.status}`);

  const canStream =
    response.body &&
    typeof MediaSource !== "undefined" &&
    MediaSource.isTypeSupported("audio/mpeg");

  if (!canStream) {
    const blob = await response.blob();
    activeAudioUrl = URL.createObjectURL(blob);
    return startAudioElement(new Audio(activeAudioUrl), options);
  }

  const mediaSource = new MediaSource();
  activeAudioUrl = URL.createObjectURL(mediaSource);
  const audio = new Audio(activeAudioUrl);
  const streamReady = new Promise<void>((resolve, reject) => {
    mediaSource.addEventListener("sourceopen", async () => {
      try {
        const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        const reader = response.body!.getReader();
        const queue: ArrayBuffer[] = [];
        let streamEnded = false;

        const appendNext = () => {
          if (sourceBuffer.updating) return;
          const chunk = queue.shift();
          if (chunk) {
            sourceBuffer.appendBuffer(chunk);
          } else if (streamEnded && mediaSource.readyState === "open") {
            mediaSource.endOfStream();
          }
        };

        sourceBuffer.addEventListener("updateend", appendNext);
        resolve();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            streamEnded = true;
            appendNext();
            break;
          }
          queue.push(value.slice().buffer);
          appendNext();
        }
      } catch (error) {
        reject(error);
      }
    }, { once: true });
  });

  await streamReady;
  return startAudioElement(audio, options);
}

async function startAudioElement(audio: HTMLAudioElement, options: TTSOptions): Promise<boolean> {
  activeAudio = audio;
  audio.volume = options.volume ?? 1;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = AudioContextClass ? new AudioContextClass() : null;
  activeAudioContext = context;
  let started = false;

  audio.onplaying = () => {
    if (started) return;
    started = true;
    options.onStart?.();
    if (context) {
      void context.resume();
      startEnergyTracking(audio, context, options.onEnergy);
    }
  };
  audio.onended = () => {
    activeRequest = null;
    options.onEnergy?.(0);
    releaseGeneratedAudio();
    options.onEnd?.();
  };
  audio.onerror = () => {
    activeRequest = null;
    options.onEnergy?.(0);
    releaseGeneratedAudio();
    options.onEnd?.();
  };

  await audio.play();
  return true;
}

function speakWithBrowserVoice(options: TTSOptions): boolean {
  if (!("speechSynthesis" in window)) return false;

  const utterance = new SpeechSynthesisUtterance(conversationalSpeechText(options.text));
  const targetLang = LANGUAGE_TAGS[options.language] || LANGUAGE_TAGS.en;
  utterance.lang = targetLang;
  utterance.rate = options.rate ?? 0.94;
  utterance.pitch = options.pitch ?? 1.08;
  utterance.volume = options.volume ?? 1;

  const voices = window.speechSynthesis.getVoices();
  const languageVoices = voices.filter((voice) => voice.lang.replace("_", "-").startsWith(options.language));
  const femaleHints = /female|woman|zira|heera|kalpana|veena|ravi|google.*female|microsoft.*female/i;
  const bestVoice =
    languageVoices.find((voice) => femaleHints.test(voice.name)) ||
    languageVoices.find((voice) => voice.lang.replace("_", "-") === targetLang) ||
    languageVoices[0];
  if (bestVoice) utterance.voice = bestVoice;

  utterance.onstart = () => {
    options.onStart?.();
    fallbackEnergyTimer = window.setInterval(() => {
      options.onEnergy?.(0.22 + Math.random() * 0.7);
    }, 105);
  };
  utterance.onboundary = (event) => {
    options.onBoundary?.({ charIndex: event.charIndex, charLength: event.charLength, name: event.name });
  };
  const finish = () => {
    if (fallbackEnergyTimer !== null) {
      window.clearInterval(fallbackEnergyTimer);
      fallbackEnergyTimer = null;
    }
    options.onEnergy?.(0);
    options.onEnd?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
  return true;
}

export async function speakText(options: TTSOptions): Promise<boolean> {
  if (!isTTSSupported() || process.env.NEXT_PUBLIC_ENABLE_TTS !== "true") return false;
  stopSpeaking();

  if (process.env.NEXT_PUBLIC_USE_AI_TTS !== "false") {
    try {
      return await speakGeneratedAudio(options);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.warn("Natural voice unavailable; using browser voice.", error);
      }
      releaseGeneratedAudio();
    }
  }

  return speakWithBrowserVoice(options);
}

export function stopSpeaking(): void {
  activeRequest?.abort();
  activeRequest = null;
  releaseGeneratedAudio();
  if (fallbackEnergyTimer !== null) {
    window.clearInterval(fallbackEnergyTimer);
    fallbackEnergyTimer = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
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
