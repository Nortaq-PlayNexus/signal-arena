import { FEATURE_LEN, clamp, type HumanButtons, type Option } from "@/core/engine";
import type { FX } from "@/core/fx";
import { drawTiled, TEX } from "@/core/textures";
import { BaseGame } from "./base";

// ---------------------------------------------------------------------------
// RING BRAWL — four fighters, one platform, knockback that sends people off it.
// ---------------------------------------------------------------------------

const FLOOR = 430;
const LEFT_EDGE = 96;
const RIGHT_EDGE = 864;
const GRAV = 1520;
const MOVE = 252;
const JUMP_V = -604;
const ATK_RANGE = 76;
const ATK_DMG = 10;
const ACT = ["STEP LEFT", "STEP RIGHT", "JUMP", "ATTACK", "GUARD", "DASH"];

const PRIOR = [0.85, 1.0, 0.32, 0.55, 0.95, 0.7, 0.6, 0.15, 0.3, 0.5, 0.45, 0.6, 0, 0];

interface Fighter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  face: number;
  atk: number;
  atkCd: number;
  hit: number;
  blockT: number;
  dash: number;
  dashCd: number;
  invuln: number;
  air: boolean;
  alive: boolean;
  dealt: number;
  kills: number;
  hurt: number;
  walk: number;
}

export class BrawlGame extends BaseGame {
  id = "brawl" as const;
  timeLimit = 82;
  private f: Fighter[] = [];
  private humanAct: number[] = [];
  private humanFlag: boolean[] = [];
  private camX = 480;
  private camY = 352;
  private camZ = 1.12;
  private camPunch = 0;

  camera() {
    return { x: this.camX, y: this.camY, zoom: this.camZ * (1 + this.camPunch * 0.13) };
  }

  private advanceCamera(dt: number) {
    const live = this.f.filter((p) => p.alive);
    const arr = live.length ? live : this.f;
    if (!arr.length) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let sx = 0;
    for (const p of arr) {
      sx += p.x;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    }
    const n = arr.length;
    const spread = Math.max(300, maxX - minX);
    const tz = clamp(940 / spread, 1.03, 1.5);
    const k = 1 - Math.pow(0.0024, dt);
    const halfW = 480 / tz;
    const tx = clamp(sx / n, halfW, 960 - halfW);
    this.camX += (tx - this.camX) * k;
    this.camY += (352 - this.camY) * k;
    this.camZ += (tz - this.camZ) * k;
    this.camPunch = Math.max(0, this.camPunch - dt * 2.0);
  }

  constructor(n: number, colors: string[], fx: FX, logger: (m: string) => void, seed = 5) {
    super(n, colors, fx, logger);
    this.reset(seed);
  }

  reset(_seed = 5) {
    this.elapsed = 0;
    this.f = [];
    this.humanAct = [];
    this.humanFlag = [];
    for (let i = 0; i < this.playerCount; i++) {
      this.f.push({
        x: 200 + (i * (560 / Math.max(1, this.playerCount - 1))),
        y: FLOOR,
        vx: 0,
        vy: 0,
        hp: 100,
        face: i % 2 === 0 ? 1 : -1,
        atk: 0,
        atkCd: 0,
        hit: 0,
        blockT: 0,
        dash: 0,
        dashCd: 0,
        invuln: 0,
        air: false,
        alive: true,
        dealt: 0,
        kills: 0,
        hurt: 0,
        walk: 0,
      });
    }
  }

  private nearestOpp(i: number) {
    let best = -1;
    let bd = Infinity;
    for (let o = 0; o < this.f.length; o++) {
      if (o === i || !this.f[o].alive) continue;
      const d = Math.abs(this.f[o].x - this.f[i].x) + Math.abs(this.f[o].y - this.f[i].y) * 0.35;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return { idx: best, dist: bd };
  }

  update(dt: number, actions: number[]) {
    this.elapsed += dt;
    for (let i = 0; i < this.f.length; i++) {
      const p = this.f[i];
      if (!p.alive) continue;
      const act = this.humanFlag[i] ? this.humanAct[i] : actions[i] >= 0 && actions[i] < 6 ? actions[i] : 3;

      p.atk = Math.max(0, p.atk - dt);
      p.atkCd = Math.max(0, p.atkCd - dt);
      p.hit = Math.max(0, p.hit - dt);
      p.dash = Math.max(0, p.dash - dt);
      p.dashCd = Math.max(0, p.dashCd - dt);
      p.invuln = Math.max(0, p.invuln - dt);
      p.hurt = Math.max(0, p.hurt - dt);
      p.blockT = act === 4 && p.hit <= 0 ? 0.14 : Math.max(0, p.blockT - dt);

      const stun = p.hit > 0;
      if (!stun) {
        if (act === 0) {
          p.vx += -MOVE * 9 * dt;
          p.face = -1;
        } else if (act === 1) {
          p.vx += MOVE * 9 * dt;
          p.face = 1;
        }
        if (act === 2 && !p.air) {
          p.vy = JUMP_V;
          p.air = true;
          this.burst(p.x, p.y, "rgba(232,226,212,0.6)", 8, 130);
          this.sound("jump", 0.8);
        }
        if (act === 3 && p.atkCd <= 0) {
          p.atk = 0.32;
          p.atkCd = 0.52;
          p.vx += p.face * 110;
        }
        if (act === 5 && p.dashCd <= 0) {
          p.dash = 0.17;
          p.dashCd = 1.5;
          p.invuln = 0.14;
          p.vx = p.face * 660;
          this.burst(p.x, p.y - 34, this.colors[i % this.colors.length], 12, 210);
          this.sound("boost", 0.5);
        }
        if (act === 4) p.vx *= 0.82;
      }

      // physics
      p.vy += GRAV * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = p.air ? 0.985 : p.hit > 0 ? 0.9 : 0.84;
      p.vx *= Math.pow(drag, dt * 60);
      if (p.y >= FLOOR) {
        p.y = FLOOR;
        if (p.vy > 260) this.burst(p.x, p.y, "rgba(232,226,212,0.35)", 6, 120);
        p.vy = 0;
        p.air = false;
      }
      p.walk += Math.abs(p.vx) * dt * 0.02;

      // attack resolution
      if (p.atk > 0.1 && p.atk < 0.24) {
        for (let o = 0; o < this.f.length; o++) {
          if (o === i) continue;
          const q = this.f[o];
          if (!q.alive || q.invuln > 0) continue;
          const dx = q.x - p.x;
          const dy = Math.abs(q.y - p.y);
          if (Math.sign(dx) !== p.face && Math.abs(dx) > 12) continue;
          if (Math.abs(dx) > ATK_RANGE || dy > 76) continue;
          const blocked = q.blockT > 0 && Math.sign(-dx) === q.face;
          // desperation: below 35 hp a fighter hits measurably harder
          const rage = p.hp < 35 ? 1.55 : 1;
          const dmg = blocked ? 2 : ATK_DMG * rage;
          this.sound(blocked ? "block" : "hit", blocked ? 0.85 : 1 + (100 - q.hp) / 140);
          q.hp = Math.max(0, q.hp - dmg);
          q.hit = blocked ? 0.1 : 0.3;
          q.hurt = 0.26;
          const kb = ((blocked ? 130 : 300) + (100 - q.hp) * 3.4) * rage;
          q.vx = p.face * kb;
          q.vy = blocked ? -70 : -210;
          q.air = true;
          p.dealt += dmg;
          const hx = (p.x + q.x) / 2;
          const hy = (p.y + q.y) / 2 - 44;
          this.burst(hx, hy, blocked ? "#6EA8FE" : "#FFD27A", blocked ? 10 : 22, blocked ? 180 : 300);
          this.fx.ring(hx, hy, blocked ? "#6EA8FE" : "#FFB020", 8, 220);
          this.shake(blocked ? 3 : 8.5);
          this.camPunch = Math.max(this.camPunch, blocked ? 0.25 : 1);
          this.fx.text(
            hx,
            hy - 16,
            blocked ? "GUARD" : rage > 1 ? `−${Math.round(dmg)} RAGE` : `−${Math.round(dmg)}`,
            blocked ? "#6EA8FE" : rage > 1 ? "#FF4438" : "#FFD27A",
            blocked ? 14 : 24,
          );
          if (!blocked) {
            this.fx.stop(0.05);
            this.flash("#FFE7BC", 0.16);
          }
          if (q.hp <= 0 && q.alive) {
            q.alive = false;
            p.kills++;
            p.hp = Math.min(100, p.hp + 18);
            this.burst(q.x, q.y - 40, "#FF4438", 42, 380);
            this.shake(15);
            this.fx.stop(0.09);
            this.flash("#FF4438", 0.3);
            this.sound("ko", 1.2);
            this.camPunch = 1.4;
            this.fx.text(q.x, q.y - 74, "K.O.", "#FF4438", 40);
            this.fx.text(p.x, p.y - 150, "+18 HP", "#43D97B", 14);
            this.fx.banner(
              "KNOCKOUT",
              this.colors[i % this.colors.length],
              `player ${i + 1} takes player ${this.f.indexOf(q) + 1} out of the round`,
            );
            this.log(`KNOCKOUT — ${p.hp < 100 ? "recovery +18hp" : ""}`);
          }
          break;
        }
      }

      // ring out
      if (p.x < LEFT_EDGE - 26 || p.x > RIGHT_EDGE + 26 || p.y > FLOOR + 200) {
        if (p.alive) {
          p.alive = false;
          this.burst(clamp(p.x, LEFT_EDGE, RIGHT_EDGE), Math.min(p.y, FLOOR + 60), this.colors[i % this.colors.length], 30, 340);
          this.shake(12);
          this.sound("over", 1);
          this.camPunch = 1.2;
          this.fx.text(clamp(p.x, LEFT_EDGE, RIGHT_EDGE), FLOOR - 40, "RING OUT", "#FF4438", 26);
          this.fx.banner(
            "RING OUT",
            this.colors[i % this.colors.length],
            `player ${i + 1} leaves the platform`,
          );
          this.log(`RING OUT — fighter ${i + 1} left the platform`);
        }
      }
    }
    this.advanceCamera(dt);
  }

  scores() {
    return this.f.map((p) => Math.round(p.dealt * 1.2 + p.kills * 140 + (p.alive ? p.hp * 1.4 : 0) + this.elapsed * 1.2));
  }
  alive() {
    return this.f.map((p) => p.alive);
  }
  hud(i: number) {
    const p = this.f[i];
    return [
      { label: "SCORE", value: String(this.scores()[i]).padStart(4, "0"), pct: clamp(this.scores()[i] / 700, 0, 1) },
      { label: "VITAL", value: String(Math.round(p.hp)).padStart(3, "0"), pct: p.hp / 100 },
      { label: "HITS", value: String(p.dealt).padStart(3, "0"), pct: clamp(p.dealt / 130, 0, 1) },
      { label: "K.O.", value: String(p.kills).padStart(2, "0"), pct: clamp(p.kills / 3, 0, 1) },
    ];
  }

  human(i: number, b: HumanButtons) {
    if (!this.f[i]) return;
    this.humanFlag[i] = true;
    // -1 = idle, so an untouched pad means standing still rather than swinging
    this.humanAct[i] = b.left ? 0 : b.right ? 1 : b.up ? 2 : b.a ? 3 : b.b ? 5 : b.down ? 4 : -1;
  }

  release(i: number) {
    this.humanFlag[i] = false;
  }

  // ---------------- decision features ----------------
  private featuresFor(i: number, act: number): number[] {
    const p = this.f[i];
    const { idx, dist } = this.nearestOpp(i);
    const q = idx >= 0 ? this.f[idx] : null;
    const f = new Array(FEATURE_LEN).fill(0);

    const reach = q ? Math.abs(q.x - p.x) : 999;
    const inFront = q ? Math.sign(q.x - p.x) === p.face : false;
    const willHit = act === 3 && p.atkCd <= 0 && reach < ATK_RANGE + 26 && Math.abs((q?.y ?? 0) - p.y) < 80 && inFront;
    const threat = !!q && q.atk > 0.08 && reach < ATK_RANGE + 30;

    const dir = act === 0 ? -1 : act === 1 ? 1 : act === 5 ? p.face : 0;
    const reachAfter = q ? Math.abs(q.x - (p.x + dir * 74)) : 999;
    const closing = clamp((reach - reachAfter) / 74, -1, 1);

    f[0] = closing;
    f[1] = willHit ? 1 : act === 3 ? -0.35 : 0;
    f[2] = p.hp / 100;
    f[3] = q ? 1 - q.hp / 100 : 0;
    f[4] = threat ? -1 : 0;
    f[5] = act === 4 && threat ? 1 : act === 4 ? -0.3 : 0;
    f[6] = 1 - Math.abs(p.x - 480) / 400;
    f[7] = act === 2 && p.air ? -0.5 : act === 2 ? 0.15 : 0;
    f[8] = act === 3 ? (p.atkCd <= 0 ? 1 : -0.6) : act === 5 ? (p.dashCd <= 0 ? 1 : -0.6) : 0.2;
    let near = 0;
    for (let o = 0; o < this.f.length; o++) {
      if (o === i || !this.f[o].alive) continue;
      if (Math.abs(this.f[o].x - p.x) < 190) near++;
    }
    f[9] = clamp(-near / 3, -1, 0);
    f[10] = act === 5 && threat ? 1 : act === 5 && p.dashCd > 0 ? -0.5 : 0;
    f[11] = q && q.hit > 0 ? 1 : 0;
    f[12] = 1;
    f[13] = 0;
    void dist;
    return f;
  }

  options(i: number): Option[] {
    return ACT.map((label, a) => ({ label, feat: this.featuresFor(i, a) }));
  }

  describe(i: number): string {
    const p = this.f[i];
    let s = `GAME: RING BRAWL. Four fighters on one platform. Attack does ${ATK_DMG} damage + knockback that grows as a rival weakens. GUARD cuts damage to 2. Knock a rival's HP to 0, or shove them off the platform edge, to eliminate them.\n`;
    s += `YOU: hp ${Math.round(p.hp)} at x=${Math.round(p.x)} facing ${p.face > 0 ? "RIGHT" : "LEFT"}${p.atkCd > 0 ? " (attack cooling down)" : ""}${p.hit > 0 ? " (STUNNED)" : ""}. Rivals: `;
    for (let o = 0; o < this.f.length; o++) {
      if (o === i) continue;
      const q = this.f[o];
      if (!q.alive) continue;
      s += `#${o + 1} hp ${Math.round(q.hp)} at x=${Math.round(q.x)}${q.atk > 0 ? " ATTACKING" : ""}${q.hit > 0 ? " stunned" : ""}; `;
    }
    s += `\nCHOOSE ONE ACTION (reply with the number only):\n`;
    ACT.forEach((label, a) => {
      const f = this.featuresFor(i, a);
      s += `${a + 1}. ${label} → closing ${f[0].toFixed(2)}, will-hit ${f[1].toFixed(2)}, threat ${f[4].toFixed(0)}, edge-safety ${f[6].toFixed(2)}\n`;
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

    // arena floor surface — tiled so the grain survives the camera punch-in
    drawTiled(ctx, TEX.concrete, -320, -320, 1600, 1180, 720, 0.32);
    ctx.fillStyle = "rgba(6,8,10,0.52)";
    ctx.fillRect(-320, -320, 1600, 1180);

    // backdrop glow
    const g = ctx.createRadialGradient(480, 300, 40, 480, 300, 520);
    g.addColorStop(0, "rgba(255,176,32,0.11)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 960, 540);

    // platform
    const grad = ctx.createLinearGradient(0, FLOOR - 18, 0, FLOOR + 64);
    grad.addColorStop(0, "#2c323a");
    grad.addColorStop(0.12, "#1a1f25");
    grad.addColorStop(1, "#0b0e12");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(LEFT_EDGE - 30, FLOOR - 12);
    ctx.lineTo(RIGHT_EDGE + 30, FLOOR - 12);
    ctx.lineTo(RIGHT_EDGE + 6, FLOOR + 64);
    ctx.lineTo(LEFT_EDGE - 6, FLOOR + 64);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,176,32,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LEFT_EDGE - 30, FLOOR - 12);
    ctx.lineTo(RIGHT_EDGE + 30, FLOOR - 12);
    ctx.stroke();

    // edge markers
    for (const ex of [LEFT_EDGE, RIGHT_EDGE]) {
      ctx.strokeStyle = "rgba(255,68,56,0.45)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.moveTo(ex, FLOOR - 120);
      ctx.lineTo(ex, FLOOR + 20);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // fighters
    for (let i = 0; i < this.f.length; i++) {
      const p = this.f[i];
      if (!p.alive) continue;
      const col = this.colors[i % this.colors.length];
      const bob = p.air ? 0 : Math.sin(p.walk * 3) * 2.2;
      const x = p.x;
      const y = p.y + bob;
      const squash = p.hurt > 0 ? 1 - p.hurt * 0.22 : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(p.face * squash, 1 / squash);

      // shadow
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(x, FLOOR + 3, 26, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(p.face, 1);
      // legs
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(-16, -34, 12, 34);
      ctx.fillRect(5, -34, 12, 34);
      // body
      const body = p.hurt > 0 ? "#ffffff" : col;
      ctx.fillStyle = body;
      ctx.fillRect(-19, -74, 38, 44);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(-19, -74, 38, 8);
      // head
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(2, -92, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0b0e12";
      ctx.fillRect(7, -98, 8, 5);
      // arm / attack
      const thrust = p.atk > 0 ? Math.sin(clamp((0.32 - p.atk) / 0.32, 0, 1) * Math.PI) * 46 : 0;
      ctx.fillStyle = body;
      ctx.fillRect(12, -66, 22 + thrust, 14);
      if (p.blockT > 0) {
        ctx.strokeStyle = "#6EA8FE";
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(24, -60, 30, -1.2, 1.2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // name + hp bar
      const bw = 78;
      const bx = x - bw / 2;
      const by = y - 132;
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
      ctx.fillStyle = "#2a2f37";
      ctx.fillRect(bx, by, bw, 6);
      ctx.fillStyle = p.hp > 35 ? col : "#FF4438";
      ctx.fillRect(bx, by, bw * (p.hp / 100), 6);
      ctx.fillStyle = col;
      ctx.font = "700 11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), x, by - 7);
    }

    ctx.restore();

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(232,226,212,0.5)";
    ctx.font = "600 11px 'IBM Plex Mono', monospace";
    ctx.fillText("RING 04 / RING-OUT ENABLED / GUARD CUTS DAMAGE TO 2", 22, 518);
    const aliveN = this.f.filter((p) => p.alive).length;
    ctx.textAlign = "right";
    ctx.fillText(`${aliveN} STILL STANDING`, 938, 518);
    ctx.textAlign = "left";
  }
}

export const brawlPrior = PRIOR;
