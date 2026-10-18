import test from "node:test";
import assert from "node:assert/strict";
import { OpenMic, type MicProblem, type MicState, type Recognition } from "../src/lib/voice/openMic";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A stand-in for the browser's speech recognition that the test talks into. */
class FakeRecognition implements Recognition {
  static all: FakeRecognition[] = [];
  continuous = false; interimResults = false; lang = ""; maxAlternatives = 1;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  started = false; stopped = false;
  private results: Array<{ isFinal: boolean; 0: { transcript: string } }> = [];
  constructor() { FakeRecognition.all.push(this); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.stopped = true; }
  say(text: string, isFinal: boolean) {
    const index = this.results.length && !this.results.at(-1)!.isFinal ? this.results.length - 1 : this.results.length;
    this.results[index] = { isFinal, 0: { transcript: text } };
    this.onresult?.({ resultIndex: index, results: this.results });
  }
  end() { this.onend?.(); }
}
const latest = () => FakeRecognition.all.at(-1)!;

function mic(overrides: Partial<ConstructorParameters<typeof OpenMic>[0]> = {}) {
  FakeRecognition.all = [];
  const log = { heard: [] as string[], asked: [] as string[], states: [] as MicState[], problems: [] as MicProblem[] };
  const m = new OpenMic({
    lang: "en-IN",
    onHeard: (t) => log.heard.push(t),
    onUtterance: (t) => log.asked.push(t),
    onState: (s) => log.states.push(s),
    onProblem: (p) => log.problems.push(p),
    pauseMs: 60, silentMs: 400, idleMs: 600,
    createRecognition: () => new FakeRecognition(),
    ...overrides,
  });
  return { m, log };
}

test("open mic: a question is sent when the speaker pauses, however long they talk", async () => {
  const { m, log } = mic();
  m.on();
  assert.equal(m.current, "listening");
  assert.ok(latest().continuous && latest().started);
  latest().say("I want to know", false);
  latest().say("I want to know about", false);
  await wait(30); // still talking: nothing sent yet
  latest().say("I want to know about MPU", true);
  latest().say("and who is eligible", false);
  assert.deepEqual(log.asked, []);
  await wait(100);
  assert.deepEqual(log.asked, ["I want to know about MPU and who is eligible"]);
  assert.equal(log.heard.at(-1), "I want to know about MPU and who is eligible");
  assert.equal(m.current, "paused", "the mic pauses while TARA answers");
  assert.ok(latest().stopped);
});

test("open mic: listens again after TARA's answer, and stays on until turned off", async () => {
  const { m, log } = mic();
  m.on();
  latest().say("how many plants", true);
  await wait(100);
  assert.equal(m.current, "paused");
  m.resume();
  assert.equal(m.current, "listening");
  assert.equal(FakeRecognition.all.length, 2);
  latest().say("and in Pune", true);
  await wait(100);
  assert.deepEqual(log.asked, ["how many plants", "and in Pune"]);
  m.off();
  assert.equal(m.current, "off");
  m.resume();
  assert.equal(m.current, "off", "resume does not turn a switched-off mic on");
});

test("open mic: the browser ending recognition by itself is restarted while the mic is on", async () => {
  const { m } = mic();
  m.on();
  const first = latest();
  await wait(20);
  first.end();
  await wait(300);
  assert.equal(FakeRecognition.all.length, 2, "restarted");
  assert.notEqual(latest(), first);
  assert.equal(m.current, "listening");
  m.off();
});

test("open mic: a blocked or missing microphone turns it off and says why", async () => {
  for (const [error, problem] of [["not-allowed", "blocked"], ["audio-capture", "no-microphone"], ["network", "network"]] as const) {
    const { m, log } = mic();
    m.on();
    latest().onerror?.({ error });
    assert.equal(m.current, "off");
    assert.deepEqual(log.problems, [problem]);
  }
  const { m, log } = mic();
  m.on();
  latest().onerror?.({ error: "no-speech" });
  assert.equal(m.current, "listening", "a routine no-speech is not a problem");
  assert.deepEqual(log.problems, []);
  m.off();
});

test("open mic: nothing heard at all turns it off as 'silent'; silence after talking as 'idle'", async () => {
  const silent = mic();
  silent.m.on();
  await wait(500);
  assert.equal(silent.m.current, "off");
  assert.deepEqual(silent.log.problems, ["silent"]);

  const idle = mic();
  idle.m.on();
  latest().say("hello", true);
  await wait(100);
  idle.m.resume();
  await wait(700);
  assert.equal(idle.m.current, "off");
  assert.deepEqual(idle.log.problems, ["idle"]);
});
