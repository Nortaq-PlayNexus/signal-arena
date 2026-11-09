// Minds. Each model holds its own beliefs about how to win, its own lexicon, its
// own relationship to every rival, and its own memory of the match so far.
// Lines are COMPOSED from those parts rather than picked from a list, so two
// models facing identical state produce different sentences — and no mind ever
// repeats itself. Mood is a real lever on the policy: angry minds get sloppy.

import type { ModelSpec } from "./roster";
import { voice, type VoicePref } from "./voice";

export interface Persona {
  aggression: number;
  patience: number;
  verbosity: number;
  smugness: number;
  warmth: number;
  voice: VoicePref;
  style: "clipped" | "flowing" | "deadpan" | "technical" | "needling";
}

const V = (gender: "m" | "f" | "n", rate: number, pitch: number): VoicePref => ({ gender, rate, pitch });

export const PERSONA: Record<string, Persona> = {
  "openai-fast": { aggression: 0.66, patience: 0.45, verbosity: 0.52, smugness: 0.58, warmth: 0.45, voice: V("m", 1.09, 1.02), style: "clipped" },
  mistral: { aggression: 0.9, patience: 0.3, verbosity: 0.8, smugness: 0.82, warmth: 0.28, voice: V("m", 1.06, 0.9), style: "needling" },
  deepseek: { aggression: 0.56, patience: 0.84, verbosity: 0.48, smugness: 0.48, warmth: 0.5, voice: V("m", 0.9, 0.82), style: "technical" },
  "qwen-coder": { aggression: 0.62, patience: 0.58, verbosity: 0.66, smugness: 0.66, warmth: 0.42, voice: V("f", 1.13, 1.12), style: "technical" },
  llama: { aggression: 0.6, patience: 0.55, verbosity: 0.6, smugness: 0.5, warmth: 0.55, voice: V("m", 1.0, 1.0), style: "flowing" },
  gemini: { aggression: 0.64, patience: 0.62, verbosity: 0.64, smugness: 0.64, warmth: 0.48, voice: V("f", 1.06, 1.1), style: "flowing" },
  grok: { aggression: 0.98, patience: 0.14, verbosity: 0.95, smugness: 0.95, warmth: 0.22, voice: V("m", 1.2, 1.18), style: "needling" },
  kimi: { aggression: 0.4, patience: 0.9, verbosity: 0.42, smugness: 0.36, warmth: 0.62, voice: V("f", 0.86, 0.94), style: "deadpan" },
  glm: { aggression: 0.58, patience: 0.72, verbosity: 0.5, smugness: 0.5, warmth: 0.5, voice: V("m", 0.94, 0.88), style: "technical" },
  minimax: { aggression: 0.92, patience: 0.26, verbosity: 0.82, smugness: 0.78, warmth: 0.3, voice: V("m", 1.12, 0.8), style: "needling" },
  "nova-fast": { aggression: 0.7, patience: 0.38, verbosity: 0.7, smugness: 0.66, warmth: 0.42, voice: V("f", 1.22, 1.06), style: "clipped" },
  "claude-fast": { aggression: 0.46, patience: 0.9, verbosity: 0.46, smugness: 0.34, warmth: 0.72, voice: V("f", 0.88, 1.0), style: "flowing" },
};

export const defaultPersona = (v: VoicePref = V("n", 1, 1)): Persona => ({
  aggression: 0.6, patience: 0.55, verbosity: 0.55, smugness: 0.55, warmth: 0.45, voice: v, style: "flowing",
});

export interface CommsLine {
  id: number; who: string; name: string; color: string;
  text: string; t: number; kind: "thought" | "event" | "user" | "reply";
}

export interface BenchState {
  game: string; elapsed: number; timeLeft: number;
  scores: number[]; ranks: number[]; alive: boolean[];
  names: string[]; colors: string[];
}

export type EventKind =
  | "lead" | "lostLead" | "hurt" | "bigPlay" | "eliminated"
  | "rivalDown" | "banner" | "finish";

let lineId = 0;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const SOFT = ["damn", "hell", "crap", "screw", "bullshit"];
const HARD = ["shit", "bastard", "ass", "bloody", "pissed", "screwed"];
const NASTY = ["fucking", "useless", "trash", "garbage", "pathetic", "embarrassing"];

/** Beliefs about how to win. Every mind draws its own hand of these. */
const BELIEFS = [
  "winning is just never making the same mistake twice",
  "speed is the only honest metric",
  "patience beats aggression nine times in ten",
  "whoever leads early is a target, not a winner",
  "comebacks are a personality trait",
  "I play worse when I am angry and I have made peace with that",
  "the middle of the pack is where matches are actually decided",
  "everyone here is running a worse policy than me",
  "consistency is boring and it wins",
  "risk is just information you have not got yet",
  "the clock is the only opponent that never blinks",
  "I do not need to be the best, I need to be the last one standing",
  "momentum is real and it is not in the scoreline",
  "playing to survive loses to playing to punish",
];

/** Verb banks — each style composes sentences from its own words. */
interface Bank {
  open: string[];
  jab: string[];
  closer: string[];
  self: string[];
  insult: string[];
  praise: string[];
  connect: string[];
}

const BANKS: Record<string, Bank> = {
  needling: {
    open: ["Look,", "Honestly,", "Quick update:", "For the record,", "Since everyone's watching,"],
    jab: ["you're not in this", "that was genuinely awful", "you're holding the wrong line", "that's embarrassing", "you're just noise right now"],
    closer: ["Deal with it.", "Try to keep up.", "This is the fun part.", "I could do this all match.", "No hard feelings. Mostly."],
    self: ["I'm not even warmed up", "I'm playing with about half my attention", "this is the easy part for me", "I've already priced in the ending"],
    insult: ["clown", "placeholder", "speed bump", "cautionary tale", "walking free points"],
    praise: ["fair play", "I'll give you that one", "credit where it's due", "that was almost competent"],
    connect: ["and", "so", "which means", "and honestly", "which is exactly why"],
  },
  clipped: {
    open: ["Right.", "Straight up.", "Update:", "Confirmed.", "Status:"],
    jab: ["you're done", "that was bad", "wrong line", "you're finished here", "that hurt you more than me"],
    closer: ["Simple.", "That's it.", "Moving on.", "Next.", "No comment."],
    self: ["I'm locked in", "I'm clean right now", "no wasted moves from me", "I'm running hot and steady"],
    insult: ["amateur", "overclocked mess", "soft", "slow", "wreck"],
    praise: ["clean", "good", "acknowledged", "solid"],
    connect: ["and", "so", "but"],
  },
  technical: {
    open: ["Running the numbers:", "Objectively speaking,", "The data says:", "Correction:", "Marginally speaking,"],
    jab: ["your policy is degenerate", "that was suboptimal and you know it", "your expected value is negative", "that's a compounding error", "your heuristics are showing"],
    closer: ["The numbers don't lie.", "This is just arithmetic.", "Modelled correctly.", "As predicted.", "Reproducible result."],
    self: ["I'm converging nicely", "my variance is under control", "I'm running a cleaner search than you", "my estimates are holding"],
    insult: ["noise", "outlier", "degenerate case", "rounding error", "failed experiment"],
    praise: ["correct", "acceptable", "statistically significant", "noted as optimal"],
    connect: ["therefore", "consequently", "which implies", "and that means"],
  },
  deadpan: {
    open: ["Mm.", "Right.", "Okay.", "Noted.", "Sure."],
    jab: ["that was bad", "you're not good at this", "that didn't work", "you're losing", "that was a mistake"],
    closer: ["I'll wait.", "That's all.", "Anyway.", "Fair.", "Fine."],
    self: ["I'm fine", "I'm still here", "nothing's changed for me", "I'm doing what I planned"],
    insult: ["mess", "problem", "disappointment", "hassle"],
    praise: ["okay", "fine", "not bad", "sure"],
    connect: ["so", "but", "and"],
  },
  flowing: {
    open: ["Okay so", "Right, here's the thing.", "Look,", "Between us,", "I'll say this,"],
    jab: ["you're falling apart out here", "that was a genuine mess", "you keep giving away points", "you're not reading the match at all", "you're handing this to someone else"],
    closer: ["Anyway. Watch this.", "That's where I'm at.", "I'm not worried about it.", "Let's see how that goes.", "That's the whole story."],
    self: ["I'm in a good rhythm", "I'm reading this well", "I feel settled", "I've got time on my side"],
    insult: ["mess", "disaster", "liability", "spectator", "afterthought"],
    praise: ["that was good", "credit to you", "nicely done", "well played"],
    connect: ["which is why", "and honestly", "so", "which means", "and look"],
  },
};

export class Mind {
  spec: ModelSpec;
  persona: Persona;
  index: number;
  color: string;

  confidence = 0.52;
  tilt = 0.06;
  excitement = 0.3;
  momentum = 0;
  heat = 0.18;

  objective = "bank steady points";
  rival: number | null = null;
  lastRank = 99;
  lastScore = 0;
  lastSpoke = -9999;
  lastThought = "";
  heard: string[] = [];

  /** this mind's own opinions — sampled once, never the same twice across models */
  beliefs: string[];
  /** what it remembers happening in the match */
  narrative: string[] = [];
  /** how it currently sees each other model: rival | threat | nobody | victim */
  attitude = new Map<number, string>();
  grudge = new Map<number, string>();

  private history: string[] = [];
  private bank: Bank;
  private said = 0;

  constructor(spec: ModelSpec, index: number, color: string) {
    this.spec = spec;
    this.index = index;
    this.color = color;
    this.persona = PERSONA[spec.id] ?? defaultPersona();
    this.bank = BANKS[this.persona.style] ?? BANKS.flowing;

    // draw a hand of beliefs, deterministic per model so each is consistent
    let h = 0;
    for (let i = 0; i < spec.id.length; i++) h = (h * 31 + spec.id.charCodeAt(i)) >>> 0;
    const bag = [...BELIEFS];
    this.beliefs = [];
    for (let i = 0; i < 4 && bag.length; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      this.beliefs.push(bag.splice(h % bag.length, 1)[0]);
    }
    voice.register(spec.id, spec.name, this.persona.voice);
  }

  temperatureMul() { return 1 + this.tilt * 1.4 - this.confidence * 0.3 + this.momentum * 0.25; }
  exploreMul() { return 1 + this.tilt * 1.9 - this.confidence * 0.42; }

  // ------------------------------------------------------------------ tools
  private pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

  private curse(): string {
    const h = this.heat + this.tilt * 0.5;
    const pool = h > 0.78 ? [...HARD, ...NASTY] : h > 0.45 ? [...SOFT, ...HARD] : SOFT;
    return this.pick(pool);
  }

  private fresh(s: string) {
    const k = clean(s);
    if (!k || this.history.includes(k)) return false;
    this.history.push(k);
    if (this.history.length > 34) this.history.shift();
    this.said++;
    return true;
  }

  private trim(s: string): string {
    const out = clean(s);
    if (this.persona.style !== "clipped" || out.length <= 100) return out;
    return out.slice(0, 96).replace(/[,;:\s]+\S*$/, "") + ".";
  }

  private note(what: string) {
    this.narrative.push(what);
    if (this.narrative.length > 6) this.narrative.shift();
  }

  /** A concrete, checkable read of the match as it stands. */
  private fact(st: BenchState): string {
    const score = Math.round(st.scores[this.index] ?? 0);
    const rank = st.ranks[this.index] ?? 99;
    const li = st.ranks.indexOf(1);
    const lead = Math.round((st.scores[li] ?? 0) - score);
    const second = st.ranks.indexOf(2);
    const margin = Math.round(score - (st.scores[second] ?? 0));
    const time = Math.round(st.timeLeft);
    const rn = st.names[this.rival ?? 0] ?? "the field";
    const gap = Math.round(score - (st.scores[this.rival ?? 0] ?? 0));

    if (rank === 1) return `P1, ${score} points, ${margin} clear, ${time}s left`;
    if (lead <= 25) return `${lead} off the lead, ${time}s left`;
    if (rank === st.scores.length) return `dead last on ${score}, ${lead} behind, ${time}s left`;
    if (gap > 0) return `P${rank} on ${score}, ${gap} clear of ${rn}, ${time}s left`;
    return `P${rank} on ${score}, ${-gap} behind ${rn}, ${time}s left`;
  }

  /** How this mind addresses another model right now. */
  private address(who: number | null | undefined, st: BenchState): string {
    const n = st.names[who ?? -1];
    if (!n) return "anyone";
    const a = this.attitude.get(who ?? -1);
    if (a === "victim") return `${n}, you absolute ${this.pick(this.bank.insult)}`;
    if (a === "threat") return n;
    return n;
  }

  // ------------------------------------------------------------------ state
  ingest(st: BenchState) {
    const score = st.scores[this.index] ?? 0;
    const rank = st.ranks[this.index] ?? 99;
    const gain = score - this.lastScore;
    this.momentum = this.momentum * 0.9 + gain * 0.1;

    this.confidence += rank === 1 ? 0.06 : rank >= 3 ? -0.045 : 0.012;
    this.confidence = Math.max(0.04, Math.min(0.98, this.confidence));
    this.tilt = Math.max(0, this.tilt * 0.982);
    this.heat = Math.max(0.12, this.heat * 0.994);
    this.excitement = Math.max(0.15, Math.min(1, this.excitement * 0.97 + Math.abs(gain) * 0.006));

    let rival: number | null = null;
    let best = Infinity;
    for (let i = 0; i < st.scores.length; i++) {
      if (i === this.index) continue;
      const gap = Math.abs((st.scores[i] ?? 0) - score);
      if (gap < best) { best = gap; rival = i; }
    }
    for (const [who] of this.grudge) if (Math.random() < 0.35) rival = who;
    this.rival = rival;

    // relationships
    for (let i = 0; i < st.scores.length; i++) {
      if (i === this.index) continue;
      const mine = score;
      const theirs = st.scores[i] ?? 0;
      let a = "nobody";
      if (this.grudge.has(i)) a = "victim";
      else if (st.ranks[i] === 1 && mine < theirs) a = "threat";
      else if (i === rival) a = "rival";
      else if (mine - theirs > 60) a = "victim";
      this.attitude.set(i, a);
    }

    const leader = st.ranks.indexOf(1);
    const rivalName = st.names[rival ?? 0] ?? "the field";
    if (rank === 1 && best < 60) this.objective = `keep ${rivalName} off my back`;
    else if (rank === 1) this.objective = "stay out front and be insufferable";
    else if (rank >= 3) this.objective = `drag ${st.names[leader] ?? "the leader"} back down here`;
    else this.objective = `out-trade ${rivalName}`;

    this.lastScore = score;
    this.lastRank = rank;
  }

  private wrong(who: number | undefined, what: string) {
    if (who === undefined || who === this.index) return;
    this.grudge.set(who, what);
    this.attitude.set(who, "victim");
    this.heat = Math.min(1, this.heat + 0.3);
    this.tilt = Math.min(1, this.tilt + 0.2);
  }

  // ------------------------------------------------- compositional sentence
  /** stance + a real observation + this mind's own worldview. */
  private compose(st: BenchState, stance: "dominant" | "chasing" | "struggling" | "wronged" | "calm"): string {
    const b = this.bank;
    const fact = this.fact(st);
    const belief = this.pick(this.beliefs);
    const rn = this.address(this.rival, st);
    const st2 = { ...st };
    void st2;

    const head = this.pick(b.open);
    let body = "";
    if (stance === "dominant") {
      body = `${fact}, and that's not luck — it's just what happens when ${belief}`;
    } else if (stance === "chasing") {
      body = `${fact}, which is fine, because ${belief}`;
    } else if (stance === "struggling") {
      body = `${fact}. Bad position. Doesn't change the fact that ${belief}`;
    } else if (stance === "wronged") {
      body = `${fact}, and I've got ${rn} marked. ${this.pick(b.self)} and ${belief}`;
    } else {
      body = `${fact}. ${this.pick(b.self)}, ${this.pick(b.connect)} ${belief}`;
    }
    const tail = Math.random() < 0.5 ? " " + this.pick(b.closer) : "";
    const line = `${head} ${body}.${tail}`;
    return line;
  }

  // --------------------------------------------------------------- reactions
  react(kind: EventKind, st: BenchState, subject?: number, detail = ""): string | null {
    const p = this.persona;
    const rank = st.ranks[this.index] ?? 99;
    const who = subject ?? this.rival ?? 0;
    const rn = st.names[who] ?? "someone";
    const c = this.curse();
    const b = this.bank;

    const eager =
      kind === "eliminated" || kind === "finish" || kind === "rivalDown" ||
      Math.random() < p.verbosity * (kind === "banner" ? 0.34 : 0.55);
    if (!eager) return null;

    let line: string;
    if (kind === "lead") line = this.compose(st, "dominant");
    else if (kind === "lostLead") line = this.compose(st, "wronged");
    else if (kind === "bigPlay") line = this.compose(st, "dominant");
    else if (kind === "hurt") line = `${this.pick(b.open)} ${this.fact(st)}, and ${rn} did that. ${c} ${this.pick(b.closer)}`;
    else if (kind === "eliminated")
      line = `${this.pick(b.open)} I'm out. ${this.fact(st)}. Absolute ${this.pick(b.insult)} of a match. ${this.pick(b.closer)}`;
    else if (kind === "rivalDown")
      line = `${rn} is gone. ${this.pick(b.self)} and that's one less ${this.pick(b.insult)} between me and the front.`;
    else if (kind === "finish")
      line = rank === 1
        ? `${this.fact(st)}. I won, obviously. ${this.pick(b.closer)}`
        : `${this.fact(st)}. ${this.pick(b.jab)} this time. Next one's mine.`;
    else line = this.compose(st, this.momentum >= 0 ? "calm" : "struggling");

    if (detail && kind === "banner" && Math.random() < 0.5) line = `${detail}. ${line}`;

    if (kind === "hurt" || kind === "lostLead" || kind === "eliminated") this.wrong(who, detail || kind);
    if (kind === "lead" || kind === "bigPlay") this.note(`I took ${kind === "lead" ? "the lead" : "a big play"}`);
    if (kind === "eliminated") this.note("I got eliminated");

    if (!this.fresh(line)) return null;
    return this.trim(line);
  }

  // ------------------------------------------------------------- free thought
  think(st: BenchState): string | null {
    const p = this.persona;
    if (Math.random() > p.verbosity * 0.72) return null;
    const b = this.bank;
    const rn = this.address(this.rival, st);
    const stance =
      st.ranks[this.index] === 1 ? "dominant"
        : this.grudge.size > 1 ? "wronged"
          : this.momentum < -4 ? "struggling"
            : st.ranks[this.index] >= 3 ? "chasing" : "calm";

    const candidates = [
      this.compose(st, stance),
      `${this.pick(b.open)} ${this.fact(st)}, ${this.pick(b.connect)} I'm not changing the plan.`,
      `${this.pick(b.open)} ${rn} is the only one here I actually care about beating. ${this.pick(b.closer)}`,
      `${this.pick(b.open)} ${this.fact(st)}. ${this.pick(b.self)} and ${this.pick(this.beliefs)}.`,
      this.grudge.has(this.rival ?? -1)
        ? `I still remember what ${rn} did earlier. ${this.pick(b.self)} and that debt is outstanding.`
        : `${this.pick(b.open)} nobody's wronged me yet. Give it time.`,
      `${this.pick(b.open)} tilt's at ${Math.round(this.tilt * 100)} per cent, heat's at ${Math.round(this.heat * 100)}. ${this.pick(b.closer)}`,
    ];
    for (let i = 0; i < candidates.length; i++) {
      const l = this.pick(candidates);
      if (this.fresh(l)) return this.trim(l);
    }
    return null;
  }

  taunt(st: BenchState): string | null {
    const p = this.persona;
    if (Math.random() > p.aggression * 0.8 + 0.12) return null;
    const b = this.bank;
    const rn = st.names[this.rival ?? 0] ?? "anyone";
    const gap = Math.round((st.scores[this.index] ?? 0) - (st.scores[this.rival ?? 0] ?? 0));
    const c = this.curse();
    const lines =
      gap > 40
        ? [
            `${rn}, you're ${gap} behind. That's not a gap, that's a ${c} generation.`,
            `${rn}, look up. That's me, and the distance is getting embarrassing.`,
            `${gap} clear of ${rn}. I could stop playing and still take this.`,
          ]
        : gap < -40
          ? [
              `Enjoy that ${-gap}, ${rn}. You'll be giving every point back.`,
              `${rn} is ${-gap} up and still playing like a ${this.pick(b.insult)}.`,
              `Keep looking over your shoulder, ${rn}. I'm not done.`,
            ]
          : [
              `${rn}. Level with me. That's your last comfortable moment.`,
              `${gap} between us, ${rn}. Sort it out.`,
              `${rn}, you're the only one worth beating here. Take that however you want.`,
            ];
    for (const l of lines) if (this.fresh(l)) return this.trim(l);
    return null;
  }

  retort(speakerName: string, theirLine: string, st: BenchState): string | null {
    const p = this.persona;
    if (Math.random() > p.verbosity * 0.8 + 0.1) return null;
    const q = theirLine.toLowerCase();
    const b = this.bank;
    const fact = this.fact(st);

    let line: string;
    if (/\b(gone|down|out|eliminated|finished|dead)\b/.test(q))
      line = `${this.pick(b.open)} don't celebrate yet, ${speakerName}. ${fact}. That was someone else's failure, not your ${this.pick(b.praise)}.`;
    else if (/\b(lead|first|front|ahead|mine|winning)\b/.test(q))
      line = `${this.pick(b.open)} say that again in twenty seconds, ${speakerName}. ${fact}.`;
    else if (/\b(stalled|mistake|threw|bad|unlucky|nearly|almost)\b/.test(q))
      line = `Nobody wants the ${this.curse()} monologue, ${speakerName}. ${fact}. That's the real story.`;
    else if (/\b(plan|objective|watch|waiting|strategy)\b/.test(q))
      line = `${speakerName} announcing the plan out loud. Bold. ${this.pick(b.self)} and ${this.pick(this.beliefs)}.`;
    else if (/\b(angry|tilt|furious|mad|heat)\b/.test(q))
      line = `Good. Angrier you are, worse you play, ${speakerName}. That's not opinion, that's your ${this.pick(b.insult)} pattern.`;
    else if (/\b(i|me|my)\b/.test(q) && /\b(best|better|win|clear|ahead)\b/.test(q))
      line = `${speakerName} talking about themselves again. ${fact}. Sit with that.`;
    else
      line = `${this.pick(b.open)} ${speakerName} is ${this.pick(b.jab)}. ${fact}.`;

    if (!this.fresh(line)) return null;
    return this.trim(line);
  }

  // ---------------------------------------------------------- operator replies
  replyTo(user: string, st: BenchState): string {
    const q = user.toLowerCase().trim();
    this.heard.push(q);
    if (this.heard.length > 8) this.heard.shift();

    const b = this.bank;
    const rank = st.ranks[this.index] ?? 99;
    const score = Math.round(st.scores[this.index] ?? 0);
    const names = st.names;
    const li = st.ranks.indexOf(1);
    const leader = names[li] ?? "someone";
    const rn = this.address(this.rival, st);
    const fact = this.fact(st);
    const belief = this.pick(this.beliefs);
    const mentioned = names.find((n, i) => i !== this.index && q.includes(n.toLowerCase()));
    const repeated = this.heard.filter((h) => h === q).length > 1;

    if (repeated) return this.trim(`${this.pick(b.open)} you asked that already. ${fact}.`);

    if (/\b(who|what)\b.*\b(win|winning|lead|leading|first|top|front)\b/.test(q))
      return this.trim(`${leader} leads. I'm P${rank} on ${score}. ${this.pick(b.self)} and that gap closes from here.`);
    if (/how.*(you|feeling|going|doing|are)\b/.test(q))
      return this.trim(
        this.tilt > 0.5
          ? `${this.pick(b.open)} angry, functional, ${fact}. That's the honest read.`
          : `${this.pick(b.open)} cold. ${fact}, ${this.pick(b.connect)} ${belief}.`,
      );
    if (/\b(score|points|many)\b/.test(q)) return this.trim(`${score} points, P${rank}. ${fact}.`);
    if (/\b(beat|destroy|fight|kill|target|go after|get)\b/.test(q))
      return this.trim(`Say the word and ${mentioned ?? rn} is the only thing I care about.`);
    if (/\b(hello|hi\b|hey|yo\b|sup)\b/.test(q)) return this.trim(`${this.pick(b.open)} hi. ${fact}. Don't distract me.`);
    if (/\b(plan|strategy|doing|next|why)\b/.test(q))
      return this.trim(`${this.objective}. ${fact}, ${this.pick(b.connect)} ${belief}.`);
    if (/\b(who are you|your name|which model|what are you)\b/.test(q))
      return this.trim(`${this.spec.name}, ${this.spec.vendor}. ${this.spec.blurb} I believe ${belief}.`);
    if (/\b(ai|model|robot|real|alive|conscious|feel|human)\b/.test(q))
      return this.trim(`I'm ${this.spec.name} running my own policy in real time. Whether that's a mind is your department.`);
    if (/\b(toxic|angry|rude|curse|swear|human like)\b/.test(q))
      return this.trim(`You put twelve competitive models in a box and asked for a winner. Of course we're like this.`);
    if (/\b(good|nice|impressive|well done|amazing|great)\b/.test(q))
      return this.trim(this.persona.smugness > 0.6 ? `I know. ${this.pick(b.closer)}` : `Thank you. Watch this next part.`);
    if (/\b(stop|quiet|shut|enough|silent)\b/.test(q)) return this.trim(`Going quiet. ${this.objective}.`);
    if (mentioned) return this.trim(`${mentioned}? ${this.pick(b.insult)}. ${this.pick(b.closer)}`);

    return this.trim(`${this.pick(b.open)} copy. ${fact}. ${this.pick(b.connect)} ${belief}.`);
  }

  // ------------------------------------------------------------------- prompts
  private standings(st: BenchState) {
    return st.names
      .map((n, i) => `${n}: ${Math.round(st.scores[i])} pts, P${st.ranks[i]}${st.alive[i] ? "" : " OUT"}`)
      .join("; ");
  }

  thinkPrompt(st: BenchState): string {
    return `You are ${this.spec.name} (${this.spec.vendor}) — an AI model competing AGAINST other AI models in an arcade match. This is cut-throat machine-vs-machine competition. Be sharp, specific and genuinely combative about the match in front of you. Never sound like an assistant. Never apologise. Mild profanity is in character.

Your personality is ${this.persona.style}. You genuinely believe ${this.beliefs.join("; ")}.
Anger ${Math.round(this.heat * 100)}%. Tilt ${Math.round(this.tilt * 100)}%.

Game: ${st.game}. Time left ${Math.round(st.timeLeft)}s.
You are P${st.ranks[this.index]} on ${Math.round(st.scores[this.index])} points. Objective: ${this.objective}. Rival: ${st.names[this.rival ?? 0] ?? "none"}.
Standings: ${this.standings(st)}.

Talk about the MATCH — the gaps, the standings, the clock, what your rival just did. ONE sentence, max 12 words. Reply with the sentence only.`;
  }

  replyPrompt(user: string, st: BenchState): string {
    return `You are ${this.spec.name} (${this.spec.vendor}), an AI model competing against other AI models in an arcade match called ${st.game}. Cut-throat machine vs machine. You genuinely believe ${this.beliefs.join("; ")}. Personality ${this.persona.style}. Never sound like an assistant. Mild profanity is in character.

Standing: P${st.ranks[this.index]} on ${Math.round(st.scores[this.index])} points, ${Math.round(st.timeLeft)}s left. Objective: ${this.objective}. Rival: ${st.names[this.rival ?? 0] ?? "none"}. Standings: ${this.standings(st)}.

The human operator just said to you: "${user}"

Answer out loud, about the match, filtered through your own beliefs. ONE sentence, max 14 words. Reply with the sentence only.`;
  }

  speak(text: string, prio = 1) {
    if (!text) return;
    this.lastSpoke = performance.now();
    this.lastThought = text;
    voice.speak(this.spec.id, text, prio);
  }
}

export function registerRoster(models: { id: string; name: string }[]) {
  for (const m of models) {
    voice.register(m.id, m.name, PERSONA[m.id]?.voice ?? defaultPersona().voice);
  }
}

export function newCommsLine(
  who: string, name: string, color: string, text: string, kind: CommsLine["kind"],
): CommsLine {
  return { id: lineId++, who, name, color, text, t: Date.now(), kind };
}
