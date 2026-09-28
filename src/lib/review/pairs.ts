/**
 * Turning a day's chat log into question-and-answer pairs for the daily sheet.
 * Pure functions: no database, no clock, so they are tested directly.
 */
import { questionFingerprint } from "@/lib/knowledge/unanswered";

export interface LoggedMessage {
  sessionId: string;
  role: string;
  content: string;
  language: string;
  intent: string | null;
  createdAt: Date;
}

export interface QuestionGroup {
  fingerprint: string;
  question: string;
  language: string;
  timesAsked: number;
  /** The bot's answer the LAST time this was asked that day. */
  botAnswer: string;
  lastAskedAt: Date;
}

// Replies that are not answers to review: employee lookups stay private (the
// sheet is e-mailed), and a language switch is a button, not a question.
const PRIVATE_OR_MECHANICAL = new Set(["employee_directory", "language_switch"]);

/**
 * Pairs each visitor message with the bot's next reply in the same chat and
 * merges repeats of the same question. Messages must be in time order.
 */
export function pairQuestions(messages: LoggedMessage[]): QuestionGroup[] {
  const bySession = new Map<string, LoggedMessage[]>();
  for (const m of messages) {
    if (!bySession.has(m.sessionId)) bySession.set(m.sessionId, []);
    bySession.get(m.sessionId)!.push(m);
  }

  const groups = new Map<string, QuestionGroup>();
  for (const chat of bySession.values()) {
    for (let i = 0; i < chat.length; i++) {
      const asked = chat[i];
      if (asked.role !== "user" || !asked.content.trim()) continue;
      const reply = chat.slice(i + 1).find((m) => m.role !== "user");
      if (!reply || reply.role !== "assistant" || PRIVATE_OR_MECHANICAL.has(reply.intent || "")) continue;

      const fingerprint = questionFingerprint(asked.content);
      const seen = groups.get(fingerprint);
      if (!seen) {
        groups.set(fingerprint, {
          fingerprint, question: asked.content.trim(), language: asked.language, timesAsked: 1,
          botAnswer: reply.content, lastAskedAt: asked.createdAt,
        });
      } else {
        seen.timesAsked += 1;
        if (asked.createdAt >= seen.lastAskedAt) {
          seen.lastAskedAt = asked.createdAt;
          seen.botAnswer = reply.content;
        }
      }
    }
  }
  // Most-asked first: that is where a better answer helps most.
  return [...groups.values()].sort((a, b) => b.timesAsked - a.timesAsked || a.lastAskedAt.getTime() - b.lastAskedAt.getTime());
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's calendar date in India, as YYYY-MM-DD. */
export function istDate(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The hour of the day in India, 0-23. */
export function istHour(now: Date): number {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
}

/** Midnight-to-midnight India time for a YYYY-MM-DD day, as UTC instants. */
export function istDayWindow(day: string): {from: Date; to: Date} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new Error(`Not a date: ${day}`);
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
  return {from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000)};
}

/** The India-time day before the given one. */
export function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
