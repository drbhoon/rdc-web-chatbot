import test from "node:test";
import assert from "node:assert/strict";
import { pairQuestions, istDate, istHour, istDayWindow, previousDay, type LoggedMessage } from "../src/lib/review/pairs";
import { approvedFirst, type RetrievedChunk } from "../src/lib/knowledge/retrieval";
import { formatSource } from "../src/lib/ai/aiService";

const at = (hhmm: string) => new Date(`2026-09-27T${hhmm}:00+05:30`);
const msg = (sessionId: string, role: string, content: string, time: string, intent: string | null = null): LoggedMessage =>
  ({sessionId, role, content, language: "en", intent, createdAt: at(time)});

test("each question is paired with TARA's reply in the same chat, repeats merged", () => {
  const groups = pairQuestions([
    msg("a", "user", "How do I order?", "10:00"), msg("a", "assistant", "Message RDC Tara.", "10:00"),
    msg("b", "user", "how do  I ORDER?", "11:00"), msg("b", "assistant", "Message RDC Tara on WhatsApp.", "11:00"),
    msg("b", "user", "Price of M25?", "11:05"), msg("b", "assistant", "It depends on the grade.", "11:05"),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual([groups[0].question, groups[0].timesAsked, groups[0].botAnswer], ["How do I order?", 2, "Message RDC Tara on WhatsApp."]);
  assert.equal(groups[1].question, "Price of M25?");
});

test("employee lookups and language switches stay out of the e-mailed sheet", () => {
  const groups = pairQuestions([
    msg("a", "user", "Tell me about Asha Example", "10:00"), msg("a", "assistant", "Please enter your @rdc.in e-mail.", "10:00", "employee_directory"),
    msg("a", "user", "asha@rdc.in", "10:01"), msg("a", "assistant", "Code sent.", "10:01", "employee_directory"),
    msg("a", "user", "हिन्दी", "10:02"), msg("a", "assistant", "ठीक है", "10:02", "language_switch"),
    msg("a", "user", "Where is your head office?", "10:03"), msg("a", "assistant", "Thane.", "10:03"),
  ]);
  assert.deepEqual(groups.map((g) => g.question), ["Where is your head office?"]);
});

test("a question with no reply yet is left for later, not paired with the wrong chat", () => {
  const groups = pairQuestions([msg("a", "user", "Hello?", "23:59"), msg("b", "assistant", "Other chat.", "23:59")]);
  assert.equal(groups.length, 0);
});

test("days run midnight to midnight India time", () => {
  const {from, to} = istDayWindow("2026-09-27");
  assert.equal(from.toISOString(), "2026-09-26T18:30:00.000Z");
  assert.equal(to.toISOString(), "2026-09-27T18:30:00.000Z");
  assert.equal(istDate(new Date("2026-09-27T19:00:00Z")), "2026-09-28"); // 00:30 IST
  assert.equal(istHour(new Date("2026-09-28T02:30:00Z")), 8);
  assert.equal(previousDay("2026-10-01"), "2026-09-30");
  assert.throws(() => istDayWindow("27-09-2026"));
});

test("a refined answer outranks documents and is labelled for the model", () => {
  const chunk = (id: string, category: string, similarityScore: number): RetrievedChunk =>
    ({id, documentId: id, title: id, category, content: `${id} text`, score: 0, sourceType: "faq", similarityScore});
  const ordered = approvedFirst([chunk("doc", "company", 0.8), chunk("far", "approved_answers", 0.3), chunk("near", "approved_answers", 0.7)]);
  assert.deepEqual(ordered.map((c) => c.id), ["near", "doc", "far"]);
  assert.match(formatSource(ordered[0], 0), /^\[1\] APPROVED ANSWER \(written by RDC\): near text/);
  assert.match(formatSource(ordered[1], 1), /^\[2\] doc: doc text/);
});
