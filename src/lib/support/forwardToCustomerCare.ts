/**
 * A question TARA cannot answer also goes to customer care by e-mail, so someone
 * can pick it up even if the visitor never messages on WhatsApp.
 * Off unless TARA_FORWARD_TO is set: hr.rdcc.ai sets it, the Railway test bed
 * does not, so test chats never reach customer care.
 */
import { transport } from "@/lib/review/dailyReview";

export interface ForwardedQuestion { question: string; reply: string; askedBy?: string | null; language: string; sessionId: string }

export function forwardMail(to: string, q: ForwardedQuestion) {
  const firstLine = q.question.replace(/\s+/g, " ").trim();
  return {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    ...(q.askedBy ? {replyTo: q.askedBy} : {}),
    subject: `TARA Online could not answer: ${firstLine.length > 70 ? `${firstLine.slice(0, 70)}...` : firstLine}`,
    text: [
      "TARA Online could not answer this question and referred the visitor to RDC Tara on WhatsApp.",
      "",
      `Asked by: ${q.askedBy || "not signed in"}`,
      `Language: ${q.language}`,
      `Chat: ${q.sessionId}`,
      "",
      "Question:",
      q.question,
      "",
      "TARA's reply:",
      q.reply,
    ].join("\n"),
  };
}

/** Never fails the chat: a mail problem is logged and the visitor still gets the answer. */
export async function forwardUnanswered(q: ForwardedQuestion): Promise<void> {
  const to = process.env.TARA_FORWARD_TO?.trim();
  if (!to || !process.env.SMTP_HOST) return;
  try {
    await transport().sendMail(forwardMail(to, q));
  } catch (error) {
    console.error("[forward] could not e-mail customer care:", error);
  }
}
