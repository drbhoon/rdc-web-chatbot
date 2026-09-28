"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquareText, X, Mic, MicOff, Send, Volume2, VolumeX, ChevronDown } from "lucide-react";
import { getLanguageName, isRTL } from "@/lib/i18n/languageDetector";
import { isSpeechRecognitionSupported, createSpeechRecognition, speakText, stopSpeaking } from "@/lib/voice/voiceService";
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
  const [isTTSEnabled, setIsTTSEnabled] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("idle");
  const [speechEnergy, setSpeechEnergy] = useState(0);
  // How far TARA is through reading her latest reply (for the caption), or null.
  const [spokenProgress, setSpokenProgress] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);

  const stopAvatarSpeech = useCallback(() => {
    setSpeechEnergy(0);
    setSpokenProgress(null);
    setAvatarMode((current) => (current === "speaking" ? "idle" : current));
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
      setSpokenProgress(null);

      setInputValue("");

      try {
        const res = await fetch(withBase("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            sessionId: state.sessionId || undefined,
            language: state.detectedLanguage,
          }),
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Chat request failed");

        const botMsg: Message = {
          id: `bot-${Date.now()}`,
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
          language: data.detectedLanguage,
          intent: data.intent,
        };

        setState((prev) => ({
          ...prev,
          sessionId: data.sessionId,
          messages: [...prev.messages, botMsg],
          isLoading: false,
          detectedLanguage: data.detectedLanguage,
          showLeadForm: data.suggestLeadCapture && prev.leadFormShownForIntent !== data.intent,
          leadFormShownForIntent: data.suggestLeadCapture ? data.intent : prev.leadFormShownForIntent,
        }));

        // TTS
        if (isTTSEnabled) {
          const speechStarted = await speakText({
            text: data.message,
            language: data.detectedLanguage,
            onStart: () => setAvatarMode("speaking"),
            onEnergy: setSpeechEnergy,
            onProgress: setSpokenProgress,
            onBoundary: (event) => {
              const charLength = event.charLength || 4;
              setSpeechEnergy(Math.min(1, 0.25 + charLength / 12));
            },
            onEnd: stopAvatarSpeech,
          });
          if (!speechStarted) {
            stopAvatarSpeech();
          }
        } else {
          setAvatarMode("idle");
          setSpeechEnergy(0);
        }

        // Set unread if widget closed
        if (!state.isOpen) setHasUnread(true);
      } catch (err) {
        console.error("Chat error:", err);
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
    [state.isLoading, state.sessionId, state.detectedLanguage, state.isOpen, isTTSEnabled, stopAvatarSpeech]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    if (isListening) {
      stopListeningRef.current?.();
      setIsListening(false);
      setAvatarMode("idle");
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      alert("Voice input is not supported in this browser. Please use Chrome.");
      return;
    }

    setIsListening(true);
    setAvatarMode("listening");
    const stop = createSpeechRecognition(
      state.detectedLanguage,
      (result) => {
        setInputValue(result.transcript);
        if (result.isFinal && result.transcript.trim()) {
          sendMessage(result.transcript.trim());
          setIsListening(false);
        }
      },
      (error) => {
        console.error("STT error:", error);
        setIsListening(false);
        setAvatarMode("idle");
      },
      () => {
        setIsListening(false);
        setAvatarMode((current) => (current === "listening" ? "idle" : current));
      }
    );
    stopListeningRef.current = stop;
  }, [isListening, state.detectedLanguage, sendMessage]);

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
                  onClick={() => { setIsTTSEnabled(!isTTSEnabled); stopSpeaking(); stopAvatarSpeech(); }}
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
              captionProgress={spokenProgress}
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
                  onChange={(e) => setInputValue(e.target.value)}
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
