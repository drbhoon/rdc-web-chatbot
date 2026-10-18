"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquareText, X, Mic, MicOff, Send, Volume2, VolumeX, ChevronDown } from "lucide-react";
import { getLanguageName, isRTL } from "@/lib/i18n/languageDetector";
import { isSpeechRecognitionSupported, createSpeechRecognition, Speaker, stopSpeaking, unlockAudio } from "@/lib/voice/voiceService";
import TaraWhatsAppCard from "./TaraWhatsAppCard";
import { FACTS } from "@/lib/facts";
import { withBase } from "@/lib/basePath";
import SaathiAvatar from "./SaathiAvatar";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  language: string;
  intent?: string;
  isTyping?: boolean;
}

interface ChatState {
  sessionId: string | null;
  messages: Message[];
  isOpen: boolean;
  isLoading: boolean;
  detectedLanguage: string;
  showLeadForm: boolean;
  leadFormShownForIntent: string | null;
}

/** The finished reply from /api/chat (JSON, or the stream's "done" line). */
interface ChatReply {
  message: string;
  speech?: string | null;
  sessionId: string;
  detectedLanguage: string;
  intent: string;
  suggestLeadCapture: boolean;
}

type AvatarMode = "idle" | "listening" | "thinking" | "speaking";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "Tell me about RDC",
  "What is ready-mix concrete?",
  "Which cities do you serve?",
  "How do I place an order?",
  "Show Vision 2030",
  "Contact sales",
];

const VOICE_MUTED_KEY = "tara_voice_muted";

// Voice input that hears nothing for this long gives up and says why.
const MIC_TIMEOUT_MS = 12_000;

type MicProblem = "blocked" | "no-microphone" | "network" | "no-speech" | "silent" | "unavailable" | "aborted";

/** The browser's speech-recognition error, as one of the problems TARA explains. */
function micProblem(error: string): MicProblem {
  if (error === "not-allowed" || error === "service-not-allowed") return "blocked";
  if (error === "audio-capture") return "no-microphone";
  if (error === "network") return "network";
  if (error === "no-speech") return "no-speech";
  if (error === "aborted") return "aborted";
  return "unavailable";
}

const MIC_MESSAGES: Record<Exclude<MicProblem, "aborted">, { en: string; hi: string }> = {
  blocked: {
    en: "I can't use the microphone: it is blocked for this site. Click the lock icon next to the web address, allow the Microphone, and try again — or type your question.",
    hi: "माइक्रोफ़ोन इस साइट के लिए blocked है। Address bar में lock icon पर क्लिक करके Microphone allow करें और फिर कोशिश करें — या अपना सवाल टाइप करें।",
  },
  "no-microphone": {
    en: "I can't find a working microphone. Please check that one is connected and not in use by another app such as Teams or Zoom — or type your question.",
    hi: "मुझे कोई चालू माइक्रोफ़ोन नहीं मिला। कृपया देखें कि माइक जुड़ा है और Teams या Zoom जैसी किसी दूसरी app में इस्तेमाल नहीं हो रहा — या अपना सवाल टाइप करें।",
  },
  network: {
    en: "Voice input could not reach the browser's speech service — the network may be blocking it. Please type your question, or try again on another network.",
    hi: "Voice input browser की speech service तक नहीं पहुंच पाया — शायद network इसे block कर रहा है। कृपया अपना सवाल टाइप करें, या किसी दूसरे network पर कोशिश करें।",
  },
  "no-speech": {
    en: "I didn't hear anything. Please press the mic and speak again, a little closer to the microphone — or type your question.",
    hi: "मुझे कुछ सुनाई नहीं दिया। कृपया mic दबाकर फिर से बोलें, माइक के थोड़ा पास — या अपना सवाल टाइप करें।",
  },
  silent: {
    en: "I couldn't hear you — the microphone sent no sound. Please check that it isn't muted or in use by Teams or Zoom, and that this site may use it — or type your question.",
    hi: "मुझे आपकी आवाज़ नहीं आई — माइक्रोफ़ोन से कोई आवाज़ नहीं मिली। कृपया देखें कि माइक mute नहीं है, Teams या Zoom में इस्तेमाल नहीं हो रहा, और इस साइट को उसकी अनुमति है — या अपना सवाल टाइप करें।",
  },
  unavailable: {
    en: "Voice input isn't working in this browser just now. Please type your question, or try Google Chrome.",
    hi: "Voice input अभी इस browser में काम नहीं कर रहा। कृपया अपना सवाल टाइप करें, या Google Chrome में कोशिश करें।",
  },
};

const INITIAL_GREETING = "Welcome to RDC Concrete! 🙏\n\nI'm **TARA Online**, your digital assistant. I can help you with information about our products, plant locations, ordering process, and more.\n\nHow can I help you today?";

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Render markdown-like bold text
// ─────────────────────────────────────────────────────────────────────────────

function renderMessageContent(content: string): React.ReactNode {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    // Handle bold (**text**)
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return (
      <React.Fragment key={i}>
        {rendered}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing Indicator Component
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1B2A4A] to-[#243660] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold shadow-sm">
        R
      </div>
      <div className="msg-bubble-bot flex items-center gap-1 py-3 px-4">
        <div className="typing-dot w-2 h-2 bg-gray-400 rounded-full" />
        <div className="typing-dot w-2 h-2 bg-gray-400 rounded-full" />
        <div className="typing-dot w-2 h-2 bg-gray-400 rounded-full" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Message Component
// ─────────────────────────────────────────────────────────────────────────────

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const rtl = isRTL(message.language);

  return (
    <div
      className={`flex items-end gap-2 animate-fade-in ${isUser ? "flex-row-reverse" : "flex-row"}`}
      dir={rtl ? "rtl" : "ltr"}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1B2A4A] to-[#243660] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold shadow-sm">
          R
        </div>
      )}
      <div
        className={isUser ? "msg-bubble-user" : "msg-bubble-bot"}
        style={{ whiteSpace: "pre-line" }}
      >
        {renderMessageContent(message.content)}
        <div
          className={`text-xs mt-1 ${isUser ? "text-orange-100/70" : "text-gray-400"}`}
          style={{ fontSize: "0.65rem" }}
        >
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Chat Widget
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatWidget() {
  const [state, setState] = useState<ChatState>({
    sessionId: null,
    messages: [],
    isOpen: false,
    isLoading: false,
    detectedLanguage: "en",
    showLeadForm: false,
    leadFormShownForIntent: null,
  });

  const [inputValue, setInputValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  // Voice is on from the start (RDC, 2026-10-10), unless this visitor turned it
  // off before; read after mounting so the server-rendered page matches.
  const [isTTSEnabled, setIsTTSEnabled] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(VOICE_MUTED_KEY) === "1") setIsTTSEnabled(false);
    } catch { /* storage unavailable: keep voice on */ }
  }, []);
  const toggleVoice = useCallback((on: boolean) => {
    setIsTTSEnabled(on);
    try {
      if (on) localStorage.removeItem(VOICE_MUTED_KEY);
      else localStorage.setItem(VOICE_MUTED_KEY, "1");
    } catch { /* not remembered; fine */ }
  }, []);

  // TARA's understanding nod while the visitor is asking: as they speak into
  // the mic, when they pause typing, and when they send. At most every 3.5 s,
  // so it reads as listening, not bobbing.
  const [nodSignal, setNodSignal] = useState(0);
  const lastNodAt = useRef(0);
  const typingPause = useRef<number | null>(null);
  const nod = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastNodAt.current < 3500) return;
    lastNodAt.current = now;
    setNodSignal((n) => n + 1);
  }, []);
  const nodAfterTypingPause = useCallback((text: string) => {
    if (typingPause.current) window.clearTimeout(typingPause.current);
    if (text.trim().length < 6) return;
    typingPause.current = window.setTimeout(() => nod(), 900);
  }, [nod]);
  const [hasUnread, setHasUnread] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("idle");
  const [speechEnergy, setSpeechEnergy] = useState(0);
  // How far TARA is through reading her latest reply (for the caption), or
  // null; and whether she is reading it (true) or saying a summary (false),
  // in which case the caption is not highlighted.
  const [spokenChars, setSpokenChars] = useState<number | null>(null);
  const [captionFollowsVoice, setCaptionFollowsVoice] = useState(true);
  // Set when a browser refused to play without a tap: the button calls it.
  const [blockedResume, setBlockedResume] = useState<(() => void) | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);
  // Ends the current voice input quietly (the visitor pressed the mic again).
  const settleMicRef = useRef<((problem: MicProblem | null) => void) | null>(null);

  const stopAvatarSpeech = useCallback(() => {
    setSpeechEnergy(0);
    setSpokenChars(null);
    setBlockedResume(null);
    setAvatarMode((current) => (current === "speaking" ? "idle" : current));
  }, []);

  // The visitor starts typing or speaking: TARA stops talking, as a person
  // would. She reads answers in full, so this is how a listener cuts her short.
  const interrupt = useCallback(() => {
    stopSpeaking();
    stopAvatarSpeech();
  }, [stopAvatarSpeech]);

  // Why voice input did not work, as a short message in the chat.
  const tellMicProblem = useCallback((problem: MicProblem, language: string) => {
    if (problem === "aborted") return;
    const text = MIC_MESSAGES[problem][language === "hi" ? "hi" : "en"];
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, { id: `mic-${Date.now()}`, role: "assistant" as const, content: text, timestamp: new Date(), language }],
    }));
  }, []);

  // ── Scroll to bottom ────────────────────────────────────────────────────
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "instant",
    });
  }, []);

  useEffect(() => {
    if (state.isOpen) {
      setTimeout(() => scrollToBottom(false), 50);
    }
  }, [state.messages, state.isOpen, scrollToBottom]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Open chat ──────────────────────────────────────────────────────────
  const handleOpen = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: true }));
    setHasUnread(false);

    // Add greeting if first time
    setState((prev) => {
      if (prev.messages.length === 0) {
        return {
          ...prev,
          isOpen: true,
          messages: [
            {
              id: "greeting",
              role: "assistant",
              content: INITIAL_GREETING,
              timestamp: new Date(),
              language: "en",
            },
          ],
        };
      }
      return { ...prev, isOpen: true };
    });

    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  // A link with ?open=1 (the TARA Online button on the HR portal) lands
  // straight in the conversation instead of on the page behind it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("open") === "1") handleOpen();
  }, [handleOpen]);

  const handleClose = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    stopSpeaking();
    stopAvatarSpeech();
    if (stopListeningRef.current) {
      stopListeningRef.current();
      setIsListening(false);
    }
  }, [stopAvatarSpeech]);

  useEffect(() => {
    if (!state.isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [handleClose, state.isOpen]);

  // ── Send message ──────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || state.isLoading) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date(),
        language: state.detectedLanguage,
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        isLoading: true,
        showLeadForm: false,
      }));
      setAvatarMode("thinking");
      setSpeechEnergy(0);
      setSpokenChars(null);
      setBlockedResume(null);
      stopSpeaking();
      nod(true);

      setInputValue("");

      try {
        const res = await fetch(withBase("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            sessionId: state.sessionId || undefined,
            language: state.detectedLanguage,
            stream: true,
          }),
        });

        // Sign-in expired (where it is required): reloading leads to the sign-in page.
        if (res.status === 401) {
          window.location.reload();
          return;
        }

        // TARA speaks every reply unless the visitor muted her.
        const speaker = isTTSEnabled
          ? new Speaker({
              language: state.detectedLanguage,
              onStart: () => setAvatarMode("speaking"),
              onEnergy: setSpeechEnergy,
              onSpokenChars: setSpokenChars,
              onEnd: stopAvatarSpeech,
              onBlocked: (resume) => setBlockedResume(() => () => {
                setBlockedResume(null);
                resume();
              }),
            })
          : null;
        const botId = `bot-${Date.now()}`;
        const showBot = (patch: Partial<Message>, extra: Partial<ChatState> = {}) =>
          setState((prev) => {
            const exists = prev.messages.some((m) => m.id === botId);
            const messages = exists
              ? prev.messages.map((m) => (m.id === botId ? { ...m, ...patch } : m))
              : [...prev.messages, { id: botId, role: "assistant" as const, content: "", timestamp: new Date(), language: prev.detectedLanguage, ...patch }];
            return { ...prev, messages, isLoading: false, ...extra };
          });
        const finishReply = (data: ChatReply) => {
          showBot(
            { content: data.message, language: data.detectedLanguage, intent: data.intent },
            {
              sessionId: data.sessionId,
              detectedLanguage: data.detectedLanguage,
              showLeadForm: data.suggestLeadCapture && state.leadFormShownForIntent !== data.intent,
              leadFormShownForIntent: data.suggestLeadCapture ? data.intent : state.leadFormShownForIntent,
            },
          );
          setAvatarMode((mode) => (mode === "thinking" ? "idle" : mode));
          if (!state.isOpen) setHasUnread(true);
        };

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/x-ndjson") && res.body) {
          // Streamed: the spoken line first (the voice starts on it), then the
          // written answer as it is written.
          let spokenLine = false;
          let written = "";
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let pending = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            const lines = pending.split("\n");
            pending = lines.pop() || "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const event = JSON.parse(line);
              if (event.type === "say") {
                spokenLine = true;
                setCaptionFollowsVoice(false);
                speaker?.push(event.text);
                speaker?.finish();
              } else if (event.type === "text") {
                written += event.text;
                showBot({ content: written });
                if (!spokenLine) {
                  setCaptionFollowsVoice(true);
                  speaker?.push(event.text);
                }
              } else if (event.type === "done") {
                if (!spokenLine) speaker?.finish();
                finishReply(event as ChatReply);
              } else if (event.type === "error") {
                throw new Error(event.error);
              }
            }
          }
        } else {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Chat request failed");
          finishReply(data as ChatReply);
          setCaptionFollowsVoice(!data.speech);
          speaker?.push(data.speech || data.message);
          speaker?.finish();
        }
      } catch (err) {
        console.error("Chat error:", err);
        stopSpeaking();
        setState((prev) => ({
          ...prev,
          isLoading: false,
          messages: [
            ...prev.messages,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              content:
                "I'm sorry, I encountered a connection issue. Please try again in a moment.",
              timestamp: new Date(),
              language: "en",
            },
          ],
        }));
        setAvatarMode("idle");
        setSpeechEnergy(0);
      }
    },
    [state.isLoading, state.sessionId, state.detectedLanguage, state.isOpen, state.leadFormShownForIntent, isTTSEnabled, stopAvatarSpeech, nod]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Inside the visitor's own click or Enter: lets the reply's voice play.
    unlockAudio();
    sendMessage(inputValue);
  };

  const handleLanguageChange = useCallback(
    (language: "en" | "hi") => {
      stopSpeaking();
      stopAvatarSpeech();
      stopListeningRef.current?.();
      stopListeningRef.current = null;
      setIsListening(false);
      setState((prev) => ({ ...prev, detectedLanguage: language }));
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    [stopAvatarSpeech]
  );

  // ── Voice Input ───────────────────────────────────────────────────────
  const handleMicToggle = useCallback(() => {
    unlockAudio(); // the reply to a spoken question is played without a further tap
    if (isListening) {
      settleMicRef.current?.(null);
      stopListeningRef.current?.();
      setIsListening(false);
      setAvatarMode("idle");
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      alert("Voice input is not supported in this browser. Please use Chrome.");
      return;
    }

    interrupt();
    setIsListening(true);
    setAvatarMode("listening");
    const language = state.detectedLanguage;
    // If the browser reports nothing at all — no words, no error, no end —
    // TARA used to sit on "Listening" for ever (RDC, 2026-10-18). Give up
    // after a while and say why, so a blocked microphone is never silent.
    let heard = false;
    let settled = false;
    const settle = (problem: MicProblem | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      setIsListening(false);
      setAvatarMode((current) => (current === "listening" ? "idle" : current));
      if (problem) tellMicProblem(problem, language);
    };
    settleMicRef.current = settle;
    // Only while nothing has been heard: a long question is never cut off.
    const watchdog = window.setTimeout(() => {
      if (heard) return;
      settle("silent");
      stopListeningRef.current?.();
    }, MIC_TIMEOUT_MS);
    let stop: (() => void) | null = null;
    try {
      stop = createSpeechRecognition(
        language,
        (result) => {
          heard = true;
          setInputValue(result.transcript);
          if (!result.isFinal) nod();
          if (result.isFinal && result.transcript.trim()) {
            settle(null);
            sendMessage(result.transcript.trim());
          }
        },
        (error) => {
          console.error("STT error:", error);
          settle(micProblem(error));
        },
        () => settle(heard ? null : "no-speech"),
      );
    } catch (error) {
      console.error("STT failed to start:", error);
      settle("unavailable");
    }
    stopListeningRef.current = stop;
  }, [isListening, state.detectedLanguage, sendMessage, nod, interrupt, tellMicProblem]);

  const langName = getLanguageName(state.detectedLanguage);
  const showVoice = process.env.NEXT_PUBLIC_ENABLE_VOICE_UI !== "false";

  return (
    <>
      {/* ── Chat Window ──────────────────────────────────────────────────── */}
      {state.isOpen && (
        <div className="saathi-fullscreen fixed inset-0 z-[100] animate-slide-up">
          <div
            className="flex flex-col w-full overflow-hidden"
            style={{
              height: "100dvh",
              background: "white",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #0F1E35 0%, #1B2A4A 60%, #243660 100%)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)",
                    boxShadow: "0 0 0 2px rgba(255,255,255,0.2)",
                  }}
                >
                  T
                </div>
                <div>
                  <div className="text-white font-semibold text-sm leading-tight">
                    TARA Online
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-300 text-xs">Online</span>
                    {state.detectedLanguage !== "en" && (
                      <span className="lang-badge ml-1">{langName}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* TTS Toggle */}
                <button
                  onClick={() => { unlockAudio(); toggleVoice(!isTTSEnabled); stopSpeaking(); stopAvatarSpeech(); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
                  title={isTTSEnabled ? "Mute voice" : "Enable voice"}
                >
                  {isTTSEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
                  aria-label="Close chat"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <SaathiAvatar
              mode={state.isLoading ? "thinking" : avatarMode}
              speechEnergy={speechEnergy}
              language={state.detectedLanguage}
              languageDisabled={state.isLoading}
              onLanguageChange={handleLanguageChange}
              // Her latest reply stays readable beside her even when the
              // WhatsApp card fills the message strip below.
              caption={state.isLoading ? null : [...state.messages].reverse().find((m) => m.role === "assistant")?.content ?? null}
              captionSpokenChars={captionFollowsVoice ? spokenChars : null}
              onTapToHear={blockedResume}
              nodSignal={nodSignal}
            />

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              className="saathi-chat-messages overflow-y-auto p-4"
              style={{ background: "#FAFBFC" }}
            >
              <div
                className="space-y-3"
                style={{ width: "100%", maxWidth: 880, margin: "0 auto" }}
              >
                {state.messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}

                {/* Quick Prompts after greeting */}
                {state.messages.length === 1 && !state.isLoading && (
                  <div className="animate-fade-in">
                    <p className="text-xs text-gray-400 mb-2 font-medium">Quick questions:</p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => sendMessage(prompt)}
                          className="quick-chip"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {state.isLoading && <TypingIndicator />}

                {/* Buying or complaining: hand over to RDC Tara on WhatsApp */}
                {state.showLeadForm && (
                  <div className="animate-fade-in">
                    <TaraWhatsAppCard
                      language={state.detectedLanguage}
                      onDismiss={() => setState((prev) => ({ ...prev, showLeadForm: false }))}
                    />
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Scroll to bottom button */}
            {showScrollBtn && (
              <button
                onClick={() => scrollToBottom()}
                className="absolute bottom-20 right-4 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-500 hover:text-orange-500 transition-colors z-10"
              >
                <ChevronDown size={16} />
              </button>
            )}

            {/* Input Area */}
            <div
              className="saathi-chat-input flex-shrink-0 p-3"
              style={{
                borderTop: "1px solid #E2E8F0",
                background: "white",
              }}
            >
              <form
                onSubmit={handleSubmit}
                className="saathi-chat-input-form flex items-center gap-2"
                style={{ width: "100%", maxWidth: 880, margin: "0 auto" }}
              >
                {showVoice && (
                  <button
                    type="button"
                    onClick={handleMicToggle}
                    className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      isListening
                        ? "bg-red-500 text-white shadow-lg scale-110"
                        : "bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-500"
                    }`}
                    title={isListening ? "Stop listening" : "Voice input"}
                  >
                    {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => { setInputValue(e.target.value); interrupt(); nodAfterTypingPause(e.target.value); }}
                  placeholder={
                    isListening
                      ? "Listening..."
                      : state.detectedLanguage === "en"
                      ? "Type your message..."
                      : "Message / संदेश लिखें..."
                  }
                  className="flex-1 rdc-input text-sm"
                  disabled={state.isLoading}
                  aria-label="Chat input"
                  id="chat-input"
                  style={{ background: "#F8FAFC" }}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || state.isLoading}
                  className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: inputValue.trim()
                      ? "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)"
                      : "#E2E8F0",
                    color: inputValue.trim() ? "white" : "#94A3B8",
                  }}
                  aria-label="Send message"
                  id="chat-send-btn"
                >
                  <Send size={16} />
                </button>
              </form>
              <p className="text-center text-gray-400 text-xs mt-2">
                Order or complaint?{" "}
                <a href={FACTS.tara.link} target="_blank" rel="noopener noreferrer" className="font-medium text-green-700 underline">
                  Chat with {FACTS.tara.name} on WhatsApp
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Launcher Button ───────────────────────────────────────────────── */}
      {!state.isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-5 right-4 md:right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #E85D04 0%, #F48C06 100%)",
            boxShadow: "0 4px 20px rgba(232, 93, 4, 0.4)",
            animation: "pulse-ring 2.5s infinite",
          }}
          aria-label="Open chat with TARA Online"
          id="chat-launcher"
        >
          <MessageSquareText size={22} />

          {/* Unread Badge */}
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
          )}
        </button>
      )}
    </>
  );
}
