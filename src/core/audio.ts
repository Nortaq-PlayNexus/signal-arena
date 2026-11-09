// A tiny procedural sound desk. No sample files — every voice is synthesised,
// so the whole thing survives being inlined into a single HTML document.
// Autoplay policy: the context is created on the first user gesture.

export type SfxName =
  | "click"
  | "toggle"
  | "start"
  | "chomp"
  | "power"
  | "lock"
  | "clear"
  | "boost"
  | "hit"
  | "block"
  | "ko"
  | "jump"
  | "lap"
  | "flag"
  | "over"
  | "tick"
  | "glitch";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlay: Record<string, number> = {};
  muted = false;
  ready = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      // gentle bus compression keeps peaks from clipping on the big hits
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      master.connect(comp);
      comp.connect(ctx.destination);

      const len = Math.floor(ctx.sampleRate * 1.4);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.noiseBuf = buf;
      this.ready = true;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private gate(name: string, minGap: number) {
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return false;
    this.lastPlay[name] = now;
    return true;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
    delay = 0,
  ) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, freq: number, q = 1.2, delay = 0, sweepTo?: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(freq, t);
    filt.Q.value = q;
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  play(name: SfxName, v = 1) {
    if (!this.ctx || this.muted) return;
    const v2 = Math.max(0.15, Math.min(1.6, v));
    switch (name) {
      case "click":
        if (!this.gate("click", 34)) return;
        this.tone(760, 0.045, "square", 0.075 * v2, 980);
        break;
      case "toggle":
        this.tone(430, 0.05, "square", 0.09 * v2);
        this.tone(720, 0.07, "square", 0.07 * v2, undefined, 0.05);
        break;
      case "start":
        [220, 330, 440, 660, 880].forEach((f, i) =>
          this.tone(f, 0.16, "triangle", 0.11 * v2, f * 1.02, i * 0.075),
        );
        this.noise(0.5, 0.06, 320, 0.8, 0.05, 1800);
        break;
      case "chomp":
        if (!this.gate("chomp", 42)) return;
        this.tone(300, 0.055, "square", 0.05 * v2, 620);
        break;
      case "power":
        this.tone(170, 0.34, "sawtooth", 0.1 * v2, 920);
        this.tone(255, 0.34, "square", 0.05 * v2, 1380, 0.03);
        this.noise(0.3, 0.05, 900, 1.1, 0, 2600);
        break;
      case "lock":
        if (!this.gate("lock", 40)) return;
        this.tone(180, 0.07, "square", 0.075 * v2, 120);
        this.noise(0.06, 0.05, 1500, 1.4);
        break;
      case "clear": {
        const base = 392;
        for (let i = 0; i < 4; i++)
          this.tone(base * Math.pow(1.26, i), 0.17, "triangle", 0.1 * v2, undefined, i * 0.062);
        this.noise(0.28, 0.055, 2400, 1, 0.02, 900);
        break;
      }
      case "boost":
        if (!this.gate("boost", 130)) return;
        this.tone(210, 0.36, "sawtooth", 0.095 * v2, 1180);
        this.noise(0.34, 0.05, 620, 0.8, 0, 2200);
        break;
      case "hit":
        if (!this.gate("hit", 55)) return;
        this.noise(0.17, 0.16 * v2, 1500, 0.9, 0, 380);
        this.tone(150, 0.16, "sine", 0.16 * v2, 58);
        break;
      case "block":
        if (!this.gate("block", 70)) return;
        this.noise(0.11, 0.09 * v2, 3000, 2.2);
        this.tone(520, 0.1, "triangle", 0.08 * v2, 300);
        break;
      case "ko":
        this.noise(0.42, 0.2 * v2, 900, 0.7, 0, 120);
        this.tone(120, 0.5, "sawtooth", 0.15 * v2, 42);
        this.tone(300, 0.24, "square", 0.07 * v2, 90, 0.05);
        break;
      case "jump":
        if (!this.gate("jump", 90)) return;
        this.tone(330, 0.11, "triangle", 0.06 * v2, 620);
        break;
      case "lap":
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.13, "triangle", 0.09 * v2, undefined, i * 0.07));
        break;
      case "flag":
        [523, 659, 784, 1046, 1318].forEach((f, i) =>
          this.tone(f, 0.28, "triangle", 0.11 * v2, undefined, i * 0.1),
        );
        this.noise(0.6, 0.05, 2200, 0.8, 0.1, 700);
        break;
      case "over":
        [440, 370, 294, 220, 147].forEach((f, i) =>
          this.tone(f, 0.34, "sawtooth", 0.1 * v2, f * 0.92, i * 0.11),
        );
        break;
      case "tick":
        if (!this.gate("tick", 60)) return;
        this.tone(1180, 0.028, "square", 0.05 * v2);
        break;
      case "glitch":
        if (!this.gate("glitch", 220)) return;
        this.noise(0.09, 0.07 * v2, 2600, 3.2);
        this.tone(880, 0.05, "square", 0.04 * v2, 240);
        break;
    }
  }
}

export const audio = new AudioEngine();

/** Arm the audio bus on the first gesture anywhere on the page. */
export function armAudio() {
  const go = () => {
    audio.init();
    window.removeEventListener("pointerdown", go);
    window.removeEventListener("keydown", go);
  };
  window.addEventListener("pointerdown", go, { once: false });
  window.addEventListener("keydown", go, { once: false });
}
