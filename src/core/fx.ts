import type { SfxName } from "@/core/audio";

// Shared juice layer: particles, floating numerals, broadcast banner,
// screen shake, hit-stop and flashes.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
  grav: number;
  shape: 0 | 1; // 0 = square spark, 1 = line streak
}

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
}

export class FX {
  parts: Particle[] = [];
  texts: FloatText[] = [];
  private shakeMag = 0;
  private shakeT = 0;
  flashA = 0;
  flashColor = "#ffffff";
  hitStop = 0;
  time = 0;

  /** wired to the WebAudio desk by the match loop */
  sfx?: (name: SfxName, v: number) => void;

  bannerText = "";
  bannerSub = "";
  bannerColor = "#FFB020";
  bannerT = 0;

  sound(name: SfxName, v = 1) {
    this.sfx?.(name, v);
  }

  /** the match loop subscribes so the minds can react to what just happened */
  onBanner?: (text: string, sub: string) => void;

  banner(text: string, color = "#FFB020", sub = "") {
    this.bannerText = text;
    this.bannerSub = sub;
    this.bannerColor = color;
    this.bannerT = 1;
    this.sound("tick", 0.8);
    this.onBanner?.(text, sub);
  }

  text(x: number, y: number, str: string, color = "#FFD27A", size = 16) {
    if (this.texts.length > 40) return;
    this.texts.push({ x, y, vy: -66, life: 1, max: 1, text: str, color, size });
  }

  burst(x: number, y: number, color: string, n = 12, speed = 190) {
    const room = 900 - this.parts.length;
    if (room <= 0) return;
    const count = Math.min(n, room);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.25 + Math.random() * 1.05);
      const life = 0.28 + Math.random() * 0.62;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        size: 1.6 + Math.random() * 3.6,
        color,
        drag: 0.86 + Math.random() * 0.1,
        grav: Math.random() < 0.4 ? 320 : 0,
        shape: Math.random() < 0.3 ? 1 : 0,
      });
    }
  }

  ring(x: number, y: number, color: string, n = 10, speed = 240) {
    const room = 900 - this.parts.length;
    const count = Math.min(n, Math.max(0, room));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const life = 0.32 + Math.random() * 0.3;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life,
        max: life,
        size: 2.2 + Math.random() * 2.2,
        color,
        drag: 0.9,
        grav: 0,
        shape: 1,
      });
    }
  }

  trail(x: number, y: number, color: string, vx = 0, vy = 0) {
    if (this.parts.length > 880) return;
    const life = 0.18 + Math.random() * 0.3;
    this.parts.push({
      x,
      y,
      vx: vx + (Math.random() - 0.5) * 40,
      vy: vy + (Math.random() - 0.5) * 40,
      life,
      max: life,
      size: 1.2 + Math.random() * 2.6,
      color,
      drag: 0.92,
      grav: 0,
      shape: 0,
    });
  }

  shake(mag: number) {
    this.shakeMag = Math.min(24, Math.max(this.shakeMag, mag));
    this.shakeT = 1;
  }

  flash(color: string, a: number) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  }

  stop(t: number) {
    this.hitStop = Math.max(this.hitStop, t);
  }

  clear() {
    this.parts.length = 0;
    this.texts.length = 0;
    this.shakeMag = 0;
    this.flashA = 0;
    this.hitStop = 0;
    this.bannerT = 0;
  }

  update(dt: number) {
    this.time += dt;
    if (this.shakeT > 0) {
      this.shakeT -= dt * 3.4;
      if (this.shakeT <= 0) this.shakeMag = 0;
    }
    this.flashA = Math.max(0, this.flashA - dt * 2.6);
    if (this.hitStop > 0) this.hitStop -= dt;
    if (this.bannerT > 0) this.bannerT = Math.max(0, this.bannerT - dt * 0.34);

    const p = this.parts;
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      q.life -= dt;
      if (q.life <= 0) {
        p[i] = p[p.length - 1];
        p.pop();
        continue;
      }
      const d = Math.pow(q.drag, dt * 60);
      q.vx *= d;
      q.vy *= d;
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }

    const t = this.texts;
    for (let i = t.length - 1; i >= 0; i--) {
      const q = t[i];
      q.life -= dt * 1.05;
      if (q.life <= 0) {
        t[i] = t[t.length - 1];
        t.pop();
        continue;
      }
      q.y += q.vy * dt;
      q.vy *= Math.pow(0.94, dt * 60);
    }
  }

  /** returns the shake offset for this frame */
  offset(): [number, number] {
    if (this.shakeT <= 0 || this.shakeMag <= 0) return [0, 0];
    const m = this.shakeMag * this.shakeT * this.shakeT;
    return [(Math.random() - 0.5) * m * 2, (Math.random() - 0.5) * m * 2];
  }

  /** world-space: particles and floating numerals (call inside the camera) */
  drawWorld(ctx: CanvasRenderingContext2D) {
    const p = this.parts;
    ctx.save();
    for (let i = 0; i < p.length; i++) {
      const q = p[i];
      const t = q.life / q.max;
      const a = t * t;
      ctx.globalAlpha = Math.min(1, a * 1.25);
      ctx.fillStyle = q.color;
      const s = q.size * (0.35 + t * 0.85);
      if (q.shape === 0) {
        ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      } else {
        ctx.strokeStyle = q.color;
        ctx.lineWidth = Math.max(1, s * 0.55);
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.022, q.y - q.vy * 0.022);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    for (const q of this.texts) {
      const t = q.life / q.max;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.font = `700 ${q.size}px 'IBM Plex Mono', monospace`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(4,6,8,0.85)";
      ctx.strokeText(q.text, q.x, q.y);
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, q.x, q.y);
    }
    ctx.restore();
  }

  /** screen-space: flash + broadcast lower-third */
  drawScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flashA > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.85, this.flashA);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (this.bannerT > 0 && this.bannerText) {
      const t = this.bannerT;
      // slide in fast, hold, then drift up and fade
      const inT = Math.min(1, (1 - t) * 9);
      const ease = 1 - Math.pow(1 - inT, 3);
      const fade = t < 0.16 ? t / 0.16 : 1;
      const bw = Math.min(
        w - 44,
        Math.max(this.bannerText.length * 12.6, this.bannerSub.length * 6.8) + 38,
      );
      const bx = 22 - (1 - ease) * 40;
      const by = h - 132 + (1 - fade) * 16;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = "rgba(8,10,12,0.86)";
      ctx.fillRect(bx, by, bw, 56);
      ctx.fillStyle = this.bannerColor;
      ctx.fillRect(bx, by, 5, 56);
      ctx.fillRect(bx, by + 54, bw * Math.max(0, t), 2);

      ctx.textAlign = "left";
      ctx.font = "700 15px 'IBM Plex Mono', monospace";
      ctx.fillStyle = this.bannerColor;
      ctx.fillText(this.bannerText, bx + 18, by + (this.bannerSub ? 25 : 33));
      if (this.bannerSub) {
        ctx.font = "italic 400 11px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "rgba(232,226,212,0.72)";
        ctx.fillText(this.bannerSub, bx + 18, by + 43);
      }
      ctx.restore();
    }
  }
}
