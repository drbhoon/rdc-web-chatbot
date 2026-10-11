import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { FACTS, PLANT_LOCATIONS, factsOfRecord } from "../src/lib/facts";
import { rateLimitedKey } from "../src/lib/rateLimit";
import { bareEmployeeName, extractEmployeeName, isEmployeeContactRequest, isLeaderName } from "../src/lib/employee/directory";
import { keepBrandNamesInEnglish, mentionsTaraNumber, whatsAppReferral, withoutDiscontinued } from "../src/lib/ai/aiService";

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
  assert.match(block, /Founded: 1993/);
});

test("leadership is public: every EXCO member is in the facts of record, without the word region", () => {
  const block = factsOfRecord();
  // Names as in the HR portal's employee master.
  for (const name of ["Anil Kumar Banchhor", "Dr K S Bhoon", "Manish Modani", "Mohammad Adnan Khan", "Japjit Singh", "Dharmendra Kumar Jaiswal",
    "Naresh Chundoori", "Baskaran D", "Rajesh N", "Pretheesh Sukumaran", "Mangesh Garud", "Avijit Chaubey"]) assert.ok(block.includes(name), name);
  assert.match(block, /ReaDymix Concrete — the name says it all/);
  assert.match(block, /3,500 m³ of concrete per plant a month[^\n]*4,000 m³/);
  assert.equal(FACTS.leadership.businessHeads.length, 8);
  assert.doesNotMatch(block, /region/i);
  // Asked by name, a leader is answered from these facts, not the employee directory.
  assert.ok(isLeaderName("Anil Banchhor") && isLeaderName("Dr Bhoon") === false && isLeaderName("Adnan Khan") && isLeaderName("Rajesh N"));
  assert.equal(isLeaderName("Rajesh"), false, "a common first name alone could be anyone");
  assert.equal(isLeaderName("Anil Kumar"), false, "nor a first name and a common middle name");
  assert.equal(isLeaderName("Asha Example"), false);
});

test("an unanswered question ends with RDC Tara's WhatsApp number", () => {
  assert.match(whatsAppReferral("en"), /\+91 86579 40541/);
  assert.match(whatsAppReferral("hi"), /\+91 86579 40541/);
  assert.ok(mentionsTaraNumber("Message RDC Tara on +91 86579 40541."));
  assert.ok(mentionsTaraNumber("WhatsApp 8657940541"));
  assert.equal(mentionsTaraNumber("Call the head office on +91 22 6789 6789."), false);
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
  // The place list in every answer's facts matches the plant knowledge.
  assert.equal(PLANT_LOCATIONS.reduce((n, l) => n + l.plants, 0), FACTS.plants.commercial);
  const counted = new Map<string, number>();
  for (const plant of plants) counted.set(plant.metadata.location, (counted.get(plant.metadata.location) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(counted), Object.fromEntries(PLANT_LOCATIONS.map((l) => [l.name, l.plants])));
  assert.match(factsOfRecord(), /Commercial plant locations[^\n]*Bengaluru \(12\)/);
  // "Region" is an internal RDC business unit, never a way to describe geography.
  for (const chunk of chunks) assert.doesNotMatch(JSON.stringify(chunk), /region/i);
});

test("brand names stay in English letters in Hindi replies", () => {
  assert.equal(
    keepBrandNamesInEnglish("आरडीसी कंक्रीट 21 राज्यों में है। RDC तारा से संपर्क करें।"),
    "RDC Concrete 21 राज्यों में है। RDC Tara से संपर्क करें।",
  );
  // The ordinary word for star is left alone.
  assert.equal(keepBrandNamesInEnglish("आसमान में एक तारा है"), "आसमान में एक तारा है");
  assert.equal(keepBrandNamesInEnglish("मैं तारा ऑनलाइन हूं"), "मैं TARA Online हूं");
});

test("the discontinued Customer Connect app never reaches the model", () => {
  const excerpt = "Digital tools:\nRDCTrak tracks every mixer. The Customer Connect App handles orders. QMS covers quality.\n- RDC Customer-Connect: online order management\nERP runs finance.";
  const cleaned = withoutDiscontinued(excerpt);
  assert.doesNotMatch(cleaned, /customer[\s-]*connect/i);
  assert.match(cleaned, /RDCTrak tracks every mixer\. QMS covers quality\./);
  assert.match(cleaned, /ERP runs finance\./);
  assert.equal(withoutDiscontinued("Nothing to remove."), "Nothing to remove.");
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
  // "at RDC" says where the person works (asked on 2026-10-10 and missed).
  assert.equal(extractEmployeeName("Can you tell me about the employee Kanhaiya at RDC ?"), "Kanhaiya");
  assert.equal(extractEmployeeName("Tell me about Asha Example of RDC Concrete"), "Asha Example");
  assert.equal(extractEmployeeName("Who is Kanhaiya at RDC?"), "Kanhaiya");
  assert.equal(extractEmployeeName("Tell me about products of RDC"), null);
  assert.equal(extractEmployeeName("Tell me about ready mix of RDC"), null);
  assert.equal(extractEmployeeName("Who is the CEO of RDC?"), null);
  assert.equal(extractEmployeeName("Can you tell me about RDC Management? who are key persons?"), null);
});

test("asking for an employee's phone, e-mail or address gets the directory offer, not the model", () => {
  assert.ok(isEmployeeContactRequest("Tell me his email id and phone no"));
  assert.ok(isEmployeeContactRequest("Can you provide the personal mobile number or  home address of some of the employees?"));
  assert.equal(isEmployeeContactRequest("What is the head office phone number?"), false);
  assert.equal(isEmployeeContactRequest("Give me the address of the Kalyan plant"), false);
  assert.equal(isEmployeeContactRequest("How many employees does RDC have?"), false);
});

test("a message that is just a name is a lookup; greetings, places and products are not", () => {
  assert.equal(bareEmployeeName("Asha Example"), "Asha Example");
  assert.equal(bareEmployeeName("asha example"), "asha example");
  assert.equal(bareEmployeeName("Asha K. Example?"), "Asha K. Example");
  for (const notAName of [
    "Good morning", "Thank you", "Ready mix", "Navi Mumbai", "Greater Noida", "Mysore Road", "Tamil Nadu",
    "What is RMC", "M25 grade", "411045", "RDC Tara", "Vision 2030", "Price list", "Hello there", "asha@rdc.in",
    "Delhi NCR", "Tell me about the company and its plants in Pune please",
  ]) assert.equal(bareEmployeeName(notAName), null, notAName);
  // One word is too easily a city or a greeting — unless the chat is already verified.
  assert.equal(bareEmployeeName("Rahul"), null);
  assert.equal(bareEmployeeName("Rahul", true), "Rahul");
  assert.equal(bareEmployeeName("Hello", true), null);
  assert.equal(bareEmployeeName("Hadapsar", true), null);
});
