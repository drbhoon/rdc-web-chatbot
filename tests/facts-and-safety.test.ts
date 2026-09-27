import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { FACTS, factsOfRecord } from "../src/lib/facts";
import { rateLimitedKey } from "../src/lib/rateLimit";
import { extractEmployeeName } from "../src/lib/employee/directory";

test("facts of record: the official website, numbers and plant count RDC gave", () => {
  const block = factsOfRecord();
  assert.equal(FACTS.website, "https://www.rdc.in");
  assert.match(block, /https:\/\/www\.rdc\.in/);
  assert.match(block, /\+91 22 6789 6789/);
  assert.match(block, /\+91 86579 40541/);
  assert.match(block, /141 ready-mix concrete plants/);
  assert.match(block, /113 commercial plants and 28 dedicated plants/);
  assert.match(block, /21 states, 2 union territories and 53 cities/);
  assert.doesNotMatch(block, /rdcconcrete/);
});

test("plant knowledge: every commercial plant, the count of record, nothing on dedicated plants", () => {
  const chunks = readFileSync("knowledge/public/commercial-plants.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(chunks.length, FACTS.plants.commercial + 1);
  const [overview, ...plants] = chunks;
  assert.match(overview.text, /operates 141 [\s\S]* 113 commercial plants [\s\S]* 28 dedicated plants/);
  assert.match(overview.text, /Details of dedicated plants are not shared/);
  assert.match(overview.text, /21 states, 2 union territories and 53 cities/);
  for (const plant of plants) {
    assert.match(plant.text, /^RDC commercial ready-mix concrete plant: /);
    assert.match(plant.text, /WhatsApp at \+91 86579 40541/);
    assert.doesNotMatch(plant.text, /captive|dedicated/i);
  }
  assert.equal(new Set(chunks.map((c) => c.id)).size, chunks.length, "chunk ids are unique");
  // "Region" is an internal RDC business unit, never a way to describe geography.
  for (const chunk of chunks) assert.doesNotMatch(JSON.stringify(chunk), /region/i);
});

test("per-chat rate limit: the 21st message in a minute is refused, another chat is not", () => {
  const chat = `test-${Date.now()}`;
  for (let i = 0; i < 20; i++) assert.equal(rateLimitedKey(chat, 20), false);
  assert.equal(rateLimitedKey(chat, 20), true);
  assert.equal(rateLimitedKey(`${chat}-other`, 20), false);
});

test("employee lookups start only from an explicit request for a person", () => {
  assert.equal(extractEmployeeName("Tell me about Asha Example"), "Asha Example");
  assert.equal(extractEmployeeName("Who is Asha Example?"), "Asha Example");
  // Questions about roles are not names.
  assert.equal(extractEmployeeName("Who is your managing director?"), null);
  assert.equal(extractEmployeeName("Who is the chairman"), null);
  assert.equal(extractEmployeeName("Tell me about the plant manager"), null);
  // A bare name or a PIN code is not a lookup request.
  assert.equal(extractEmployeeName("Asha Example"), null);
  assert.equal(extractEmployeeName("411045"), null);
  // Company topics stay company topics.
  assert.equal(extractEmployeeName("Tell me about Vision 2030"), null);
});
