import { FEATURE_LEN, clamp, type HumanButtons, type Option } from "@/core/engine";
import type { FX } from "@/core/fx";
import { drawCover, TEX } from "@/core/textures";
import { BaseGame } from "./base";

// ---------------------------------------------------------------------------
// STACK RANK — four boards, one shared piece sequence, garbage on every clear.
// ---------------------------------------------------------------------------

const COLS = 10;
const ROWS = 18;

type Cells = [number, number][];

const PIECES: Cells[] = [
  // I
  [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  // O
  [
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 1],
  ],
  // T
  [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  // S
  [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  // Z
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
  // J
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  // L
  [
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
];
const PIECE_NAMES = ["I", "O", "T", "S", "Z", "J", "L"];

function rotations(p: Cells): Cells[] {
  const out: Cells[] = [p];
  let cur = p;
  for (let r = 0; r < 3; r++) {
    // rotate around a 3x3 box (I piece handled with 4x4 nuance by shifting)
    const nx = cur.map(([x, y]) => [2 - y, x] as [number, number]);
    const minX = Math.min(...nx.map((c) => c[0]));
    const minY = Math.min(...nx.map((c) => c[1]));
    const norm = nx.map(([x, y]) => [x - minX, y - minY] as [number, number]);
    out.push(norm);
    cur = norm;
  }
  return out;
}

const SHAPES: Cells[][] = PIECES.map(rotations);

const PRIOR = [1.0, 0.62, 0.95, 0.46, 0.5, 0.42, 0.16, 0.2, 0.18, 0.34, 0.3, 0.58, 0, 0];

interface Board {
  cells: Int8Array;
  piece: number;
  seq: number;
  x: number;
  y: number;
  rot: number;
  targetX: number;
  targetRot: number;
  phase: 0 | 1 | 2 | 3; // thinking | sliding | dropping | dead
  timer: number;
  score: number;
  lines: number;
  sent: number;
  alive: boolean;
  pop: number;
  flashRows: number[];
}

function makeBag(seed: number) {
  // 7-bag randomiser, shared by every board so the comparison is fair
  const out: number[] = [];
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  while (out.length < 400) {
    const bag = [0, 1, 2, 3, 4, 5, 6];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    out.push(...bag);
  }
  return out;
}

export class StackGame extends BaseGame {
  id = "stack" as const;
  timeLimit = 165;
  private boards: Board[] = [];
  private bag: number[] = [];
  private humanCtl: (boolean | null)[] = [];
  private humanDrop: boolean[] = [];
  private humanPrev = { left: false, right: false, up: false, down: false, a: false, b: false };
  private tile = 20;

  constructor(n: number, colors: string[], fx: FX, logger: (m: string) => void, seed = 7) {
    super(n, colors, fx, logger);
    this.reset(seed);
  }

  reset(seed = 7) {
    this.elapsed = 0;
    this.bag = makeBag(seed * 2654435761 + 11);
    this.tile = this.playerCount <= 2 ? 24 : this.playerCount === 3 ? 22 : 20;
    this.boards = [];
    this.humanCtl = new Array(this.playerCount).fill(null);
    this.humanDrop = new Array(this.playerCount).fill(false);
    for (let i = 0; i < this.playerCount; i++) {
      this.boards.push({
        cells: new Int8Array(COLS * ROWS),
        piece: this.bag[0],
        seq: 0,
        x: 3,
        y: -1,
        rot: 0,
        targetX: 3,
        targetRot: 0,
        phase: 1,
        timer: 0.12 + i * 0.04,
        score: 0,
        lines: 0,
        sent: 0,
        alive: true,
        pop: 0,
        flashRows: [],
      });
    }
  }

  private collide(b: Board, cells: Cells, x: number, y: number) {
    for (const [cx, cy] of cells) {
      const px = x + cx;
      const py = y + cy;
      if (px < 0 || px >= COLS) return true;
      if (py >= ROWS) return true;
      if (py >= 0 && b.cells[py * COLS + px] !== 0) return true;
    }
    return false;
  }

  private dropY(b: Board, cells: Cells, x: number) {
    let y = -2;
    while (!this.collide(b, cells, x, y + 1)) y++;
    return y;
  }

  private placementValid(b: Board, cells: Cells, x: number) {
    if (this.collide(b, cells, x, -2)) return false;
    return true;
  }

  private lock(b: Board, idx: number) {
    const cells = SHAPES[b.piece][b.rot];
    for (const [cx, cy] of cells) {
      const px = b.x + cx;
      const py = b.y + cy;
      if (py < 0) {
        b.alive = false;
        b.phase = 3;
        this.shake(11);
        this.sound("over");
        this.flash("#FF4438", 0.22);
        this.fx.banner(
          "BOARD TOPPED OUT",
          "#FF4438",
          `player ${idx + 1} is out of the stack race`,
        );
        this.log(`BOARD ${idx + 1} TOPPED OUT`);
        return;
      }
      b.cells[py * COLS + px] = b.piece + 1;
    }
    // clear lines
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      let full = true;
      for (let x = 0; x < COLS; x++)
        if (b.cells[y * COLS + x] === 0) {
          full = false;
          break;
        }
      if (full) {
        cleared++;
        b.flashRows.push(y);
        for (let yy = y; yy > 0; yy--)
          for (let x = 0; x < COLS; x++) b.cells[yy * COLS + x] = b.cells[(yy - 1) * COLS + x];
        for (let x = 0; x < COLS; x++) b.cells[x] = 0;
        y++;
      }
    }
    if (cleared > 0) {
      b.lines += cleared;
      b.score += [0, 120, 340, 560, 880][cleared] ?? 880;
      const garbage = [0, 0, 1, 2, 4][cleared] ?? 4;
      b.sent += garbage;
      if (garbage > 0) this.sendGarbage(idx, garbage);
      this.shake(cleared >= 4 ? 10 : 2 + cleared * 1.6);
      const col = this.colors[idx % this.colors.length];
      const gained = [0, 120, 340, 560, 880][cleared] ?? 880;
      if (cleared >= 4) {
        this.flash(col, 0.24);
        this.fx.stop(0.06);
      }
      this.sound(cleared >= 3 ? "clear" : "lock", 0.75 + cleared * 0.18);
      const bw = COLS * this.tile;
      const bx = (960 - (bw * this.playerCount + 22 * (this.playerCount - 1))) / 2;
      const px = bx + idx * (bw + 22) + bw / 2;
      this.burst(px, 540 - 90, col, 12 + cleared * 7, 260);
      this.fx.text(px, 430, `+${gained}`, col, cleared >= 4 ? 30 : 20);
      if (garbage > 0) this.fx.text(px, 468, `GARBAGE +${garbage}`, "#FF5C86", 13);
      if (cleared >= 3) {
        this.fx.banner(
          cleared === 4 ? "TETRIS — FOUR LINES" : `TRIPLE CLEAR`,
          col,
          garbage > 0 ? `${garbage} garbage row${garbage === 1 ? "" : "s"} dumped on every rival` : "",
        );
      }
      this.log(`CLEAR ×${cleared} → sends ${garbage} garbage row${garbage === 1 ? "" : "s"}`);
    } else {
      this.sound("lock", 0.55);
    }
    b.score += 2;
    b.seq++;
    b.piece = this.bag[b.seq % this.bag.length];
    b.x = 3;
    b.y = -1;
    b.rot = 0;
    b.targetX = 3;
    b.targetRot = 0;
    b.phase = 1;
    b.timer = 0.055;
    b.pop = 1;
  }

  private sendGarbage(from: number, n: number) {
    for (let i = 0; i < this.boards.length; i++) {
      if (i === from || !this.boards[i].alive) continue;
      const b = this.boards[i];
      for (let g = 0; g < n; g++) {
        for (let y = 0; y < ROWS - 1; y++)
          for (let x = 0; x < COLS; x++) b.cells[y * COLS + x] = b.cells[(y + 1) * COLS + x];
        const hole = Math.floor(Math.random() * COLS);
        for (let x = 0; x < COLS; x++) b.cells[(ROWS - 1) * COLS + x] = x === hole ? 0 : 9;
      }
    }
  }

  update(dt: number, actions: number[]) {
    this.elapsed += dt;
    for (let i = 0; i < this.boards.length; i++) {
      const b = this.boards[i];
      if (!b.alive) continue;
      b.pop = Math.max(0, b.pop - dt * 4.5);
      if (b.phase === 1) {
        // slide horizontally to the target column
        const hc = this.humanCtl[i];
        if (hc === null) {
          if (actions[i] >= 0) {
            const opt = this.placements(i)[actions[i]];
            if (opt) {
              b.targetRot = opt.rot;
              b.targetX = opt.col;
            }
          }
          b.rot = b.targetRot;
          const dx = b.targetX - b.x;
          const step = 26 * dt;
          if (Math.abs(dx) <= step) {
            b.x = b.targetX;
            b.phase = 2;
          } else b.x += Math.sign(dx) * step;
        } else {
          // human pilot steers in phase 1; auto-drop if they dawdle
          b.timer += dt;
          if (b.timer > 3.2) b.phase = 2;
        }
      } else if (b.phase === 2) {
        const cells = SHAPES[b.piece][b.rot];
        // the stack accelerates as the match runs — late game is a different game
      const ramp = 1 + this.elapsed / 78;
      const speed = (this.humanCtl[i] === null ? 62 : this.humanDrop[i] ? 82 : 22) * ramp;
        b.y += speed * dt;
        if (this.collide(b, cells, b.x, Math.floor(b.y) + 1) && b.y >= Math.floor(b.y)) {
          b.y = this.dropY(b, cells, b.x);
          this.lock(b, i);
        }
      }
    }
  }

  scores() {
    return this.boards.map((b) => Math.round(b.score));
  }
  alive() {
    return this.boards.map((b) => b.alive);
  }

  hud(i: number) {
    const b = this.boards[i];
    const h = this.height(b);
    return [
      { label: "SCORE", value: String(Math.round(b.score)).padStart(4, "0"), pct: clamp(b.score / 2200, 0, 1) },
      { label: "LINES", value: String(b.lines).padStart(2, "0"), pct: clamp(b.lines / 30, 0, 1) },
      { label: "SENT", value: String(b.sent).padStart(2, "0"), pct: clamp(b.sent / 24, 0, 1) },
      { label: "STACK", value: String(h).padStart(2, "0"), pct: clamp(h / ROWS, 0, 1) },
    ];
  }

  private height(b: Board) {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) if (b.cells[y * COLS + x] !== 0) return ROWS - y;
    return 0;
  }

  human(i: number, hb: HumanButtons) {
    this.humanCtl[i] = true;
    this.humanDrop[i] = hb.down;
    const b = this.boards[i];
    if (!b || !b.alive) return;
    const prev = this.humanPrev;
    const cells = SHAPES[b.piece][b.rot];
    if (b.phase === 1) {
      if (hb.left && !prev.left && !this.collide(b, cells, b.x - 1, b.y)) {
        b.x--;
        b.timer = 0;
      }
      if (hb.right && !prev.right && !this.collide(b, cells, b.x + 1, b.y)) {
        b.x++;
        b.timer = 0;
      }
      if ((hb.up && !prev.up) || (hb.a && !prev.a)) {
        const nr = (b.rot + 1) % 4;
        if (!this.collide(b, SHAPES[b.piece][nr], b.x, b.y)) {
          b.rot = nr;
          b.timer = 0;
        }
      }
      if (hb.b && !prev.b) b.phase = 2;
      b.targetX = b.x;
      b.targetRot = b.rot;
    }
    this.humanPrev = { ...hb };
  }

  release(i: number) {
    this.humanCtl[i] = null;
    this.humanDrop[i] = false;
  }

  // ---------------- decision features ----------------
  private placements(i: number) {
    const b = this.boards[i];
    const out: { rot: number; col: number; cells: Cells; y: number }[] = [];
    const seen = new Set<string>();
    for (let r = 0; r < 4; r++) {
      const cells = SHAPES[b.piece][r];
      const w = Math.max(...cells.map((c) => c[0])) + 1;
      for (let c = 0; c <= COLS - w; c++) {
        const key = `${r}:${c}:${cells.map((p) => p.join("")).join("")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!this.placementValid(b, cells, c)) continue;
        const y = this.dropY(b, cells, c);
        out.push({ rot: r, col: c, cells, y });
      }
    }
    return out;
  }

  private evalPlacement(b: Board, p: { col: number; cells: Cells; y: number }) {
    const sim = new Int8Array(b.cells);
    for (const [cx, cy] of p.cells) {
      const py = p.y + cy;
      const px = p.col + cx;
      if (py >= 0 && py < ROWS && px >= 0 && px < COLS) sim[py * COLS + px] = 1;
    }
    let cleared = 0;
    for (let y = 0; y < ROWS; y++) {
      let full = true;
      for (let x = 0; x < COLS; x++)
        if (sim[y * COLS + x] === 0) {
          full = false;
          break;
        }
      if (full) cleared++;
    }
    const heights: number[] = [];
    let agg = 0,
      holes = 0,
      bump = 0,
      rowT = 0,
      colT = 0,
      holeDepth = 0,
      maxH = 0;
    for (let x = 0; x < COLS; x++) {
      let h = 0;
      let seenBlock = false;
      for (let y = 0; y < ROWS; y++) {
        if (sim[y * COLS + x] !== 0) {
          if (!seenBlock) {
            h = ROWS - y;
            seenBlock = true;
          }
        } else if (seenBlock) {
          holes++;
          holeDepth += h - (ROWS - y);
        }
      }
      heights.push(h);
      agg += h;
      maxH = Math.max(maxH, h);
    }
    for (let x = 0; x < COLS - 1; x++) bump += Math.abs(heights[x] - heights[x + 1]);
    for (let y = 0; y < ROWS; y++) {
      let prev = 1;
      for (let x = 0; x < COLS; x++) {
        const cur = sim[y * COLS + x] !== 0 ? 1 : 0;
        if (cur !== prev) rowT++;
        prev = cur;
      }
      if (prev === 0) rowT++;
    }
    for (let x = 0; x < COLS; x++) {
      let prev = 1;
      for (let y = 0; y < ROWS; y++) {
        const cur = sim[y * COLS + x] !== 0 ? 1 : 0;
        if (cur !== prev) colT++;
        prev = cur;
      }
      if (prev === 0) colT++;
    }
    const landingHeight = p.y >= 0 ? ROWS - p.y : 0;
    return {
      cleared,
      agg,
      holes,
      bump,
      maxH,
      rowT,
      colT,
      holeDepth,
      landingHeight,
    };
  }

  options(i: number): Option[] {
    const b = this.boards[i];
    const ps = this.placements(i);
    return ps.map((p) => {
      const e = this.evalPlacement(b, p);
      const f = new Array(FEATURE_LEN).fill(0);
      f[0] = e.cleared / 4;
      f[1] = 1 - clamp(e.agg / 70, 0, 1);
      f[2] = 1 - clamp(e.holes / 8, 0, 1);
      f[3] = 1 - clamp(e.bump / 28, 0, 1);
      f[4] = 1 - clamp(e.maxH / ROWS, 0, 1);
      f[5] = 1 - clamp(e.holeDepth / 26, 0, 1);
      f[6] = clamp(e.landingHeight / ROWS, 0, 1);
      f[7] = 1 - clamp(e.colT / 90, 0, 1);
      f[8] = 1 - clamp(e.rowT / 80, 0, 1);
      f[9] = e.cleared >= 4 ? 1 : e.cleared >= 2 ? 0.5 : 0;
      f[10] = clamp((e.cleared * 2 - e.holes * 0.5) / 6, -1, 1);
      f[11] = e.maxH > 14 ? -1 : 1;
      f[12] = 1;
      f[13] = 0;
      return { label: `${PIECE_NAMES[b.piece]} R${p.rot} C${p.col}`, feat: f };
    });
  }

  describe(i: number): string {
    const b = this.boards[i];
    const ps = this.placements(i);
    let s = `GAME: STACK RANK (Tetris). 10x${ROWS} board. Clear rows to score and dump GARBAGE on rivals. Stacking over the top = eliminated.\n`;
    s += `YOU: piece ${PIECE_NAMES[b.piece]} score ${b.score} lines ${b.lines} garbage sent ${b.sent} stack height ${this.height(b)}. Rivals: `;
    for (let o = 0; o < this.boards.length; o++) {
      if (o === i) continue;
      const q = this.boards[o];
      if (!q.alive) continue;
      s += `#${o + 1} lines ${q.lines} height ${this.height(q)}; `;
    }
    s += `\nCHOOSE ONE PLACEMENT (reply with the number only):\n`;
    ps.slice(0, 24).forEach((p, k) => {
      const e = this.evalPlacement(b, p);
      s += `${k + 1}. ${PIECE_NAMES[b.piece]} rot ${p.rot} col ${p.col} → clears ${e.cleared}, holes ${e.holes}, height ${e.maxH}, bumpiness ${e.bump}\n`;
    });
    return s;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#06080a";
    ctx.fillRect(0, 0, 960, 540);
    drawCover(ctx, TEX.steel, 0, 0, 960, 540, 0.22);
    ctx.fillStyle = "rgba(6,8,10,0.66)";
    ctx.fillRect(0, 0, 960, 540);
    const bw = COLS * this.tile;
    const bh = ROWS * this.tile;
    const gap = this.playerCount <= 2 ? 64 : 22;
    const total = bw * this.playerCount + gap * (this.playerCount - 1);
    const x0 = (960 - total) / 2;
    const y0 = 540 / 2 - bh / 2 + 34;
    for (let i = 0; i < this.boards.length; i++) {
      const b = this.boards[i];
      const bx = x0 + i * (bw + gap);
      const col = this.colors[i % this.colors.length];
      const danger = b.alive && this.height(b) > 13;
      if (danger) {
        const pulse = 0.3 + Math.sin(this.fx.time * 7 + i) * 0.22;
        ctx.strokeStyle = `rgba(255,68,56,${pulse})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(bx - 4, y0 - 4, bw + 8, bh + 8);
      }
      ctx.fillStyle = "#0b0f14";
      ctx.fillRect(bx, y0, bw, bh);
      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(bx + x * this.tile + 0.5, y0);
        ctx.lineTo(bx + x * this.tile + 0.5, y0 + bh);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(bx, y0 + y * this.tile + 0.5);
        ctx.lineTo(bx + bw, y0 + y * this.tile + 0.5);
        ctx.stroke();
      }
      if (!b.alive) {
        ctx.fillStyle = "rgba(10,12,15,0.72)";
        ctx.fillRect(bx, y0, bw, bh);
        ctx.fillStyle = "#FF4438";
        ctx.font = "700 13px 'IBM Plex Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("OUT", bx + bw / 2, y0 + bh / 2);
      }
      // locked cells
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const v = b.cells[y * COLS + x];
          if (v === 0) continue;
          const isGarbage = v === 9;
          const px = bx + x * this.tile;
          const py = y0 + y * this.tile;
          ctx.fillStyle = isGarbage ? "#2a2f37" : this.shade(col, 0.1);
          ctx.fillRect(px + 1, py + 1, this.tile - 2, this.tile - 2);
          ctx.fillStyle = isGarbage ? "#3b424c" : col;
          ctx.fillRect(px + 1, py + 1, this.tile - 2, this.tile - 2 - 3);
          ctx.fillStyle = "rgba(255,255,255,0.16)";
          ctx.fillRect(px + 1, py + 1, this.tile - 2, 2);
        }
      }
      // active piece
      if (b.alive && b.phase !== 3) {
        const cells = SHAPES[b.piece][b.rot];
        const gy = this.dropY(b, cells, Math.round(b.x));
        // ghost
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = col;
        for (const [cx, cy] of cells) {
          const py = gy + cy;
          if (py < 0) continue;
          ctx.fillRect(bx + (Math.round(b.x) + cx) * this.tile + 1, y0 + py * this.tile + 1, this.tile - 2, this.tile - 2);
        }
        ctx.globalAlpha = 1;
        const s = 1 + b.pop * 0.14;
        for (const [cx, cy] of cells) {
          const py = Math.round(b.y) + cy;
          if (py < -1) continue;
          const px = bx + (Math.round(b.x) + cx) * this.tile;
          const ppy = y0 + py * this.tile;
          const half = (this.tile * s) / 2;
          ctx.fillStyle = col;
          ctx.fillRect(px + this.tile / 2 - half + 1, ppy + this.tile / 2 - half + 1, this.tile * s - 2, this.tile * s - 2);
          ctx.fillStyle = "rgba(255,255,255,0.22)";
          ctx.fillRect(px + this.tile / 2 - half + 1, ppy + this.tile / 2 - half + 1, this.tile * s - 2, 2);
        }
      }
      // header + next-piece queue
      ctx.fillStyle = col;
      ctx.font = "700 11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`0${i + 1}`, bx, y0 - 62);
      ctx.textAlign = "right";
      ctx.fillText(String(Math.round(b.score)).padStart(4, "0"), bx + bw, y0 - 62);

      const cell = Math.max(5, Math.min(9, Math.round(this.tile * 0.42)));
      for (let k = 1; k <= 3; k++) {
        const pi = (b.seq + k) % this.bag.length;
        const cells = SHAPES[this.bag[pi]][0];
        const ox = bx + (k - 1) * (cell * 4 + 10);
        const oy = y0 - 52;
        ctx.globalAlpha = k === 1 ? 1 : 0.34;
        ctx.fillStyle = col;
        for (const [qx, qy] of cells) ctx.fillRect(ox + qx * cell, oy + qy * cell, cell - 1, cell - 1);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "rgba(232,226,212,0.34)";
      ctx.font = "600 8px 'IBM Plex Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText("NEXT", bx + bw, y0 - 18);
      if (danger) {
        ctx.fillStyle = "#FF4438";
        ctx.textAlign = "left";
        ctx.fillText("DANGER", bx, y0 - 18);
      }
    }
  }

  private shade(hex: string, a: number) {
    return hex + Math.round(a * 255).toString(16).padStart(2, "0");
  }
}

export const stackPrior = PRIOR;
