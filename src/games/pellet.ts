import { FEATURE_LEN, clamp, type HumanButtons, type Option } from "@/core/engine";
import type { FX } from "@/core/fx";
import { drawCover, TEX } from "@/core/textures";
import { BaseGame } from "./base";

// ---------------------------------------------------------------------------
// PELLET PANIC — a shared maze, four munchers, power pellets that turn the
// hunters into the hunted.
// ---------------------------------------------------------------------------

const MAP = [
  "###################",
  "#........#........#",
  "#.o.###.#.#.###.o.#",
  "#.......# #.......#",
  "###.###.###.###.###",
  "#...#.........#...#",
  "#.#.#.##.##.#.#.#.#",
  "#.#...#...#...#.#.#",
  "#.#.#.##.##.#.#.#.#",
  "#...#.........#...#",
  "###.###.###.###.###",
  "#.o.###.#.#.###.o.#",
  "#........#........#",
  "###################",
];
const W = MAP[0].length;
const H = MAP.length;
const TILE = 36;
const OFFX = Math.round((960 - W * TILE) / 2);
const OFFY = Math.round((540 - H * TILE) / 2);
const SPEED = 4.35; // tiles / second
const DIRS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
const DIR_LABEL = ["UP", "DOWN", "LEFT", "RIGHT"];
const SPAWNS = [
  [1, 1],
  [17, 12],
  [17, 1],
  [1, 12],
];

const PRIOR = [1, 0.82, 0.62, 0.42, 0.6, 0.9, 0.95, 0.34, 0.16, 0.14, 0.3, 0.22, 0.1, 0];

interface Muncher {
  tx: number;
  ty: number;
  px: number;
  py: number;
  dir: number;
  want: number;
  moving: boolean;
  heat: number;
  score: number;
  alive: boolean;
  respawn: number;
  mouth: number;
  eatenFlash: number;
}

export class PelletGame extends BaseGame {
  id = "pellet" as const;
  timeLimit = 95;
  private grid: string[] = [];
  private pellets = new Map<number, number>();
  private m: Muncher[] = [];
  private totalPellets = 1;

  constructor(n: number, colors: string[], fx: FX, logger: (m: string) => void, seed = 1) {
    super(n, colors, fx, logger);
    this.reset(seed);
  }

  reset(_seed = 1) {
    this.elapsed = 0;
    this.grid = MAP.slice();
    this.pellets.clear();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = this.grid[y][x];
        if (c === "." || c === "o") this.pellets.set(y * W + x, c === "o" ? 5 : 1);
      }
    }
    this.totalPellets = Math.max(1, this.pellets.size);
    this.m = [];
    for (let i = 0; i < this.playerCount; i++) {
      const s = SPAWNS[i % SPAWNS.length];
      this.m.push({
        tx: s[0],
        ty: s[1],
        px: s[0],
        py: s[1],
        dir: 3,
        want: 3,
        moving: false,
        heat: 0,
        score: 0,
        alive: true,
        respawn: 0,
        mouth: 0,
        eatenFlash: 0,
      });
    }
  }

  private open(x: number, y: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return this.grid[y][x] !== "#";
  }

  private eat(m: Muncher) {
    const k = m.ty * W + m.tx;
    const v = this.pellets.get(k);
    if (v === undefined) return;
    this.pellets.delete(k);
    const cx = OFFX + (m.tx + 0.5) * TILE;
    const cy = OFFY + (m.ty + 0.5) * TILE;
    if (v === 5) {
      m.score += 12;
      m.heat = 7.2;
      this.burst(cx, cy, "#FFD27A", 18, 220);
      this.shake(3.5);
      this.sound("power");
      this.fx.text(cx, cy - 18, "HEAT 7.2s", "#FFD27A", 17);
      this.fx.banner("POWER PELLET — HUNTER MODE", this.colors[this.m.indexOf(m) % this.colors.length], "7.2 seconds of licence to eat");
      this.log(`POWER PELLET — heat 7.2s`);
    } else {
      m.score += 2;
      this.sound("chomp", 0.8);
      if (Math.random() < 0.35) this.fx.trail(cx, cy, "#FFE7BC");
    }
  }

  update(dt: number, actions: number[]) {
    this.elapsed += dt;
    for (let i = 0; i < this.m.length; i++) {
      const m = this.m[i];
      if (!m.alive) {
        m.respawn -= dt;
        if (m.respawn <= 0) {
          const s = SPAWNS[i % SPAWNS.length];
          m.tx = s[0];
          m.ty = s[1];
          m.px = s[0];
          m.py = s[1];
          m.moving = false;
          m.heat = 0;
          m.alive = true;
          m.eatenFlash = 0;
        }
        continue;
      }
      m.mouth += dt * 11;
      if (m.eatenFlash > 0) m.eatenFlash -= dt;
      m.heat = Math.max(0, m.heat - dt);
      m.want = actions[i] >= 0 && actions[i] < 4 ? actions[i] : m.want;

      if (!m.moving) {
        let d = -1;
        if (this.open(m.tx + DIRS[m.want][0], m.ty + DIRS[m.want][1])) d = m.want;
        else if (this.open(m.tx + DIRS[m.dir][0], m.ty + DIRS[m.dir][1])) d = m.dir;
        if (d < 0) continue;
        m.dir = d;
        m.moving = true;
      }
      const step = SPEED * dt;
      m.px += DIRS[m.dir][0] * step;
      m.py += DIRS[m.dir][1] * step;
      const reached =
        (DIRS[m.dir][0] > 0 && m.px >= m.tx + 1) ||
        (DIRS[m.dir][0] < 0 && m.px <= m.tx - 1) ||
        (DIRS[m.dir][1] > 0 && m.py >= m.ty + 1) ||
        (DIRS[m.dir][1] < 0 && m.py <= m.ty - 1);
      if (reached) {
        m.tx += DIRS[m.dir][0];
        m.ty += DIRS[m.dir][1];
        m.px = m.tx;
        m.py = m.ty;
        m.moving = false;
        this.eat(m);
      }
    }

    // contact resolution
    for (let i = 0; i < this.m.length; i++) {
      const a = this.m[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.m.length; j++) {
        const b = this.m[j];
        if (!b.alive) continue;
        const dx = a.px - b.px;
        const dy = a.py - b.py;
        if (dx * dx + dy * dy > 0.62) continue;
        const x = OFFX + (a.px + b.px + 1) * TILE * 0.5;
        const y = OFFY + (a.py + b.py + 1) * TILE * 0.5;
        if (a.heat > 0 && b.heat <= 0) this.consume(a, b, x, y);
        else if (b.heat > 0 && a.heat <= 0) this.consume(b, a, x, y);
      }
    }
  }

  private consume(hunter: Muncher, prey: Muncher, x: number, y: number) {
    prey.alive = false;
    prey.respawn = 3.1;
    prey.eatenFlash = 0.5;
    prey.score = Math.max(0, prey.score - 14);
    hunter.score += 32;
    hunter.heat = Math.min(9.5, hunter.heat + 2.2); // a kill keeps the hunt alive
    this.burst(x, y, "#FFD27A", 30, 320);
    this.fx.ring(x, y, "#FFB020", 14, 300);
    this.shake(9);
    this.fx.stop(0.055);
    this.flash("#FFE7BC", 0.3);
    this.sound("ko", 1.1);
    this.fx.text(x, y - 26, "+32", "#FFD27A", 26);
    this.fx.text(x, y + 12, "−14", "#FF5C86", 15);
    const hi = this.m.indexOf(hunter);
    const pi = this.m.indexOf(prey);
    this.fx.banner(
      "RIVAL EATEN",
      this.colors[hi % this.colors.length],
      `player ${hi + 1} devours player ${pi + 1} — 32 points stolen`,
    );
    this.log(`HUNT — +32 stolen, prey sent back to spawn`);
  }

  human(i: number, b: HumanButtons) {
    const m = this.m[i];
    if (!m) return;
    if (b.up) m.want = 0;
    else if (b.down) m.want = 1;
    else if (b.left) m.want = 2;
    else if (b.right) m.want = 3;
  }

  scores() {
    return this.m.map((m) => Math.round(m.score));
  }
  alive() {
    return this.m.map((m) => m.alive);
  }
  hud(i: number) {
    const m = this.m[i];
    const cleared = this.totalPellets - this.pellets.size;
    return [
      { label: "SCORE", value: String(Math.round(m.score)).padStart(3, "0"), pct: clamp(m.score / 260, 0, 1) },
      { label: "HEAT", value: m.heat > 0 ? m.heat.toFixed(1) : "—", pct: clamp(m.heat / 7.2, 0, 1) },
      {
        label: "MAZE",
        value: Math.round((cleared / this.totalPellets) * 100) + "%",
        pct: cleared / this.totalPellets,
      },
    ];
  }

  // ---------------- decision features ----------------
  private rayPellet(x: number, y: number, dx: number, dy: number, max: number, wantPower: boolean) {
    for (let k = 1; k <= max; k++) {
      const nx = x + dx * k;
      const ny = y + dy * k;
      if (!this.open(nx, ny)) return -1;
      const v = this.pellets.get(ny * W + nx);
      if (v !== undefined && (wantPower ? v === 5 : true)) return k;
    }
    return -1;
  }

  private pelletDensity(x: number, y: number) {
    let n = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (this.pellets.has((y + dy) * W + (x + dx))) n++;
    return n;
  }

  private exits(x: number, y: number) {
    let n = 0;
    for (const d of DIRS) if (this.open(x + d[0], y + d[1])) n++;
    return n;
  }

  options(i: number): Option[] {
    const m = this.m[i];
    const out: Option[] = [];
    const cx = W / 2;
    const cy = H / 2;
    for (let d = 0; d < 4; d++) {
      const dx = DIRS[d][0];
      const dy = DIRS[d][1];
      const ok = this.open(m.tx + dx, m.ty + dy);
      const f = new Array(FEATURE_LEN).fill(0);
      f[0] = ok ? 1 : -1;
      const p = ok ? this.rayPellet(m.tx, m.ty, dx, dy, 6, false) : -1;
      f[1] = p < 0 ? -0.5 : 1 - p / 6;
      let cnt = 0;
      if (ok)
        for (let k = 1; k <= 5; k++)
          if (this.pellets.has((m.ty + dy * k) * W + (m.tx + dx * k))) cnt++;
      f[2] = cnt / 5;
      f[3] = ok && this.rayPellet(m.tx, m.ty, dx, dy, 6, true) > 0 ? 1 : 0;

      let oppNear = 1;
      let edible = 0;
      let danger = 0;
      for (let o = 0; o < this.m.length; o++) {
        if (o === i || !this.m[o].alive) continue;
        const q = this.m[o];
        const ox = q.px - m.px;
        const oy = q.py - m.py;
        const along = ox * dx + oy * dy;
        const across = Math.abs(ox * dy - oy * dx);
        if (along > 0 && across < 1.6) {
          const dd = Math.hypot(ox, oy);
          oppNear = Math.min(oppNear, 1 - Math.min(dd, 7) / 7);
          if (dd < 3 && m.heat > 0) edible = 1;
          if (dd < 3.2 && q.heat > 0) danger = -1;
        }
      }
      f[4] = oppNear;
      f[5] = edible;
      f[6] = danger;

      let open = 0;
      if (ok)
        for (let dy2 = -2; dy2 <= 2; dy2++)
          for (let dx2 = -2; dx2 <= 2; dx2++) if (this.open(m.tx + dx + dx2, m.ty + dy + dy2)) open++;
      f[7] = open / 25;
      const rev = (m.dir + 1) % 4 === d || (m.dir + 3) % 4 === d;
      f[8] = rev ? -1 : 1;
      f[9] = d === m.dir ? 1 : 0;
      f[10] = ok ? this.pelletDensity(m.tx + dx * 2, m.ty + dy * 2) / 16 : 0;
      const tx = m.tx + dx;
      const ty = m.ty + dy;
      f[11] = 1 - Math.hypot(tx - cx, ty - cy) / 12;
      f[12] = ok ? this.exits(tx, ty) / 4 : 0;
      f[13] = 1;
      out.push({ label: DIR_LABEL[d], feat: f });
    }
    return out;
  }

  describe(i: number): string {
    const m = this.m[i];
    const opts = this.options(i);
    let s = `GAME: PELLET PANIC. You are a muncher in a 19x14 maze. Eat dots (+2), power pellets (+12) make you HOT for 7s so you can EAT rivals (+32, they lose 14). Being eaten is very bad.\n`;
    s += `YOU: tile(${m.tx},${m.ty}) dir=${DIR_LABEL[m.dir]} score=${Math.round(m.score)} heat=${m.heat.toFixed(1)}${m.heat > 0 ? " (HUNTER)" : ""}. Remaining dots: ${this.pellets.size}. Rivals: `;
    for (let o = 0; o < this.m.length; o++) {
      if (o === i) continue;
      const q = this.m[o];
      if (!q.alive) continue;
      s += `#${o + 1} at (${q.px.toFixed(0)},${q.py.toFixed(0)})${q.heat > 0 ? " HOT-DANGER" : ""}${q.heat <= 0 && m.heat > 0 ? " edible" : ""}; `;
    }
    s += `\nCHOOSE ONE MOVE (reply with the number only):\n`;
    opts.forEach((o, k) => {
      s += `${k + 1}. ${o.label} (valid=${o.feat[0] > 0 ? "yes" : "no"}, nearest dot ${o.feat[1].toFixed(2)}, danger ${o.feat[6].toFixed(0)}, edible ${o.feat[5].toFixed(0)})\n`;
    });
    return s;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#06080a";
    ctx.fillRect(0, 0, 960, 540);
    drawCover(ctx, TEX.concrete, 0, 0, 960, 540, 0.26);
    ctx.fillStyle = "rgba(6,8,10,0.62)";
    ctx.fillRect(0, 0, 960, 540);
    // maze
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = this.grid[y][x];
        const px = OFFX + x * TILE;
        const py = OFFY + y * TILE;
        if (c === "#") {
          ctx.fillStyle = "#121826";
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = "#1d2b45";
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          ctx.strokeStyle = "rgba(110,168,254,0.32)";
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
        }
      }
    }
    // pellets
    const t = this.fx.time;
    for (const [k, v] of this.pellets) {
      const x = k % W;
      const y = (k - x) / W;
      const cx = OFFX + (x + 0.5) * TILE;
      const cy = OFFY + (y + 0.5) * TILE;
      if (v === 5) {
        const r = 7 + Math.sin(t * 5 + k) * 1.8;
        ctx.fillStyle = "#FFD27A";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = "#C8B79A";
        ctx.fillRect(cx - 2, cy - 2, 4, 4);
      }
    }
    // munchers
    for (let i = 0; i < this.m.length; i++) {
      const m = this.m[i];
      if (!m.alive) continue;
      const cx = OFFX + (m.px + 0.5) * TILE;
      const cy = OFFY + (m.py + 0.5) * TILE;
      const r = TILE * 0.36;
      const col = this.colors[i % this.colors.length];
      const ang = [ -Math.PI / 2, Math.PI / 2, Math.PI, 0 ][m.dir];
      const open = 0.12 + Math.abs(Math.sin(m.mouth)) * 0.36;
      if (m.heat > 0) {
        ctx.globalAlpha = 0.28 + Math.sin(t * 12) * 0.08;
        ctx.fillStyle = "#FFD27A";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, ang + open, ang - open + Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const ex = cx + Math.cos(ang - 0.75) * r * 0.42;
      const ey = cy + Math.sin(ang - 0.75) * r * 0.42;
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      // team tag
      ctx.fillStyle = col;
      ctx.font = "600 10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), cx, cy - r - 7);
    }
  }
}

export const pelletPrior = PRIOR;
