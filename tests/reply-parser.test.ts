import test from "node:test";
import assert from "node:assert/strict";
import { ReplyParser, parseReply } from "../src/lib/ai/replyParser";
import { keepBrandNamesInEnglish } from "../src/lib/ai/aiService";

/** Feeds a reply in small, awkward pieces, as a stream does. */
function stream(full: string, size = 3) {
  const parser = new ReplyParser(keepBrandNamesInEnglish);
  const says: string[] = [];
  const pieces: string[] = [];
  for (let i = 0; i < full.length; i += size) {
    const piece = parser.push(full.slice(i, i + size));
    if (piece.say) says.push(piece.say);
    if (piece.text) pieces.push(piece.text);
  }
  const last = parser.finish();
  if (last.text) pieces.push(last.text);
  return {parser, says, pieces};
}

test("the spoken line arrives first and on its own; the written answer follows", () => {
  const reply = "[[SAY: RDC has a plant in Whitefield, Bengaluru. The address is in the answer box.]]\nRDC's Whitefield plant:\n- Address: Plot 12, Whitefield, Bengaluru 560066.\nAnything else?";
  const {parser, says, pieces} = stream(reply);
  assert.deepEqual(says, ["RDC has a plant in Whitefield, Bengaluru. The address is in the answer box."]);
  assert.equal(parser.text, "RDC's Whitefield plant:\n- Address: Plot 12, Whitefield, Bengaluru 560066.\nAnything else?");
  assert.equal(pieces.join(""), "RDC's Whitefield plant:\n- Address: Plot 12, Whitefield, Bengaluru 560066.\nAnything else?");
  assert.ok(pieces.length > 1, "released in several pieces, not all at the end");
  assert.ok(!pieces.some((p) => p.includes("[[")), "no marker reaches the screen");
});

test("released text never splits a word, so brand fixes work in Hindi", () => {
  const {parser, pieces} = stream("[[SAY: आप आरडीसी तारा से बात करें।]] आप आरडीसी तारा से WhatsApp पर बात कर सकते हैं। धन्यवाद।", 2);
  assert.equal(parser.spoken, "आप RDC Tara से बात करें।");
  assert.equal(parser.text, "आप RDC Tara से WhatsApp पर बात कर सकते हैं। धन्यवाद।");
  assert.ok(pieces.every((p) => !/आरडीसी|तारा/.test(p)));
});

test("the unanswered marker is caught even when split across pieces", () => {
  const {parser} = stream("[[SAY: I could not find that.]] RDC's documents do not say. [[UNANSWERED]]", 4);
  assert.equal(parser.unanswered, true);
  assert.equal(parser.text, "RDC's documents do not say.");
});

test("a reply without a spoken line is written in full and has no SAY", () => {
  const plain = parseReply("RMC is made in a plant and delivered ready to pour. It is more consistent.");
  assert.equal(plain.say, null);
  assert.equal(plain.text, "RMC is made in a plant and delivered ready to pour. It is more consistent.");
  assert.equal(parseReply("[[").text, "[[");
  assert.deepEqual(parseReply("Hi"), {say: null, text: "Hi", unanswered: false});
});
