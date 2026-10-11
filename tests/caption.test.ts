import test from "node:test";
import assert from "node:assert/strict";
import { readableText, spokenExcerpt, takePieces } from "../src/lib/voice/voiceService";
import { captionSentences, currentSentence } from "../src/components/chat/SaathiAvatar";
import { speechInput } from "../src/lib/voice/speechInstructions";

test("the voice says Taara (तारा) and spells out R D C; the written text is untouched", () => {
  assert.equal(speechInput("Message RDC Tara on WhatsApp. I am TARA Online.", "en"), "Message R D C Taara on WhatsApp. I am Taara Online.");
  assert.equal(speechInput("WhatsApp पर RDC Tara को मैसेज करें।", "hi"), "WhatsApp पर R D C तारा को मैसेज करें।");
  // Only the name: other words containing "tara" are left alone.
  assert.equal(speechInput("Guitarist Tarak visited Taratala.", "en"), "Guitarist Tarak visited Taratala.");
});

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

test("the highlighted sentence follows the characters spoken", () => {
  // Sentences of 55, 33, 36 and 30 characters.
  assert.equal(currentSentence(reply, null), -1);
  assert.equal(currentSentence(reply, 0), 0);
  assert.equal(currentSentence(reply, 60), 1);
  assert.equal(currentSentence(reply, 100), 2);
  assert.equal(currentSentence(reply, 500), 3);
  assert.equal(captionSentences(reply).length, 4);
});

test("a reply still arriving is spoken in whole sentences, the first one early", () => {
  // The first piece goes as soon as one sentence of 40+ characters is complete.
  let {pieces, rest} = takePieces("RDC makes ready-mix concrete in 141 plants. It deliv", 40);
  assert.deepEqual(pieces, ["RDC makes ready-mix concrete in 141 plants."]);
  assert.equal(rest, " It deliv");
  // Never at a full stop that more text may follow ("Rs." then "5,000").
  ({pieces, rest} = takePieces("The price is about Rs.", 10));
  assert.deepEqual(pieces, []);
  // Short sentences gather into one piece of a natural length.
  ({pieces} = takePieces("Yes. RDC does. It is quick and clean to pour. ", 40));
  assert.deepEqual(pieces, ["Yes. RDC does. It is quick and clean to pour."]);
  // Hindi full stops count too.
  ({pieces} = takePieces("आप WhatsApp पर RDC Tara से बात कर सकते हैं। धन्यवाद", 20));
  assert.deepEqual(pieces, ["आप WhatsApp पर RDC Tara से बात कर सकते हैं।"]);
});
