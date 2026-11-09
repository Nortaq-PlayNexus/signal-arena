// Core deterministic utilities: seeded RNG and the tiny MLP that powers
// LOCAL NEURAL mode. Real forward passes, real weights, every decision tick.

export type GameId = "pellet" | "stack" | "circuit" | "brawl";

export interface Option {
  /** Short human label, e.g. "GAS + RIGHT" — used by the live LLM uplink. */
  label: string;
  /** Fixed-length feature vector, roughly normalised to [-1, 1]. */
  feat: number[];
}

export interface HudCell {
  label: string;
  value: string;
  pct: number;
}

export interface GameInstance {
  id: GameId;
  playerCount: number;
  elapsed: number;
  timeLimit: number;
  update(dt: number, actions: number[]): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  options(i: number): Option[];
  describe(i: number): string;
  scores(): number[];
  alive(): boolean[];
  isOver(): boolean;
  hud(i: number): HudCell[];
  human(i: number, b: HumanButtons): void;
  /** called when a human pilot releases control back to the model */
  release?(i: number): void;
  /** broadcast camera, advanced during update() and read once per frame */
  camera?(): { x: number; y: number; zoom: number } | null;
  reset(seed: number): void;
  /** fx hooks the game uses for juice */
  shake(mag: number): void;
  burst(x: number, y: number, color: string, n: number, speed?: number): void;
  flash(color: string, alpha: number): void;
  log(msg: string): void;
}

export interface HumanButtons {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  a: boolean;
  b: boolean;
}

export const FEATURE_LEN = 14;

/** mulberry32 — small, fast, deterministic. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A genuinely small neural policy: 14 inputs -> 4-unit tanh hidden -> linear score.
 * The hidden rows are seeded from a hand-tuned prior vector plus per-model
 * perturbation, so each model in the roster behaves distinctly but sensibly.
 */
export class MLP {
  W1: number[][];
  b1: number[];
  W2: number[];
  prior: number[];

  constructor(seed: number, prior: number[]) {
    const rnd = makeRng(seed ^ 0x9e3779b9);
    // normalise the prior so hidden pre-activations land inside tanh's
    // responsive band instead of saturating to a coin flip
    const nrm = Math.sqrt(prior.reduce((s, p) => s + p * p, 0)) || 1;
    this.prior = prior;
    this.W1 = [];
    this.b1 = [];
    const H = 4;
    for (let h = 0; h < H; h++) {
      const row: number[] = [];
      for (let f = 0; f < FEATURE_LEN; f++) {
        const p = ((prior[f] ?? 0) / nrm) * 1.55;
        // row 0 tracks the prior closely; deeper rows drift further, giving variety
        const drift = h === 0 ? 0.18 : 0.32 + h * 0.16;
        row.push(p * (1 - drift) + (rnd() - 0.5) * drift * 1.6);
      }
      this.W1.push(row);
      this.b1.push((rnd() - 0.5) * 0.12);
    }
    this.W2 = [1, 0.42, 0.19, 0.075].map((v) => v * (0.86 + rnd() * 0.3));
  }

  forward(feat: number[]): number {
    let out = 0;
    for (let h = 0; h < 4; h++) {
      const row = this.W1[h];
      let z = this.b1[h];
      for (let f = 0; f < FEATURE_LEN; f++) z += row[f] * (feat[f] ?? 0);
      out += this.W2[h] * Math.tanh(z);
    }
    return out;
  }

  /** argmax over candidate options, with a little stochastic exploration */
  pick(opts: Option[], rnd: () => number, temperature: number, explore: number): number {
    if (opts.length === 0) return 0;
    if (rnd() < explore) return Math.floor(rnd() * opts.length);
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < opts.length; i++) {
      const s = this.forward(opts[i].feat) + (rnd() - 0.5) * temperature;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    return best;
  }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
