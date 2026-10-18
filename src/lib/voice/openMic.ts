/**
 * Open-mic voice input: tap once and TARA keeps listening, like a radio set,
 * until the visitor taps again (RDC, 2026-10-18: pressing the mic for every
 * question was cumbersome). What they say is sent as a question after a
 * short pause in their speech; then the mic pauses while TARA answers — so
 * she does not hear herself through the speakers — and listens again when
 * she has finished (the caller calls resume()).
 *
 * Browsers end speech recognition on their own every so often (silence, a
 * minute's limit, a network hiccup); while the mic is on it is restarted.
 * It turns itself off, and says why, after a stretch of silence, or at once
 * when the microphone is blocked or missing.
 */

export type MicProblem = "blocked" | "no-microphone" | "network" | "no-speech" | "silent" | "idle" | "unavailable";
export type MicState = "off" | "listening" | "paused";

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
export interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

export interface OpenMicOptions {
  /** BCP-47 language, e.g. en-IN or hi-IN. */
  lang: string;
  /** What has been heard of the current question so far (for the input box). */
  onHeard: (text: string) => void;
  /** A complete question: the speaker paused. The mic pauses itself after this. */
  onUtterance: (text: string) => void;
  onState: (state: MicState) => void;
  /** The mic turned itself off; the reason. */
  onProblem: (problem: MicProblem) => void;
  /** Silence after speech that ends a question. */
  pauseMs?: number;
  /** Nothing heard at all since the mic was turned on: probably no sound reaches it. */
  silentMs?: number;
  /** Nothing said for this long: the mic turns itself off. */
  idleMs?: number;
  /** For tests: the speech recognition to use. */
  createRecognition?: () => Recognition;
}

const FATAL_ERRORS: Record<string, MicProblem> = {
  "not-allowed": "blocked",
  "service-not-allowed": "blocked",
  "audio-capture": "no-microphone",
  network: "network",
};

export function browserRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export class OpenMic {
  private state: MicState = "off";
  private recognition: Recognition | null = null;
  private committed = "";
  private interim = "";
  private heardAny = false;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private quickEnds = 0;
  private startedAt = 0;
  private readonly pauseMs: number;
  private readonly silentMs: number;
  private readonly idleMs: number;

  constructor(private readonly options: OpenMicOptions) {
    this.pauseMs = options.pauseMs ?? 1800;
    this.silentMs = options.silentMs ?? 15_000;
    this.idleMs = options.idleMs ?? 60_000;
  }

  get current(): MicState {
    return this.state;
  }

  /** Turn the mic on and listen. */
  on(): void {
    if (this.state !== "off") return;
    this.heardAny = false;
    this.quickEnds = 0;
    this.listen();
  }

  /** Turn the mic off. */
  off(): void {
    this.clearTimers();
    this.committed = this.interim = "";
    this.halt();
    this.setState("off");
  }

  /** Stop listening for now (TARA is answering); the mic stays on. */
  pause(): void {
    if (this.state !== "listening") return;
    this.clearTimers();
    this.halt();
    this.setState("paused");
  }

  /** Listen again after TARA's answer, if the mic is still on. */
  resume(): void {
    if (this.state === "paused") this.listen();
  }

  private listen(): void {
    this.committed = this.interim = "";
    this.setState("listening");
    this.armQuietTimer();
    this.startRecognition();
  }

  private startRecognition(): void {
    let recognition: Recognition | null;
    try {
      recognition = (this.options.createRecognition ?? browserRecognition)();
    } catch {
      recognition = null;
    }
    if (!recognition) return this.fail("unavailable");
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.options.lang;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => this.heard(event);
    recognition.onerror = (event) => {
      const fatal = FATAL_ERRORS[event.error];
      if (fatal) this.fail(fatal);
      // "no-speech" and "aborted" are routine: the end handler restarts it.
    };
    recognition.onend = () => this.ended(recognition!);
    this.recognition = recognition;
    this.startedAt = Date.now();
    try {
      recognition.start();
    } catch {
      this.fail("unavailable");
    }
  }

  private heard(event: RecognitionEvent): void {
    if (this.state !== "listening") return;
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      if (!text) continue;
      if (result.isFinal) this.committed = `${this.committed} ${text}`.trim();
      else interim = `${interim} ${text}`.trim();
    }
    this.interim = interim;
    const sofar = `${this.committed} ${this.interim}`.trim();
    if (!sofar) return;
    this.heardAny = true;
    this.quickEnds = 0;
    this.options.onHeard(sofar);
    this.armQuietTimer();
    // The question ends when they pause.
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = setTimeout(() => this.flush(), this.pauseMs);
  }

  private flush(): void {
    this.sendTimer = null;
    const text = `${this.committed} ${this.interim}`.trim();
    this.committed = this.interim = "";
    if (!text || this.state !== "listening") return;
    this.pause();
    this.options.onUtterance(text);
  }

  private ended(recognition: Recognition): void {
    if (recognition !== this.recognition) return; // an older one, already replaced
    this.recognition = null;
    if (this.state !== "listening") return;
    // A browser that ends at once, again and again, cannot listen here.
    this.quickEnds = Date.now() - this.startedAt < 1000 ? this.quickEnds + 1 : 0;
    if (this.quickEnds >= 5) return this.fail("unavailable");
    setTimeout(() => {
      if (this.state === "listening" && !this.recognition) this.startRecognition();
    }, 250);
  }

  private armQuietTimer(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    const silentYet = !this.heardAny;
    this.quietTimer = setTimeout(() => this.fail(silentYet ? "silent" : "idle"), silentYet ? this.silentMs : this.idleMs);
  }

  private fail(problem: MicProblem): void {
    if (this.state === "off") return;
    this.off();
    this.options.onProblem(problem);
  }

  private halt(): void {
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    recognition.onresult = recognition.onerror = recognition.onend = null;
    try {
      (recognition.abort ?? recognition.stop).call(recognition);
    } catch { /* already stopped */ }
  }

  private clearTimers(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.sendTimer = this.quietTimer = null;
  }

  private setState(state: MicState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onState(state);
  }
}
