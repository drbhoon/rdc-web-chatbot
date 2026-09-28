import test from "node:test";
import assert from "node:assert/strict";
import { readableText, spokenExcerpt } from "../src/lib/voice/voiceService";
import { captionSentences, currentSentence } from "../src/components/chat/SaathiAvatar";

const reply = [
  "RDC Concrete (India) Limited makes ready-mix concrete.",
  "",
  "- **Plants**: 141 plants across India.",
  "- **Help**: message [RDC Tara](https://wa.me/918657940541) on WhatsApp.",
  "",
  "Anything else I can help with?",
].join("\n");

test("the caption reads like the voice: no markdown, links or list markers", () => {
  assert.equal(
    readableText(reply),
    "RDC Concrete (India) Limited makes ready-mix concrete. Plants: 141 plants across India. Help: message RDC Tara on WhatsApp. Anything else I can help with?",
  );
});

test("what the voice reads is the start of what the caption shows, so the highlight lines up", () => {
  const long = Array.from({length: 40}, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
  const spoken = spokenExcerpt(long);
  assert.ok(spoken.length < readableText(long).length && spoken.length <= 560);
  assert.ok(readableText(long).startsWith(spoken));
  assert.equal(captionSentences(long).join(""), readableText(long));
});

test("the highlighted sentence follows the voice", () => {
  assert.equal(currentSentence(reply, null), -1);
  assert.equal(currentSentence(reply, 0), 0);
  assert.equal(currentSentence(reply, 0.5), 1);
  assert.equal(currentSentence(reply, 0.6), 2);
  assert.equal(currentSentence(reply, 0.99), 3);
  assert.equal(captionSentences(reply).length, 4);
});
