import test from "node:test";
import assert from "node:assert/strict";
import { AvatarMotion, LIMITS, type AvatarMode, type AvatarPose } from "../src/lib/avatar/motion";
import { mouthTarget } from "../src/components/chat/LiveAvatarCanvas";

// A repeatable random sequence, so a failure can be replayed.
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function run(mode: AvatarMode, seconds: number, energy = 0, reduced = false, motion = new AvatarMotion(seeded(7))): AvatarPose[] {
  const poses: AvatarPose[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    const loud = mode === "speaking" ? energy * (0.5 + 0.5 * Math.sin(i / 4)) : 0;
    poses.push(motion.update(1 / 60, mode, loud, reduced));
  }
  return poses;
}

test("the head really moves: tilts and rises beyond the idle drift within a minute", () => {
  const poses = run("idle", 60);
  assert.ok(Math.max(...poses.map((p) => Math.abs(p.tilt))) > 1.8, "a visible tilt");
  assert.ok(Math.min(...poses.map((p) => p.rise)) < -0.005, "the head rises");
});

test("movement stays small and smooth: within limits, no jumps between frames", () => {
  for (const mode of ["idle", "listening", "thinking", "speaking"] as const) {
    const poses = run(mode, 90, 0.9);
    for (let i = 1; i < poses.length; i++) {
      const [a, b] = [poses[i - 1], poses[i]];
      assert.ok(Math.abs(b.tilt) <= LIMITS.tilt && Math.abs(b.rise) <= LIMITS.rise && Math.abs(b.turn) <= LIMITS.turn);
      assert.ok(Math.abs(b.tilt - a.tilt) < 0.35, `${mode}: tilt jumped at frame ${i}`);
      assert.ok(Math.abs(b.rise + b.nod - (a.rise + a.nod)) < 0.0012, `${mode}: head jumped at frame ${i}`);
    }
  }
});

test("blinks come at irregular intervals, 2-6 s apart", () => {
  const poses = run("idle", 120);
  const starts: number[] = [];
  poses.forEach((p, i) => { if (p.blink > 0 && (i === 0 || poses[i - 1].blink === 0)) starts.push(i / 60); });
  assert.ok(starts.length >= 18 && starts.length <= 60, `${starts.length} blinks in 2 minutes`);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(new Set(gaps.map((g) => g.toFixed(1))).size > 5, "not a fixed rhythm");
  assert.ok(poses.every((p) => p.blink >= 0 && p.blink <= 1));
});

test("listening: the head only nods — a clear nod every few seconds, nothing else moves", () => {
  const motion = new AvatarMotion(seeded(3));
  run("idle", 5, 0, false, motion);
  const poses = run("listening", 20, 0, false, motion).slice(120); // after the fade-in
  for (const p of poses) {
    assert.ok(Math.abs(p.tilt) < 0.05 && Math.abs(p.turn) < 0.0002 && Math.abs(p.rise) < 0.0002, "no tilt, turn or rise");
    assert.ok(Math.abs(p.sway) < 0.01 && Math.abs(p.breath) < 0.03, "no sway or breathing");
  }
  const starts = poses.filter((p, i) => i > 0 && p.pitch > 0 && poses[i - 1].pitch === 0).length;
  assert.ok(starts >= 4 && starts <= 8, `${starts} nods in 18 s`);
  const deepest = Math.max(...poses.map((p) => p.pitch + p.nod));
  assert.ok(deepest > 0.015 && deepest < 0.024, `visible but not pronounced: ${deepest.toFixed(3)}`);
});

test("reduced motion: the head keeps still, blinking stays", () => {
  const poses = run("speaking", 30, 0.9, true);
  assert.ok(poses.every((p) => p.tilt === 0 && p.rise === 0 && p.turn === 0 && p.nod === 0 && p.breath === 0));
  assert.ok(poses.some((p) => p.blink > 0));
});

test("the understanding nod: one clear forward nod with a soft blink at the bottom, then level again", () => {
  const motion = new AvatarMotion(seeded(11));
  run("idle", 3, 0, false, motion);
  motion.acknowledge();
  // The question is sent at once: the mode turns to "thinking", the nod still finishes.
  const poses = run("thinking", 3, 0, false, motion);
  const nod = poses.slice(0, 80);
  const pitch = nod.map((p) => p.pitch);
  assert.ok(Math.max(...pitch) > 0.012 && Math.max(...pitch) < 0.019, "the head pitches forward, visibly but gently");
  assert.ok(Math.max(...nod.map((p) => p.nod)) > 0.003, "and dips with it");
  // One smooth nod, not a bob: pitch rises to a single peak and comes back.
  const peaks = pitch.filter((d, i) => i > 0 && i < pitch.length - 1 && d > pitch[i - 1] && d >= pitch[i + 1]);
  assert.equal(peaks.length, 1);
  assert.ok(pitch.every((d, i) => i === 0 || Math.abs(d - pitch[i - 1]) < 0.002), "no jumps");
  // Quicker down than up.
  const peakAt = pitch.indexOf(Math.max(...pitch));
  assert.ok(peakAt < 40, `lowest at frame ${peakAt}`);
  // A slow, full blink at the bottom of the nod (never half-closed lids: they ghost).
  const closed = nod.filter((p) => p.blink === 1).length / 60;
  assert.ok(closed > 0.03, `eyes fully closed ${closed.toFixed(2)} s`);
  // Half-closed for no longer than an ordinary blink takes (it looks smudged).
  const half = nod.filter((p) => p.blink > 0.15 && p.blink < 0.85).length / 60;
  assert.ok(half < 0.14, `half-closed ${half.toFixed(2)} s`);
  const blinkAt = nod.findIndex((p) => p.blink === 1);
  assert.ok(Math.abs(blinkAt - peakAt) < 12, "the blink falls at the bottom of the nod");
  // No lean to the side while nodding.
  assert.ok(nod.every((p) => Math.abs(p.tilt) < 1.2), "no lean");
  // Repeated calls during the nod are ignored; afterwards the head is level again.
  motion.acknowledge();
  assert.equal(poses.at(-1)!.pitch, 0);
});

test("mouth frames follow loudness only while speaking", () => {
  assert.deepEqual(mouthTarget("idle", 0.9), [1, 0, 0]);
  assert.deepEqual(mouthTarget("speaking", 0.1), [1, 0, 0]);
  assert.deepEqual(mouthTarget("speaking", 0.4), [0, 1, 0]);
  assert.deepEqual(mouthTarget("speaking", 0.9), [0, 0, 1]);
});
