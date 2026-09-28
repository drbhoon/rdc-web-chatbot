"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { withBase } from "@/lib/basePath";
import { Mic, Sparkles, Volume2 } from "lucide-react";
import type { AvatarMode } from "@/lib/avatar/motion";
import LiveAvatarCanvas from "./LiveAvatarCanvas";
import { readableText, spokenExcerpt } from "@/lib/voice/voiceService";

interface SaathiAvatarProps {
  mode: AvatarMode;
  speechEnergy: number;
  language: string;
  languageDisabled?: boolean;
  onLanguageChange: (language: "en" | "hi") => void;
  /** Her latest reply, shown beside her; null while she is thinking. */
  caption?: string | null;
  /** How far she is through reading it aloud (0..1), or null when not speaking. */
  captionProgress?: number | null;
}

/** Splits a reply into sentences, keeping the spaces so the pieces add back up. */
export function captionSentences(text: string): string[] {
  const display = readableText(text);
  return display.match(/[^.!?।]+(?:[.!?।]+|$)\s*/g) || [display];
}

/** The sentence being spoken at `progress` through the part that is read aloud. */
export function currentSentence(text: string, progress: number | null | undefined): number {
  if (progress === null || progress === undefined) return -1;
  const at = progress * spokenExcerpt(text).length;
  let end = 0;
  const sentences = captionSentences(text);
  for (let i = 0; i < sentences.length; i++) {
    end += sentences[i].length;
    if (at < end) return i;
  }
  return sentences.length - 1;
}

function Caption({ text, progress }: { text: string; progress: number | null | undefined }) {
  const box = useRef<HTMLDivElement>(null);
  const sentences = captionSentences(text);
  const current = currentSentence(text, progress);

  // Keep the sentence being spoken in view, scrolling the box, not the page.
  useEffect(() => {
    const container = box.current;
    const line = container?.querySelector<HTMLElement>(".is-current");
    if (!container || !line) return;
    const top = line.offsetTop - container.offsetTop;
    if (top < container.scrollTop || top + line.offsetHeight > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
    }
  }, [current]);
  useEffect(() => { box.current?.scrollTo({ top: 0 }); }, [text]);

  return (
    <div ref={box} className="saathi-caption" aria-live="polite">
      {sentences.map((sentence, i) => (
        <span key={i} className={i === current ? "is-current" : current >= 0 && i > current ? "is-ahead" : undefined}>
          {sentence}
        </span>
      ))}
    </div>
  );
}

const STATUS_LABELS: Record<string, Record<AvatarMode, string>> = {
  en: { idle: "Ready to help", listening: "Listening", thinking: "Thinking", speaking: "Speaking" },
  hi: { idle: "मदद के लिए तैयार", listening: "सुन रही हूं", thinking: "सोच रही हूं", speaking: "बोल रही हूं" },
  mr: { idle: "मदतीसाठी तयार", listening: "ऐकत आहे", thinking: "विचार करत आहे", speaking: "बोलत आहे" },
  ta: { idle: "உதவத் தயார்", listening: "கேட்கிறேன்", thinking: "சிந்திக்கிறேன்", speaking: "பேசுகிறேன்" },
  te: { idle: "సహాయం చేయడానికి సిద్ధం", listening: "వింటున్నాను", thinking: "ఆలోచిస్తున్నాను", speaking: "మాట్లాడుతున్నాను" },
  kn: { idle: "ಸಹಾಯಕ್ಕೆ ಸಿದ್ಧ", listening: "ಕೇಳುತ್ತಿದ್ದೇನೆ", thinking: "ಯೋಚಿಸುತ್ತಿದ್ದೇನೆ", speaking: "ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ" },
  ml: { idle: "സഹായിക്കാൻ തയ്യാർ", listening: "കേൾക്കുന്നു", thinking: "ചിന്തിക്കുന്നു", speaking: "സംസാരിക്കുന്നു" },
  gu: { idle: "મદદ માટે તૈયાર", listening: "સાંભળી રહી છું", thinking: "વિચારી રહી છું", speaking: "બોલી રહી છું" },
  pa: { idle: "ਮਦਦ ਲਈ ਤਿਆਰ", listening: "ਸੁਣ ਰਹੀ ਹਾਂ", thinking: "ਸੋਚ ਰਹੀ ਹਾਂ", speaking: "ਬੋਲ ਰਹੀ ਹਾਂ" },
  bn: { idle: "সাহায্যের জন্য প্রস্তুত", listening: "শুনছি", thinking: "ভাবছি", speaking: "বলছি" },
};

function modeLabel(mode: AvatarMode, language: string): string {
  return (STATUS_LABELS[language] || STATUS_LABELS.en)[mode];
}

function StateIcon({ mode }: { mode: AvatarMode }) {
  if (mode === "listening") return <Mic size={14} aria-hidden="true" />;
  if (mode === "speaking") return <Volume2 size={14} aria-hidden="true" />;
  if (mode === "thinking") return <Sparkles size={14} aria-hidden="true" />;
  return <span className="saathi-status-dot" aria-hidden="true" />;
}

export default function SaathiAvatar({
  mode,
  speechEnergy,
  language,
  languageDisabled = false,
  onLanguageChange,
  caption = null,
  captionProgress = null,
}: SaathiAvatarProps) {
  const energy = mode === "speaking" ? Math.max(0, Math.min(1, speechEnergy)) : 0;
  const speakingFrame = energy < 0.18 ? "rest" : energy < 0.62 ? "soft" : "open";
  const label = modeLabel(mode, language);
  // The still images show until the live (moving) avatar has drawn its first
  // frame, and stay if it cannot run (no WebGL).
  const [liveReady, setLiveReady] = useState(false);

  return (
    <section className={`saathi-avatar-shell mode-${mode}`} aria-label={`TARA Online: ${label}`}>
      <div className="saathi-avatar-stage" aria-hidden="true">
        <div className="saathi-avatar-halo" />
        <div className={`saathi-avatar-photo ${liveReady ? "is-live" : ""}`}>
          <LiveAvatarCanvas mode={mode} speechEnergy={speechEnergy} className="saathi-live-canvas" onReady={setLiveReady} />
          <Image
            src={withBase("/saathi-avatar-v2.png")}
            alt=""
            fill
            priority
            sizes="(max-width: 420px) 116px, 142px"
            className={`saathi-face-frame ${mode !== "speaking" || speakingFrame === "rest" ? "is-visible" : ""}`}
          />
          <Image
            src={withBase("/saathi-avatar-speak-soft.png")}
            alt=""
            fill
            priority
            sizes="(max-width: 420px) 116px, 142px"
            className={`saathi-face-frame ${mode === "speaking" && speakingFrame === "soft" ? "is-visible" : ""}`}
          />
          <Image
            src={withBase("/saathi-avatar-speak-open.png")}
            alt=""
            fill
            priority
            sizes="(max-width: 420px) 116px, 142px"
            className={`saathi-face-frame ${mode === "speaking" && speakingFrame === "open" ? "is-visible" : ""}`}
          />
          {mode !== "speaking" && (
            <Image
              src={withBase("/saathi-avatar-blink.png")}
              alt=""
              fill
              priority
              sizes="(max-width: 420px) 116px, 142px"
              className="saathi-face-frame saathi-blink-frame"
            />
          )}
        </div>
      </div>

      <div className="saathi-avatar-side">
      <div className="saathi-avatar-meta">
        <div className="saathi-avatar-name">TARA Online</div>
        <div className="saathi-avatar-role">AI-generated female voice</div>
        <div className="saathi-language-toggle" role="group" aria-label="Reply language">
          <button
            type="button"
            className={language === "en" ? "is-selected" : ""}
            aria-pressed={language === "en"}
            disabled={languageDisabled}
            onClick={() => onLanguageChange("en")}
          >
            English
          </button>
          <button
            type="button"
            className={language === "hi" ? "is-selected" : ""}
            aria-pressed={language === "hi"}
            disabled={languageDisabled}
            onClick={() => onLanguageChange("hi")}
          >
            हिन्दी
          </button>
        </div>
        <div className={`saathi-avatar-status status-${mode}`}>
          <StateIcon mode={mode} />
          <span>{label}</span>
          {language !== "en" && <span className="saathi-avatar-lang">{language.toUpperCase()}</span>}
        </div>
      </div>
      {caption && <Caption text={caption} progress={captionProgress} />}
      </div>
    </section>
  );
}
