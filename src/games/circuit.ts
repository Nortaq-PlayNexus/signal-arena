import { FEATURE_LEN, clamp, type HumanButtons, type Option } from "@/core/engine";
import type { FX } from "@/core/fx";
import { drawTiled, TEX } from "@/core/textures";
import { BaseGame } from "./base";

// ---------------------------------------------------------------------------
// CIRCUIT — top-down kart race on a closed ribbon of road. Boost pads, contact
// physics, three laps.
// ---------------------------------------------------------------------------

const N = 128;
const HALF = 68;
const CX = 480;
const CY = 268;
const RX = 318;
const RY = 192;
const MAXV = 306;
const ACC = 330;
const BRAKE = 430;
const DRAG = 0.72;
const TURN = 2.75;
const LAPS = 3;

const ACT = ["GAS + LEFT", "GAS + STRAIGHT", "GAS + RIGHT", "BRAKE", "DRIFT + LEFT"];

const PRIOR = [1.0, 0.55, 0.78, 0.72, 0.85, 0.35, 0.28, 0.18, 0.52, 0.26, 0.3, 0.36, 0, 0];

interface Kart {
  x: number;
  y: number;
  h: number;
  v: number;
  wp: number;
  lap: number;
  score: number;
  off: number;
  boost: number;
  hit: number;
  alive: boolean;
  finished: number;
  trail: number;
}

export class CircuitGame extends BaseGame {
  id = "circuit" as const;
  timeLimit = 118;
  private karts: Kart[] = [];
  private wx: number[] = [];
  private wy: number[] = [];
  private tx: number[] = [];
  private ty: number[] = [];
  private boosts: number[] = [10, 44, 78, 104];
  private humanAct: number[] = [];
  private humanFlag: boolean[] = [];
  private camX = 480;
  private camY = 268;
  private camZ = 1.12;
  private camPunch = 0;

  camera() {
    return { x: this.camX, y: this.camY, zoom: this.camZ * (1 + this.camPunch * 0.1) };
  }

  private advanceCamera(dt: number) {
    if (this.karts.length === 0) return;
    const ranked = [...this.karts].sort((a, b) => b.lap * N + b.wp - (a.lap * N + a.wp));
    const a = ranked[0];
    const b = ranked[1] ?? ranked[0];
    const tx = (a.x + b.x) / 2;
    const ty = (a.y + b.y) / 2;
    const spread = Math.hypot(a.x - b.x, a.y - b.y);
    const tz = clamp(1.44 - spread / 1500, 1.06, 1.36);
    const k = 1 - Math.pow(0.0018, dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.camZ += (tz - this.camZ) * k;
    this.camPunch = Math.max(0, this.camPunch - dt * 2.1);
  }

  constructor(n: number, colors: string[], fx: FX, logger: (m: string) => void, seed = 3) {
    super(n, colors, fx, logger);
    this.buildTrack();
    this.reset(seed);
  }

  private buildTrack() {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 1 + 0.3 * Math.sin(2 * a) + 0.15 * Math.cos(3 * a);
      this.wx.push(CX + RX * r * Math.cos(a));
      this.wy.push(CY + RY * r * Math.sin(a));
    }
    for (let i = 0; i < N; i++) {
      const p = (i + 1) % N;
      const m = (i - 1 + N) % N;
      const dx = this.wx[p] - this.wx[m];
      const dy = this.wy[p] - this.wy[m];
      const l = Math.hypot(dx, dy) || 1;
      this.tx.push(dx / l);
      this.ty.push(dy / l);
    }
  }

  reset(_seed = 3) {
    this.elapsed = 0;
    this.karts = [];
    this.humanAct = [];
    this.humanFlag = [];
    for (let i = 0; i < this.playerCount; i++) {
      const wp = (N - 4 - i * 7 + N) % N;
      this.karts.push({
        x: this.wx[wp],
        y: this.wy[wp],
        h: Math.atan2(this.ty[wp], this.tx[wp]),
        v: 0,
        wp,
        lap: 0,
        score: 0,
        off: 0,
        boost: 0,
        hit: 0,
        alive: true,
        finished: 0,
        trail: 0,
      });
    }
  }

  private nearest(k: Kart) {
    let best = k.wp;
    let bd = Infinity;
    for (let d = -10; d <= 12; d++) {
      const i = (k.wp + d + N) % N;
      const dx = this.wx[i] - k.x;
      const dy = this.wy[i] - k.y;
      const dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    k.wp = best;
    return Math.sqrt(bd);
  }

  private step(k: Kart, act: number, dt: number) {
    const steer = act === 0 ? -1 : act === 2 ? 1 : act === 4 ? -1.45 : act === 3 ? -0.55 : 0;
    const gas = act === 3 ? 0 : 1;
    const brake = act === 3 ? 1 : 0;

    const grip = k.off > 0 ? 0.62 : 1;
    k.h += steer * TURN * dt * clamp(k.v / 120, 0.18, 1.25) * grip;

    let accel = gas * ACC * (k.boost > 0 ? 1.75 : 1);
    accel -= brake * BRAKE;
    accel -= k.v * DRAG * (k.off > 0 ? 2.6 : 1);
    k.v = clamp(k.v + accel * dt, 0, k.boost > 0 ? MAXV * 1.32 : MAXV);

    k.x += Math.cos(k.h) * k.v * dt;
    k.y += Math.sin(k.h) * k.v * dt;

    const d = this.nearest(k);
    k.off = d > HALF ? 1 : 0;
    if (k.off && k.v > MAXV * 0.62) k.v *= 0.982;

    // lap progression
    const target = (k.wp + 2) % N;
    if (target < 6 && k.wp > N - 8 && k.v > 40) {
      k.lap++;
      if (k.lap >= LAPS && !k.finished) {
        k.finished = this.elapsed;
        k.score += 220;
        this.log(`CHECKERED FLAG — lap ${LAPS} complete`);
        this.shake(8);
      }
    }
    return d;
  }

  update(dt: number, actions: number[]) {
    this.elapsed += dt;
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      if (k.finished) {
        k.score += dt * 6;
        k.v *= 0.985;
        k.x += Math.cos(k.h) * k.v * dt;
        k.y += Math.sin(k.h) * k.v * dt;
        continue;
      }
      k.boost = Math.max(0, k.boost - dt);
      k.hit = Math.max(0, k.hit - dt);
      const before = k.wp + k.lap * N;
      const lapBefore = k.lap;
      const finBefore = k.finished;
      const act = this.humanFlag[i] ? this.humanAct[i] : actions[i] >= 0 && actions[i] < 5 ? actions[i] : 1;
      this.step(k, act, dt);
      const after = k.wp + k.lap * N;
      const gain = after - before;
      k.score += Math.max(0, gain) * 0.85;
      const col = this.colors[i % this.colors.length];

      if (k.lap > lapBefore && k.lap <= LAPS) {
        this.sound("lap");
        this.fx.text(k.x, k.y - 34, `LAP ${k.lap}/${LAPS}`, col, 20);
        this.fx.banner(
          `LAP ${k.lap} OF ${LAPS}`,
          col,
          `player ${i + 1} crosses the line — ${LAPS - k.lap} to go`,
        );
      }
      if (k.finished && !finBefore) {
        this.sound("flag");
        this.camPunch = 1;
        this.fx.banner("CHECKERED FLAG", col, `player ${i + 1} finishes the race`);
      }

      // boost pads
      for (const b of this.boosts) {
        const dx = this.wx[b] - k.x;
        const dy = this.wy[b] - k.y;
        if (dx * dx + dy * dy < 46 * 46 && k.boost <= 0) {
          k.boost = 1.15;
          this.burst(k.x, k.y, "#FFB020", 16, 240);
          this.shake(3.2);
          this.sound("boost", 0.85);
          this.fx.text(k.x, k.y - 30, "BOOST", "#FFB020", 15);
          this.camPunch = Math.max(this.camPunch, 0.55);
        }
      }

      // slipstream — sitting in another kart's wake hands you free speed
      for (let o = 0; o < this.karts.length; o++) {
        if (o === i) continue;
        const q = this.karts[o];
        const dx = q.x - k.x;
        const dy = q.y - k.y;
        const dd = Math.hypot(dx, dy);
        if (dd > 96 || dd < 6) continue;
        const dot = (dx * Math.cos(k.h) + dy * Math.sin(k.h)) / dd;
        if (dot > 0.82) {
          k.v = Math.min(MAXV * 1.22, k.v + 122 * dt);
          if (Math.random() < dt * 9) this.fx.trail(k.x, k.y, "#6EA8FE", 0, 0);
        }
      }

      // exhaust + off-road dust
      k.trail -= dt;
      if (k.trail <= 0 && k.v > 60) {
        k.trail = 0.032;
        const back = k.h + Math.PI;
        this.fx.trail(
          k.x + Math.cos(back) * 14,
          k.y + Math.sin(back) * 14,
          k.boost > 0 ? "#FFD27A" : k.off ? "#6b6357" : "rgba(255,255,255,0.5)",
          Math.cos(back) * 40,
          Math.sin(back) * 40,
        );
      }

      if (k.off && Math.random() < dt * 26) {
        this.fx.trail(k.x, k.y, "#7d7261", (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90);
      }
    }

    this.advanceCamera(dt);

    // kart-to-kart contact
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i];
        const b = this.karts[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dd = Math.hypot(dx, dy);
        if (dd > 30 || dd < 0.001) continue;
        const nx = dx / dd;
        const ny = dy / dd;
        const overlap = 30 - dd;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
        const rel = a.v - b.v;
        a.v *= 0.93;
        b.v *= 1.03;
        if (Math.abs(rel) > 90) {
          this.burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#FFD27A", 12, 220);
          this.shake(Math.min(7, Math.abs(rel) / 42));
          a.hit = 0.35;
          b.hit = 0.35;
          this.sound("hit", Math.min(1.3, Math.abs(rel) / 150));
          this.camPunch = Math.max(this.camPunch, 0.7);
          this.fx.text((a.x + b.x) / 2, (a.y + b.y) / 2 - 26, "CONTACT", "#FFD27A", 13);
        }
      }
    }
  }

  scores() {
    return this.karts.map((k) => Math.round(k.score));
  }
  alive() {
    return this.karts.map(() => true);
  }
  hud(i: number) {
    const k = this.karts[i];
    const prog = clamp((k.lap + k.wp / N) / LAPS, 0, 1);
    return [
      { label: "SCORE", value: String(Math.round(k.score)).padStart(4, "0"), pct: clamp(k.score / 900, 0, 1) },
      { label: "LAP", value: `${Math.min(LAPS, k.lap + 1)}/${LAPS}`, pct: prog },
      { label: "SPEED", value: String(Math.round(k.v * 0.72)).padStart(3, "0"), pct: k.v / (MAXV * 1.32) },
      { label: "GRIP", value: k.off ? "DIRT" : "TARMAC", pct: k.off ? 0.25 : 1 },
    ];
  }

  human(i: number, b: HumanButtons) {
    // human input maps directly onto the 5-action space
    if (!this.karts[i]) return;
    this.humanAct[i] = b.down ? 3 : b.left ? 0 : b.right ? 2 : b.a ? 4 : 1;
    this.humanFlag[i] = true;
  }

  release(i: number) {
    this.humanFlag[i] = false;
  }

  // ---------------- decision features ----------------
  private featuresFor(i: number, act: number): number[] {
    const src = this.karts[i];
    const k: Kart = {
      x: src.x,
      y: src.y,
      h: src.h,
      v: src.v,
      wp: src.wp,
      lap: src.lap,
      score: 0,
      off: src.off,
      boost: src.boost,
      hit: 0,
      alive: true,
      finished: 1, // simulation copy must never trigger a real finish event
      trail: 0,
    };
    for (let s = 0; s < 3; s++) this.step(k, act, 0.12);
    const d = this.nearest(k);
    const ti = k.wp;
    const align = this.tx[ti] * Math.cos(k.h) + this.ty[ti] * Math.sin(k.h);

    let collision = 0;
    let leaderGap = 0;
    for (let o = 0; o < this.karts.length; o++) {
      if (o === i) continue;
      const q = this.karts[o];
      const dd = Math.hypot(q.x - k.x, q.y - k.y);
      const ahead = (q.x - k.x) * Math.cos(k.h) + (q.y - k.y) * Math.sin(k.h);
      if (dd < 78 && ahead > -10) collision = -1;
      leaderGap = Math.max(leaderGap, q.score - src.score);
    }

    let boostNear = 0;
    for (const b of this.boosts) {
      const dd = Math.hypot(this.wx[b] - k.x, this.wy[b] - k.y);
      boostNear = Math.max(boostNear, 1 - clamp(dd / 240, 0, 1));
    }

    const cur = (src.wp + 4) % N;
    const next = (src.wp + 12) % N;
    const curvature = this.tx[cur] * this.tx[next] + this.ty[cur] * this.ty[next];

    const f = new Array(FEATURE_LEN).fill(0);
    f[0] = clamp(1 - d / (HALF * 1.35), -1, 1);
    f[1] = clamp(k.v / MAXV, 0, 1.2);
    f[2] = clamp((k.wp + k.lap * N - (src.wp + src.lap * N)) / 8, -1, 1);
    f[3] = clamp(align, -1, 1);
    f[4] = collision;
    f[5] = boostNear * (k.boost > 0 ? 0.2 : 1);
    f[6] = clamp((src.lap + src.wp / N) / LAPS, 0, 1);
    f[7] = clamp(-leaderGap / 700, -1, 1);
    f[8] = k.off ? -1 : 1;
    f[9] = clamp(1 - Math.hypot(this.wx[ti] - k.x, this.wy[ti] - k.y) / HALF, -1, 1);
    f[10] = clamp(1 - Math.abs(Math.acos(clamp(align, -1, 1))) / 2.2, -1, 1);
    f[11] = clamp((curvature - 0.55) / 0.45, -1, 1);
    f[12] = 1;
    f[13] = 0;
    return f;
  }

  options(i: number): Option[] {
    return ACT.map((label, a) => ({ label, feat: this.featuresFor(i, a) }));
  }

  describe(i: number): string {
    const k = this.karts[i];
    let s = `GAME: CIRCUIT — top-down kart race, 3 laps, closed ribbon road. Off-road kills your speed. Amber boost pads give a 1.2s burst. Contact shoves rivals.\n`;
    s += `YOU: lap ${Math.min(LAPS, k.lap + 1)}/${LAPS} speed ${Math.round(k.v * 0.72)}km/h on ${k.off ? "DIRT" : "TARMAC"}${k.boost > 0 ? " BOOSTING" : ""} score ${Math.round(k.score)}. Rivals: `;
    for (let o = 0; o < this.karts.length; o++) {
      if (o === i) continue;
      const q = this.karts[o];
      s += `#${o + 1} lap ${q.lap + 1} score ${Math.round(q.score)} at ${Math.round(q.x)},${Math.round(q.y)}; `;
    }
    s += `\nCHOOSE ONE CONTROL (reply with the number only):\n`;
    ACT.forEach((label, a) => {
      const f = this.featuresFor(i, a);
      s += `${a + 1}. ${label} → track grip ${f[0].toFixed(2)}, speed ${f[1].toFixed(2)}, progress ${f[2].toFixed(2)}, alignment ${f[3].toFixed(2)}, danger ${f[4].toFixed(0)}, boost ${f[5].toFixed(2)}\n`;
    });
    return s;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#06080a";
    ctx.fillRect(0, 0, 960, 540);

    const cam = this.camera()!;
    ctx.save();
    ctx.translate(480, 270);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // world surface — tiled so the aggregate stays crisp under the zoom
    drawTiled(ctx, TEX.tarmac, -900, -760, 2760, 2060, 620, 0.55);
    ctx.fillStyle = "rgba(6,8,10,0.5)";
    ctx.fillRect(-900, -760, 2760, 2060);

    // tarmac ribbon
    const path = new Path2D();
    path.moveTo(this.wx[0], this.wy[0]);
    for (let i = 1; i <= N; i++) {
      const j = i % N;
      path.lineTo(this.wx[j], this.wy[j]);
    }
    path.closePath();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0e1216";
    ctx.lineWidth = HALF * 2 + 16;
    ctx.stroke(path);
    ctx.strokeStyle = "#20262d";
    ctx.lineWidth = HALF * 2;
    ctx.stroke(path);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 18]);
    ctx.stroke(path);
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,176,32,0.22)";
    ctx.lineWidth = HALF * 2 - 26;
    ctx.stroke(path);

    // boost pads
    for (const b of this.boosts) {
      const x = this.wx[b];
      const y = this.wy[b];
      const a = Math.atan2(this.ty[b], this.tx[b]);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      for (let n = -1; n <= 1; n++) {
        ctx.fillStyle = `rgba(255,176,32,${0.24 + 0.12 * Math.sin(this.fx.time * 6 + n)})`;
        ctx.beginPath();
        ctx.moveTo(-16 + n * 15, -22);
        ctx.lineTo(2 + n * 15, 0);
        ctx.lineTo(-16 + n * 15, 22);
        ctx.lineTo(-8 + n * 15, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // start line
    const s0 = 0;
    ctx.save();
    ctx.translate(this.wx[s0], this.wy[s0]);
    ctx.rotate(Math.atan2(this.ty[s0], this.tx[s0]));
    for (let r = 0; r < 2; r++)
      for (let c = -6; c < 6; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#E8E2D4" : "#1b2026";
        ctx.fillRect(-8 + r * 16, c * 12, 16, 12);
      }
    ctx.restore();

    // karts
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      const col = this.colors[i % this.colors.length];
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(k.h);
      if (k.boost > 0) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#FFB020";
        ctx.beginPath();
        ctx.ellipse(-20, 0, 16, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(-15, -9, 32, 20);
      ctx.fillStyle = k.hit > 0 ? "#fff" : col;
      ctx.fillRect(-16, -10, 30, 20);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(-16, -10, 30, 5);
      ctx.fillStyle = "#0b0e12";
      ctx.fillRect(-2, -8, 9, 16);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(11, -7, 4, 5);
      ctx.fillRect(11, 3, 4, 5);
      ctx.restore();

    }

    ctx.restore();

    // live position tags — screen space, so they stay legible at any zoom
    const ranked = this.karts
      .map((k, i) => ({ k, i }))
      .sort((a, b) => b.k.lap * N + b.k.wp - (a.k.lap * N + a.k.wp));
    const posOf = new Map<number, number>();
    ranked.forEach((r, p) => posOf.set(r.i, p + 1));
    const ord = ["1ST", "2ND", "3RD", "4TH"];
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      const col = this.colors[i % this.colors.length];
      const sx = 480 + (k.x - cam.x) * cam.zoom;
      const sy = 270 + (k.y - cam.y) * cam.zoom;
      if (sx < -40 || sx > 1000 || sy < -40 || sy > 580) continue;
      const p = posOf.get(i) ?? 1;
      ctx.fillStyle = "rgba(6,8,10,0.74)";
      ctx.fillRect(sx - 32, sy - 41, 64, 18);
      ctx.fillStyle = col;
      ctx.fillRect(sx - 32, sy - 41, 3, 18);
      ctx.font = "700 10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`0${i + 1} ${ord[p - 1]}`, sx + 2, sy - 28);
    }

    // lap readout
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(232,226,212,0.5)";
    ctx.font = "600 11px 'IBM Plex Mono', monospace";
    ctx.fillText("CIRCUIT 03 / THREE LAPS / CONTACT ENABLED", 22, 518);
    ctx.textAlign = "right";
    const lead = Math.max(...this.karts.map((k) => k.lap + k.wp / N));
    ctx.fillText(`LEADER ${((lead / LAPS) * 100).toFixed(0)}%`, 938, 518);
    ctx.textAlign = "left";
  }
}

export const circuitPrior = PRIOR;
