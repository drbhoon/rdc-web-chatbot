/**
 * What makes the 2D avatar look alive: small head gestures (tilt, rise, nod,
 * a glance to the side), breathing, and blinks at irregular moments.
 *
 * update() is called once per animation frame and returns the pose to draw.
 * Gestures ride on critically damped springs, so each one eases in and out
 * the way a head does instead of snapping. Nothing here draws; see
 * LiveAvatarCanvas for that.
 *
 * Units: tilt and sway in degrees; rise, nod and turn as fractions of the
 * image height (rise < 0 lifts the head, nod > 0 dips it); breath -1..1;
 * blink 0 (open) .. 1 (closed).
 */

export type AvatarMode = "idle" | "listening" | "thinking" | "speaking";

export interface AvatarPose {
  tilt: number;
  rise: number;
  turn: number;
  nod: number;
  breath: number;
  sway: number;
  blink: number;
}

interface HeadPose {
  tilt: number;
  rise: number;
  turn: number;
}

const ZERO: HeadPose = { tilt: 0, rise: 0, turn: 0 };

// How far each gesture may go. A real head seldom tilts more than a few
// degrees in conversation; more than this reads as a cartoon.
export const LIMITS = { tilt: 5, rise: 0.02, turn: 0.012, nod: 0.01 };

class Spring {
  value = 0;
  private velocity = 0;
  step(goal: number, dt: number, omega: number): number {
    // Critically damped: reaches the goal smoothly, without overshoot.
    const accel = omega * omega * (goal - this.value) - 2 * omega * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

export class AvatarMotion {
  private t = 0;
  private readonly random: () => number;
  private readonly head = { tilt: new Spring(), rise: new Spring(), turn: new Spring() };
  private gesture: HeadPose = ZERO;
  private gestureEndsAt = 0;
  private nextGestureAt = 1.5;
  private side = 1;
  private lastMode: AvatarMode = "idle";

  private nodStartedAt = -10;
  private nodAmp = 0;
  private nodLength = 0.55;
  private energy = 0;
  private wasLoud = false;

  private nextBlinkAt = 1.2;
  private blinkStartedAt = -10;
  private secondBlinkAt = -1;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  private between(low: number, high: number): number {
    return low + (high - low) * this.random();
  }

  /** The resting head position each mode leans toward. */
  private modePose(mode: AvatarMode): HeadPose {
    switch (mode) {
      // Attentive: head inclined to one side, slightly forward.
      case "listening":
        return { tilt: 2.4 * this.side, rise: 0.003, turn: 0 };
      // Thinking: chin up, a glance away.
      case "thinking":
        return { tilt: -1.6 * this.side, rise: -0.008, turn: 0.005 * this.side };
      default:
        return ZERO;
    }
  }

  private startNod(amp: number, length = 0.55): void {
    this.nodStartedAt = this.t;
    this.nodAmp = amp;
    this.nodLength = length;
  }

  private maybeBlinkWithMovement(): void {
    // People often blink as the head starts to move.
    if (this.t - this.blinkStartedAt > 0.8 && this.random() < 0.35) this.nextBlinkAt = this.t;
  }

  private pickGesture(mode: AvatarMode): void {
    const speaking = mode === "speaking";
    const roll = this.random();
    let pose: HeadPose;
    if (mode === "listening") {
      // Listeners mostly hold still and nod now and then ("mm-hmm").
      if (roll < 0.6) this.startNod(this.between(0.003, 0.005), 0.6);
      pose = { tilt: this.between(-0.8, 0.8), rise: 0, turn: 0 };
    } else if (roll < 0.34) {
      this.side = this.random() < 0.5 ? -1 : 1;
      pose = { tilt: this.side * this.between(1.8, 3.4), rise: this.between(-0.002, 0.002), turn: 0 };
    } else if (roll < 0.56) {
      // Head rises a little: chin up, often with a small tilt.
      pose = { tilt: this.between(-1, 1), rise: -this.between(0.006, 0.012), turn: 0 };
    } else if (roll < 0.74) {
      pose = { tilt: this.between(-1.2, 1.2), rise: 0, turn: (this.random() < 0.5 ? -1 : 1) * this.between(0.004, 0.008) };
    } else if (roll < 0.88) {
      this.startNod(this.between(0.004, 0.007));
      pose = ZERO;
    } else {
      pose = ZERO; // back to neutral for a while
    }
    this.gesture = pose;
    const hold = speaking ? this.between(0.9, 2.2) : this.between(1.4, 3.2);
    this.gestureEndsAt = this.t + hold;
    this.nextGestureAt = this.gestureEndsAt + (speaking ? this.between(0.6, 2.2) : this.between(1.8, 5));
    this.maybeBlinkWithMovement();
  }

  private blinkAmount(speaking: boolean): number {
    if (this.t >= this.nextBlinkAt) {
      this.blinkStartedAt = this.t;
      this.secondBlinkAt = this.random() < 0.15 ? this.t + 0.26 : -1;
      this.nextBlinkAt = this.t + (speaking ? this.between(2.6, 5.8) : this.between(2.2, 5.4));
    }
    if (this.secondBlinkAt > 0 && this.t >= this.secondBlinkAt) {
      this.blinkStartedAt = this.t;
      this.secondBlinkAt = -1;
    }
    // 60 ms closing, 40 ms shut, 80 ms opening.
    const since = this.t - this.blinkStartedAt;
    if (since < 0.06) return since / 0.06;
    if (since < 0.1) return 1;
    if (since < 0.18) return 1 - (since - 0.1) / 0.08;
    return 0;
  }

  update(dtSeconds: number, mode: AvatarMode, speechEnergy: number, reducedMotion = false): AvatarPose {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
    this.t += dt;
    const t = this.t;
    const speaking = mode === "speaking";

    if (mode !== this.lastMode) {
      if (mode === "listening") this.side = this.random() < 0.5 ? -1 : 1;
      this.lastMode = mode;
      this.gesture = ZERO;
      this.nextGestureAt = t + this.between(0.8, 2);
      this.maybeBlinkWithMovement();
    }

    const blink = this.blinkAmount(speaking);
    if (reducedMotion) return { tilt: 0, rise: 0, turn: 0, nod: 0, breath: 0, sway: 0, blink };

    if (t >= this.nextGestureAt) this.pickGesture(mode);
    const gesture = t < this.gestureEndsAt ? this.gesture : ZERO;
    const base = this.modePose(mode);

    // Loudness, smoothed; a loud syllable after a pause earns an emphasis nod.
    this.energy += (Math.max(0, Math.min(1, speechEnergy)) - this.energy) * (1 - Math.exp(-dt / 0.12));
    const loud = speaking && this.energy > 0.68;
    if (loud && !this.wasLoud && t - this.nodStartedAt > 1.3 && this.random() < 0.55) {
      this.startNod(this.between(0.003, 0.006), 0.45);
    }
    this.wasLoud = loud;

    const omega = speaking ? 5 : 3.4;
    const tilt = this.head.tilt.step(base.tilt + gesture.tilt, dt, omega);
    const rise = this.head.rise.step(base.rise + gesture.rise, dt, omega);
    const turn = this.head.turn.step(base.turn + gesture.turn, dt, omega);

    // Never perfectly still: slow drift on incommensurate periods.
    const lively = speaking ? 1.4 : 1;
    const microTilt = lively * (0.45 * Math.sin(t * 0.41) + 0.25 * Math.sin(t * 1.07 + 1.1));
    const microRise = lively * 0.0015 * Math.sin(t * 0.53 + 0.4) - (speaking ? 0.0025 * this.energy : 0);
    const microTurn = lively * 0.0014 * Math.sin(t * 0.29 + 2);

    const sinceNod = t - this.nodStartedAt;
    const nod = sinceNod < this.nodLength ? this.nodAmp * Math.sin((Math.PI * sinceNod) / this.nodLength) : 0;

    const breathPeriod = speaking ? 3.4 : 4.4;
    const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
    return {
      tilt: clamp(tilt + microTilt, LIMITS.tilt),
      rise: clamp(rise + microRise, LIMITS.rise),
      turn: clamp(turn + microTurn, LIMITS.turn),
      nod: clamp(nod, LIMITS.nod),
      breath: Math.sin((2 * Math.PI * t) / breathPeriod),
      sway: 0.35 * Math.sin(t * 0.19 + 0.7),
      blink,
    };
  }
}
