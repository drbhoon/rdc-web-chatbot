/**
 * The daily question-and-answer sheet: every question visitors asked the day
 * before, with the answer TARA gave, e-mailed as Excel to the reviewers in
 * DAILY_REVIEW_RECIPIENTS. Reviewers write a refined answer where needed and
 * upload the sheet in Admin; from then on TARA gives that answer.
 */
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { exportReview, type ReviewRow } from "@/lib/knowledge/reviewWorkbook";
import { pairQuestions, istDayWindow } from "./pairs";

// A reply can land a little after midnight for a question asked just before.
const REPLY_GRACE_MS = 5 * 60 * 1000;

export function reviewRecipients(): string[] {
  return (process.env.DAILY_REVIEW_RECIPIENTS || "").split(/[,;\s]+/).map((a) => a.trim()).filter(Boolean);
}

/**
 * Collects one India-time day's questions into the review table and returns
 * the sheet rows. Safe to run twice for the same day: existing questions only
 * get TARA's latest answer; nothing is counted twice.
 */
export async function collectDay(day: string): Promise<Array<ReviewRow & {askers: Record<string, number>}>> {
  const {from, to} = istDayWindow(day);
  const messages = await prisma.chatMessage.findMany({
    where: {createdAt: {gte: from, lt: new Date(to.getTime() + REPLY_GRACE_MS)}, role: {in: ["user", "assistant"]}},
    orderBy: [{sessionId: "asc"}, {createdAt: "asc"}],
    select: {sessionId: true, role: true, content: true, language: true, intent: true, createdAt: true, session: {select: {userEmail: true}}},
  });
  // Questions asked after midnight belong to the next day's sheet; only their
  // replies may run past it.
  const groups = pairQuestions(messages
    .filter((m) => m.role !== "user" || m.createdAt < to)
    .map(({session, ...m}) => ({...m, askerEmail: session.userEmail})));

  const rows: Array<ReviewRow & {askers: Record<string, number>}> = [];
  for (const g of groups) {
    const saved = await prisma.unansweredQuestion.upsert({
      where: {fingerprint: g.fingerprint},
      create: {
        fingerprint: g.fingerprint, question: g.question, language: g.language, reason: "daily_log",
        source: "daily", status: "logged", occurrences: g.timesAsked, botAnswer: g.botAnswer, lastAskedAt: g.lastAskedAt,
      },
      update: {botAnswer: g.botAnswer, lastAskedAt: g.lastAskedAt},
    });
    rows.push({
      id: saved.id, askedOn: day, question: saved.question, language: saved.language, occurrences: g.timesAsked,
      botAnswer: g.botAnswer, answer: saved.status === "answered" ? saved.answer : null, version: saved.version,
      askedBy: formatAskers(g.askedBy), askers: g.askedBy,
    });
  }
  return rows;
}

/** "a@rdc.in (2), b@rdc.in" — most frequent first. */
export function formatAskers(askedBy: Record<string, number>): string {
  return Object.entries(askedBy)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([email, n]) => (n > 1 ? `${email} (${n})` : email))
    .join(", ");
}

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS?.trim() && process.env.SMTP_FROM);
}

function transport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {user: process.env.SMTP_USER, pass: process.env.SMTP_PASS?.replace(/\s+/g, "")},
  });
}

function prettyDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});
}

/** Builds the e-mail for one day. Separate from sending so it can be checked without SMTP. */
export async function buildDailyMail(day: string, recipients: string[]) {
  const rows = await collectDay(day);
  // Who asked, across the whole day: one line per person with their count.
  const people: Record<string, number> = {};
  for (const row of rows) for (const [email, n] of Object.entries(row.askers)) people[email] = (people[email] || 0) + n;
  const askers = Object.entries(people).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const adminUrl = `${(process.env.APP_URL || "").replace(/\/$/, "")}/admin`;
  const asked = rows.reduce((n, r) => n + r.occurrences, 0);
  const subject = `TARA Online: ${rows.length} question${rows.length === 1 ? "" : "s"} for review, ${prettyDay(day)}`;
  const text = rows.length
    ? [
        `Visitors asked TARA Online ${asked} question${asked === 1 ? "" : "s"} on ${prettyDay(day)} (${rows.length} different). The attached sheet lists each with TARA's answer.`,
        ...(askers.length
          ? ["", `Asked by ${askers.length} ${askers.length === 1 ? "person" : "people"} (the sheet's 'Asked by' column shows who asked what):`,
              ...askers.map(([email, n]) => `  ${email}: ${n} question${n === 1 ? "" : "s"}`), ""]
          : [""]),
        "Where an answer can be better, write it in the yellow 'Refined answer' column and set Publish to YES.",
        `Then upload the sheet in TARA Online Admin > Knowledge${process.env.APP_URL ? ` (${adminUrl})` : ""}. TARA uses a published answer from then on.`,
        "",
        "Employee-directory conversations are not included.",
      ].join("\n")
    : `No questions were asked on TARA Online on ${prettyDay(day)}. Nothing to review.`;
  return {
    rows,
    message: {
      from: process.env.SMTP_FROM,
      to: recipients.join(", "),
      subject,
      text,
      attachments: rows.length
        ? [{filename: `TARA-Online-questions-${day}.xlsx`, content: Buffer.from(await exportReview(rows))}]
        : [],
    },
  };
}

export async function sendDailyReview(day: string): Promise<{questions: number; recipients: string[]}> {
  const recipients = reviewRecipients();
  if (!recipients.length) throw new Error("No reviewers configured (DAILY_REVIEW_RECIPIENTS).");
  if (!mailConfigured()) throw new Error("E-mail is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM).");
  const {rows, message} = await buildDailyMail(day, recipients);
  await transport().sendMail(message);
  return {questions: rows.length, recipients};
}
