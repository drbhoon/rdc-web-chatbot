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

test("listening leans the head to one side and holds it", () => {
  const motion = new AvatarMotion(seeded(3));
  run("idle", 5, 0, false, motion);
  const poses = run("listening", 6, 0, false, motion).slice(120);
  const mean = poses.reduce((n, p) => n + p.tilt, 0) / poses.length;
  assert.ok(Math.abs(mean) > 1.2, `mean tilt ${mean.toFixed(2)}`);
});

test("reduced motion: the head keeps still, blinking stays", () => {
  const poses = run("speaking", 30, 0.9, true);
  assert.ok(poses.every((p) => p.tilt === 0 && p.rise === 0 && p.turn === 0 && p.nod === 0 && p.breath === 0));
  assert.ok(poses.some((p) => p.blink > 0));
});

test("mouth frames follow loudness only while speaking", () => {
  assert.deepEqual(mouthTarget("idle", 0.9), [1, 0, 0]);
  assert.deepEqual(mouthTarget("speaking", 0.1), [1, 0, 0]);
  assert.deepEqual(mouthTarget("speaking", 0.4), [0, 1, 0]);
  assert.deepEqual(mouthTarget("speaking", 0.9), [0, 0, 1]);
});
