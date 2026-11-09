// Voice desk — real speech synthesis, one distinct system voice per model.
// Keyless and in-browser: no service, no key, nothing leaves the machine.

export interface VoicePref {
  gender: "m" | "f" | "n";
  rate: number;
  pitch: number;
}

interface Job {
  id: string;
  name: string;
  text: string;
  pref: VoicePref;
  prio: number;
  enqueued: number;
}

const clean = (s: string) =>
  s
    .replace(/[“”"']/g, "")
    .replace(/[—–_]/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 190);

class VoiceDesk {
  private synth: SpeechSynthesis | null = null;
  voices: SpeechSynthesisVoice[] = [];
  private chosen = new Map<string, SpeechSynthesisVoice | null>();
  private prefs = new Map<string, VoicePref>();
  private names = new Map<string, string>();
  private live = new Map<string, string>();
  private queue: Job[] = [];
  private pumping = false;
  private lastStart = 0;
  private modelCooldown = new Map<string, number>();
  private listeners = new Set<() => void>();
  enabled = true;
  supported = false;

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }

  init() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.supported = true;
    this.synth = window.speechSynthesis;
    const load = () => {
      const v = this.synth!.getVoices();
      if (v.length && v.length !== this.voices.length) {
        this.voices = v;
        // re-assign everyone against the newly available voice set
        this.chosen.clear();
        for (const id of this.prefs.keys()) {
          this.chosen.set(id, null);
          this.assign(id);
        }
        this.emit();
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    // Chrome populates the voice list late and asynchronously
    let tries = 0;
    const tick = () => {
      load();
      if (!this.voices.length && tries++ < 24) window.setTimeout(tick, 250);
    };
    window.setTimeout(tick, 200);
  }

  /** Called once per model so the desk can reserve a distinct voice. */
  register(id: string, name: string, pref: VoicePref) {
    this.prefs.set(id, pref);
    this.names.set(id, name);
    if (!this.chosen.has(id)) this.chosen.set(id, null);
    this.assign(id);
    this.emit();
  }

  voiceLabel(id: string): string {
    const v = this.chosen.get(id);
    if (v === undefined) return "unassigned";
    if (v === null) return this.voices.length ? "assigning…" : "system default";
    return v.name.replace(/\s*\(.*\)\s*$/, "").slice(0, 26);
  }

  private assign(id: string) {
    if (!this.voices.length) return;
    const pref = this.prefs.get(id);
    const used = new Set<string>();
    for (const [k, v] of this.chosen) if (k !== id && v) used.add(v.voiceURI);

    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -Infinity;
    for (const v of this.voices) {
      const n = v.name.toLowerCase();
      let s = 0;
      if (v.lang.toLowerCase().startsWith("en")) s += 3;
      if (used.has(v.voiceURI)) s -= 6;
      if (pref) {
        if (pref.gender === "m" && /\b(male|daniel|david|james|george|richard|guy|man)\b/.test(n)) s += 4;
        if (pref.gender === "f" && /\b(female|samantha|victoria|karen|moira|tessa|zira|woman|girl)\b/.test(n))
          s += 4;
        if (pref.gender === "n") s += 1;
      }
      if (/google/.test(n)) s += 2.4;
      if (/natural|neural|premium|enhanced/.test(n)) s += 2;
      if (/compact|espeak|robot/.test(n)) s -= 3;
      s += (v.voiceURI.charCodeAt(0) % 7) * 0.12; // deterministic tie-break, distinct per model
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    }
    this.chosen.set(id, best);
  }

  /** Speak a line. Higher priority cuts the queue; nothing ever plays over itself. */
  speak(id: string, text: string, prio = 1) {
    if (!this.enabled || !this.supported || !this.synth) return;
    const t = clean(text);
    if (!t) return;
    const now = performance.now();
    const cooled = this.modelCooldown.get(id) ?? 0;
    if (prio < 2 && now < cooled) return;
    this.modelCooldown.set(id, now + (prio >= 2 ? 2600 : 6200));

    if (prio >= 3) {
      // an important line bumps everything else
      this.queue = this.queue.filter((j) => j.prio >= 3);
      try {
        this.synth.cancel();
      } catch {
        /* ignore */
      }
      this.pumping = false;
    }
    if (this.queue.length > 3) this.queue.splice(0, this.queue.length - 3);
    this.queue.push({
      id,
      name: this.names.get(id) ?? id,
      text: t,
      pref: this.prefs.get(id) ?? { gender: "n", rate: 1, pitch: 1 },
      prio,
      enqueued: now,
    });
    // most important first, then oldest
    this.queue.sort((a, b) => b.prio - a.prio || a.enqueued - b.enqueued);
    void this.pump();
  }

  private pump() {
    if (this.pumping || !this.synth || !this.queue.length) return;
    const gap = performance.now() - this.lastStart;
    if (gap < 950) {
      window.setTimeout(() => void this.pump(), 950 - gap);
      return;
    }
    const job = this.queue.shift();
    if (!job) return;
    this.pumping = true;
    this.lastStart = performance.now();

    const u = new SpeechSynthesisUtterance(job.text);
    const v = this.chosen.get(job.id) ?? null;
    if (v) u.voice = v;
    if (v?.lang) u.lang = v.lang;
    u.pitch = job.pref.pitch;
    u.rate = job.pref.rate;
    u.volume = 1;

    u.onstart = () => {
      this.live.set(job.id, job.text);
      this.emit();
    };
    const done = () => {
      this.live.delete(job.id);
      this.pumping = false;
      this.emit();
      void this.pump();
    };
    u.onend = done;
    u.onerror = done;

    try {
      this.synth.speak(u);
      // watchdog: some browsers never fire onend
      window.setTimeout(() => {
        if (this.live.has(job.id) && !this.synth!.speaking) done();
      }, 3200 + job.text.length * 78);
    } catch {
      done();
    }
  }

  /** id -> text currently being spoken */
  speaking(): Map<string, string> {
    return this.live;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v && this.synth) {
      try {
        this.synth.cancel();
      } catch {
        /* ignore */
      }
      this.queue.length = 0;
      this.live.clear();
      this.pumping = false;
    }
    this.emit();
  }

  test(id: string, text: string) {
    if (!this.synth) return;
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
    this.pumping = false;
    this.queue.length = 0;
    this.modelCooldown.delete(id);
    this.speak(id, text, 3);
  }

  stopAll() {
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch {
        /* ignore */
      }
    }
    this.queue.length = 0;
    this.live.clear();
    this.pumping = false;
  }
}

export const voice = new VoiceDesk();
