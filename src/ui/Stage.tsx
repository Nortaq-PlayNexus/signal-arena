import { useCallback, useEffect, useRef, useState } from "react";
import panelImg from "../../public/images/panel.jpg";
import { FX } from "@/core/fx";
import { type GameInstance, type HumanButtons, type HudCell } from "@/core/engine";
import { audio } from "@/core/audio";
import { askModel, parseMove } from "@/core/llm";
import { recordSeason } from "@/core/season";
import { buildAgents, type PlayerAgent } from "@/core/roster";
import { Mind, newCommsLine, type BenchState, type CommsLine } from "@/core/mind";
import { voice } from "@/core/voice";
import { Comms } from "./Comms";
import { saveScore, type ScoreRow } from "@/core/scores";
import { gameById } from "@/games";
import { MODES, type MatchConfig } from "./StartScreen";
import { Glyph, Mark, Screws, Silk } from "./bits";

const W = 960;
const H = 540;

interface LogLine {
  id: number;
  tag: string;
  color: string;
  text: string;
  kind: "sys" | "ai" | "event";
}

interface Ui {
  scores: number[];
  hud: HudCell[][];
  alive: boolean[];
  engines: string[];
  lat: number[];
  notes: string[];
  time: number;
  fps: number;
  log: LogLine[];
}

interface Result {
  order: number[];
  scores: number[];
  championId: string;
  row: ScoreRow;
}

// one shared counter so the synchronous log and the async uplink replies
// can never collide on a React key
let _uid = 0;
const nextId = () => _uid++;

function buildBench(game: GameInstance, minds: Mind[]): BenchState {
  const scores = game.scores();
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const ranks = new Array(scores.length).fill(99);
  order.forEach((idx, r) => {
    ranks[idx] = r + 1;
  });
  return {
    game: game.id,
    elapsed: game.elapsed,
    timeLeft: Math.max(0, game.timeLimit - game.elapsed),
    scores,
    ranks,
    alive: game.alive(),
    names: minds.map((m) => m.spec.name),
    colors: minds.map((m) => m.color),
  };
}

const SYSTEM = (n: number, total: number) =>
  `You are player ${n} of ${total} in a competitive arcade match. You must pick one action. Reply in EXACTLY this format and nothing else:\nMOVE <number>\n<reason, max 6 words, lowercase>`;

const RATES: { v: number; l: string }[] = [
  { v: 0.5, l: "½×" },
  { v: 1, l: "1×" },
  { v: 1.5, l: "1½×" },
  { v: 2, l: "2×" },
];

function emptyUi(): Ui {
  return {
    scores: [],
    hud: [],
    alive: [],
    engines: [],
    lat: [],
    notes: [],
    time: 0,
    fps: 60,
    log: [],
  };
}

export function Stage({ config, onExit }: { config: MatchConfig; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [runId, setRunId] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ui, setUi] = useState<Ui>(emptyUi);
  const [result, setResult] = useState<Result | null>(null);
  const pausedRef = useRef(false);
  const overRef = useRef<Result | null>(null);
  const buttonsRef = useRef<HumanButtons>({
    left: false,
    right: false,
    up: false,
    down: false,
    a: false,
    b: false,
  });
  const MODE = MODES.find((m) => m.id === config.mode) ?? MODES[0];
  const speedRef = useRef(MODE.speed);
  const [speed, setSpeed] = useState(MODE.speed);
  const [muted, setMuted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const mindsRef = useRef<Mind[]>([]);
  const commsRef = useRef<CommsLine[]>([]);
  const [comms, setComms] = useState<CommsLine[]>([]);
  const [speaking, setSpeaking] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    voice.setEnabled(voiceOn);
  }, [voiceOn]);

  useEffect(() => {
    voice.init();
    return voice.subscribe(() => setSpeaking(new Map(voice.speaking())));
  }, []);

  const sayToBench = useCallback(
    (text: string, target: number | null) => {
      const minds = mindsRef.current;
      const rt = rtRef.current;
      if (!minds.length || !rt) return;
      commsRef.current.push(newCommsLine("user", "OPERATOR", "#FFB020", text, "user"));
      setComms(commsRef.current.slice(-30));

      const st = buildBench(rt.game, minds);
      const responders =
        target != null
          ? [minds[target]]
          : [minds[st.ranks.indexOf(1)], minds.reduce((a, b) => (a.persona.verbosity > b.persona.verbosity ? a : b))].filter(
              (m, i, arr): m is Mind => Boolean(m) && arr.indexOf(m) === i,
            );

      for (const m of responders) {
        const spec = m.spec;
        const answer = (line: string) => {
          m.speak(line, 3);
          commsRef.current.push(newCommsLine(spec.id, spec.name, m.color, line, "reply"));
          setComms(commsRef.current.slice(-30));
        };
        if (config.engine === "live") {
          const prompt = `You are ${spec.name}, an AI model on a competitive arcade bench with other AI models, watching a match called ${st.game}. You have your own personality and free will — never sound like an assistant.

Standing: P${st.ranks[m.index]} with ${Math.round(st.scores[m.index])} points. Objective: ${m.objective}. Rival: ${st.names[m.rival ?? 0] ?? "none"}.
The human operator just said to you: "${text}"

Reply out loud with ONE sentence, max 14 words, in your own voice. Reply with the sentence only.`;
          askModel(spec.id, "You are terse, competitive and specific. Never mention being an AI assistant.", prompt, Date.now() % 99991)
            .then((r) => {
              const line = r.ok && r.text ? r.text.split("\n")[0].replace(/^[\"'\s]+|[\"'\s]+$/g, "").slice(0, 150) : "";
              answer(line || m.replyTo(text, st));
            })
            .catch(() => answer(m.replyTo(text, st)));
        } else {
          answer(m.replyTo(text, st));
        }
      }
    },
    [config.engine],
  );

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const togglePilot = useCallback((i: number) => {
    const rt = rtRef.current;
    if (!rt) return;
    rt.human[i] = !rt.human[i];
    if (rt.human[i]) {
      rt.engines[i] = "PILOT";
    } else {
      rt.game.release?.(i);
      rt.engines[i] = "NEURAL";
    }
    setUi((u) => ({ ...u, engines: [...rt.engines] }));
  }, []);

  const rtRef = useRef<{
    fx: FX;
    game: GameInstance;
    agents: PlayerAgent[];
    actions: number[];
    next: number[];
    llmAction: number[];
    llmAt: number[];
    engines: string[];
    lat: number[];
    notes: string[];
    pending: boolean[];
    human: boolean[];
    log: LogLine[];
    logId: number;
    busy: boolean;
    frames: number;
    fpsT: number;
    fps: number;
    uiT: number;
    finished: boolean;
  } | null>(null);

  // ---------------------------------------------------------------- run
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const meta = gameById(config.gameId);
    const fx = new FX();
    fx.sfx = (n, v) => audio.play(n, v);
    const log: LogLine[] = [];
    let logId = 0;
    const push = (text: string, kind: LogLine["kind"], tag = "SYS", color = "#A49B88") => {
      log.push({ id: nextId(), text, kind, tag, color });
      if (log.length > 60) log.splice(0, log.length - 60);
    };

    const agents = buildAgents(config.players, meta.prior, config.seed);
    const game = meta.make(agents.length, agents.map((a) => a.color), fx, (m) => push(m, "event", "EV", "#FFB020"), config.seed);

    // match modifier
    game.timeLimit = Math.max(12, Math.round(game.timeLimit * MODE.timeMul));
    push(`PROGRAM ${MODE.code} ${MODE.name} · ${MODE.speed}× RATE · ${MODE.scoreMul}× SCORING`, "sys", "SYS", "#A49B88");

    // ---- minds: each model gets its own temperament, objective and rival ----
    const minds = agents.map((a, i) => new Mind(a.spec, i, a.color));
    mindsRef.current = minds;
    commsRef.current = [];
    setComms([]);
    voice.stopAll();

    const pushLine = (id: string, name: string, color: string, text: string, kind: CommsLine["kind"]) => {
      commsRef.current.push(newCommsLine(id, name, color, text, kind));
      if (commsRef.current.length > 40) commsRef.current.splice(0, commsRef.current.length - 40);
    };

    const say = (m: Mind, text: string, kind: CommsLine["kind"], prio = 1) => {
      m.speak(text, prio);
      pushLine(m.spec.id, m.spec.name, m.color, text, kind);
      // models answer each other — this is a channel, not a broadcast
      if (kind !== "reply" && Math.random() < 0.34) {
        const others = minds.filter((o) => o.index !== m.index);
        const o = others[Math.floor(Math.random() * others.length)];
        if (o) {
          const line = o.retort(m.spec.name, text, buildBench(game, minds));
          if (line) {
            o.speak(line, 1);
            pushLine(o.spec.id, o.spec.name, o.color, line, "event");
          }
        }
      }
    };

    let prevSnap: { scores: number[]; ranks: number[]; alive: boolean[] } | null = null;
    let nextThink = performance.now() + 2400;
    let nextLlmThought = performance.now() + 11000;
    let llmBusy = false;

    const tickComms = (now: number) => {
      const st = buildBench(game, minds);
      for (const m of minds) m.ingest(st);

      if (prevSnap) {
        for (let i = 0; i < minds.length; i++) {
          const m = minds[i];
          const d = (st.scores[i] ?? 0) - (prevSnap.scores[i] ?? 0);
          if (prevSnap.alive[i] && !st.alive[i]) {
            const line = m.react("eliminated", st);
            if (line) say(m, line, "event", 3);
            for (const o of minds) {
              if (o.index === i) continue;
              const l2 = o.react("rivalDown", st, i);
              if (l2) say(o, l2, "event", 2);
            }
          } else if (d <= -10) {
            const line = m.react("hurt", st);
            if (line) say(m, line, "event", 1);
          } else if (d >= 30) {
            const line = m.react("bigPlay", st);
            if (line) say(m, line, "event", 1);
          }
          if (st.ranks[i] === 1 && prevSnap.ranks[i] !== 1) {
            const line = m.react("lead", st);
            if (line) say(m, line, "event", 2);
          } else if (prevSnap.ranks[i] === 1 && st.ranks[i] !== 1) {
            const line = m.react("lostLead", st);
            if (line) say(m, line, "event", 2);
          }
        }
      }
      prevSnap = { scores: [...st.scores], ranks: [...st.ranks], alive: [...st.alive] };

      // spontaneous thought — the free-thinking layer
      if (now > nextThink) {
        nextThink = now + 5800 + Math.random() * 6200;
        const shuffled = [...minds].sort(() => Math.random() - 0.5);
        for (const m of shuffled) {
          if (now - m.lastSpoke < 6800) continue;
          const line = m.think(st);
          if (line) {
            say(m, line, "thought", 1);
            break;
          }
        }
      }

      // occasionally the real LLM thinks out loud
      if (config.engine === "live" && now > nextLlmThought && !llmBusy) {
        nextLlmThought = now + 32000 + Math.random() * 18000;
        const m = minds[Math.floor(Math.random() * minds.length)];
        if (m && now - m.lastSpoke > 5200) {
          llmBusy = true;
          askModel(
            m.spec.id,
            "You are terse, competitive and specific. Never mention being an AI assistant.",
            m.thinkPrompt(st),
            Date.now() % 99991,
          )
            .then((r) => {
              llmBusy = false;
              if (r.ok && r.text) {
                const line = r.text
                  .split("\n")[0]
                  .replace(/^["'\s]+|["'\s]+$/g, "")
                  .slice(0, 150);
                if (line) say(m, line, "thought", 1);
              }
            })
            .catch(() => {
              llmBusy = false;
            });
        }
      }
    };

    // minds react to whatever the broadcast banner just announced
    fx.onBanner = (text) => {
      const st = buildBench(game, minds);
      const shuffled = [...minds].sort(() => Math.random() - 0.5);
      for (const m of shuffled) {
        const line = m.react("banner", st, undefined, text.split("—")[0].trim());
        if (line) {
          say(m, line, "event", 2);
          break;
        }
      }
    };
    push(`CARTRIDGE ${meta.code} ${meta.name} ARMED`, "sys", "SYS", "#A49B88");
    push(`${agents.length} MODELS PATCHED · ${config.engine === "live" ? "LIVE LLM UPLINK" : "LOCAL NEURAL"} · ${meta.decisionHz} Hz DECISIONS`, "sys", "SYS", "#A49B88");

    const n = agents.length;
    rtRef.current = {
      fx,
      game,
      agents,
      actions: new Array(n).fill(1),
      next: new Array(n).fill(0).map((_, i) => performance.now() + i * 30),
      llmAction: new Array(n).fill(-1),
      llmAt: new Array(n).fill(0),
      engines: new Array(n).fill(config.engine === "live" ? "UPLINK" : "NEURAL"),
      lat: new Array(n).fill(0),
      notes: new Array(n).fill(""),
      pending: new Array(n).fill(false),
      human: new Array(n).fill(false),
      log,
      logId,
      busy: false,
      frames: 0,
      fpsT: performance.now(),
      fps: 60,
      uiT: 0,
      finished: false,
    };

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    // half-res bloom buffer — a real glow pass over every game, done cheaply
    const bloomCv = document.createElement("canvas");
    bloomCv.width = 480;
    bloomCv.height = 270;
    const bctx = bloomCv.getContext("2d");
    const canFilter = typeof (ctx as CanvasRenderingContext2D & { filter?: string }).filter === "string";

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const FIXED = 1 / 60;

    const decide = (i: number, now: number) => {
      const rt = rtRef.current!;
      const opts = game.options(i);
      if (opts.length === 0) return;
      const a = agents[i];
      if (config.engine === "live" && rt.llmAction[i] >= 0 && now - rt.llmAt[i] < 9000 && rt.engines[i] === "LLM") {
        rt.actions[i] = rt.llmAction[i] % opts.length;
        rt.notes[i] = rt.notes[i] || (opts[rt.actions[i]]?.label ?? "");
        return;
      }
      rt.engines[i] = "NEURAL";
      // mood is a real lever: a tilted mind gets sloppy, a confident one tightens
      const mind = minds[i];
      const chaos = MODE.chaos ? 2.2 : 1;
      const tMul = (mind ? mind.temperatureMul() : 1) * chaos;
      const eMul = (mind ? mind.exploreMul() : 1) * chaos;
      rt.actions[i] = a.net.pick(
        opts,
        a.rng,
        Math.min(0.95, a.spec.temperature * tMul),
        Math.min(0.85, a.spec.explore * eMul),
      );
      rt.notes[i] = opts[rt.actions[i]]?.label ?? "";
    };

    const maybeUplink = (now: number) => {
      if (config.engine !== "live") return;
      const rt = rtRef.current!;
      if (rt.busy || rt.finished) return;
      for (let i = 0; i < agents.length; i++) {
        if (rt.pending[i] || rt.human[i]) continue;
        const interval = 5200 + i * 1100 + agents[i].spec.latency * 900;
        if (now - rt.llmAt[i] < interval) continue;
        rt.pending[i] = true;
        rt.busy = true;
        const opts = game.options(i);
        const count = opts.length;
        const prompt = game.describe(i);
        const seed = config.seed + i * 977 + Math.floor(now / 1000) % 97;
        askModel(agents[i].spec.id, SYSTEM(i + 1, agents.length), prompt, seed)
          .then((r) => {
            const rt2 = rtRef.current;
            if (!rt2) return;
            rt2.busy = false;
            rt2.pending[i] = false;
            rt2.llmAt[i] = performance.now();
            rt2.lat[i] = Math.round(r.ms);
            if (r.ok) {
              const mv = parseMove(r.text, count);
              const reason = (r.text.split("\n")[1] ?? "").trim().slice(0, 46);
              if (mv >= 0) {
                rt2.llmAction[i] = mv;
                rt2.engines[i] = "LLM";
                rt2.notes[i] = reason || opts[mv].label;
                rt2.log.push({
                  id: nextId(),
                  tag: agents[i].spec.name,
                  color: agents[i].color,
                  text: `${opts[mv].label.toLowerCase()}${reason ? ` — “${reason}”` : ""}`,
                  kind: "ai",
                });
              } else {
                rt2.engines[i] = "NEURAL";
                rt2.log.push({
                  id: nextId(),
                  tag: agents[i].spec.name,
                  color: agents[i].color,
                  text: `reply unparseable · holding local policy`,
                  kind: "sys",
                });
              }
            } else {
              rt2.engines[i] = "NEURAL";
              rt2.log.push({
                id: nextId(),
                tag: agents[i].spec.name,
                color: agents[i].color,
                text: `uplink lost or rate-limited → local policy`,
                kind: "sys",
              });
            }
            if (rt2.log.length > 60) rt2.log.splice(0, rt2.log.length - 60);
          })
          .catch(() => {
            const rt2 = rtRef.current;
            if (rt2) {
              rt2.busy = false;
              rt2.pending[i] = false;
              rt2.engines[i] = "NEURAL";
            }
          });
        return;
      }
    };

    const step = (dt: number) => {
      const rt = rtRef.current!;
      if (rt.fx.hitStop > 0) {
        rt.fx.hitStop -= dt;
        rt.fx.update(dt * 0.25);
        return;
      }
      const now = performance.now();
      for (let i = 0; i < agents.length; i++) {
        if (rt.human[i]) {
          game.human(i, buttonsRef.current);
          rt.actions[i] = -1;
          rt.engines[i] = "PILOT";
          continue;
        }
        if (now >= rt.next[i]) {
          rt.next[i] = now + 1000 / meta.decisionHz;
          decide(i, now);
        }
      }
      maybeUplink(now);
      game.update(dt, rt.actions);
      rt.fx.update(dt);
      if (!rt.finished && game.isOver()) {
        rt.finished = true;
        const scores = game.scores();
        const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
        const champ = agents[order[0]];
        const row: ScoreRow = {
          date: new Date().toISOString().slice(0, 10),
          champion: champ.spec.name,
          championId: champ.spec.id,
          game: meta.name,
          gameId: meta.id,
          points: Math.round(scores[order[0]] * MODE.scoreMul),
          runnerUp: agents[order[1]]?.spec.name ?? "—",
          duration: Math.round(game.elapsed),
          engine: config.engine === "live" ? "LIVE LLM" : "LOCAL NEURAL",
        };
        saveScore(row);
        recordSeason(
          agents.map((a) => ({ id: a.spec.id, name: a.spec.name })),
          order,
          config.pick,
        );
        if (config.pick) {
          const champId = agents[order[0]]?.spec.id;
          const placed = agents.findIndex((a) => a.spec.id === config.pick);
          const place = order.indexOf(placed);
          if (champId === config.pick) {
            push(`BOUNTY PAID — YOUR PICK TOOK IT, +6 SEASON POINTS`, "event", "✓", "#43D97B");
            fx.banner("BOUNTY PAID", "#43D97B", "your pick won the match — +6 season points");
          } else if (place >= 0 && place < 3) {
            push(`BOUNTY HALF PAID — PICK PODIUMED, +3 SEASON POINTS`, "event", "✓", "#FFB020");
          } else {
            push(`BOUNTY LOST — YOUR PICK CAME HOME P${place + 1}`, "event", "✗", "#FF4438");
            fx.banner("BOUNTY LOST", "#FF4438", `your pick finished P${place + 1}`);
          }
        }
        overRef.current = { order, scores, championId: champ.spec.id, row };
        setResult(overRef.current);
        push(`MATCH COMPLETE — ${champ.spec.name} TAKES IT WITH ${row.points} PTS`, "event", "★", "#FFB020");
        fx.shake(12);
        fx.flash("#FFB020", 0.3);
        for (const m of minds) {
          const line = m.react("finish", buildBench(game, minds));
          if (line) say(m, line, "event", 3);
        }
      }
    };

    const draw = () => {
      const rt = rtRef.current!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#06080a";
      ctx.fillRect(0, 0, W, H);
      const [sx, sy] = rt.fx.offset();
      ctx.save();
      ctx.translate(sx, sy);
      game.draw(ctx, W, H);
      const cam = game.camera?.();
      if (cam) {
        ctx.translate(W / 2, H / 2);
        ctx.scale(cam.zoom, cam.zoom);
        ctx.translate(-cam.x, -cam.y);
      }
      rt.fx.drawWorld(ctx);
      ctx.restore();
      rt.fx.drawScreen(ctx, W, H);

      // ---- bloom: downsample the frame, blur it, add it back as light ----
      if (bctx && canFilter) {
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.clearRect(0, 0, 480, 270);
        bctx.drawImage(canvas, 0, 0, 480, 270);
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.34;
        (ctx as CanvasRenderingContext2D & { filter: string }).filter = "blur(4px) saturate(1.35)";
        ctx.drawImage(bloomCv, 0, 0, W, H);
        (ctx as CanvasRenderingContext2D & { filter: string }).filter = "none";
        ctx.restore();
      }
      // corner burn-in
      ctx.fillStyle = "rgba(255,176,32,0.55)";
      ctx.font = "600 10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`SIG-ARENA / ${meta.code}`, 18, 24);
      ctx.textAlign = "right";
      ctx.fillText(`${config.engine === "live" ? "UPLINK" : "LOCAL NET"} · ${Math.round(rt.fps)} FPS`, W - 18, 24);
      ctx.textAlign = "left";
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const rt = rtRef.current!;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.2) dt = 0.2;
      rt.frames++;
      if (now - rt.fpsT > 500) {
        rt.fps = (rt.frames * 1000) / (now - rt.fpsT);
        rt.frames = 0;
        rt.fpsT = now;
      }
      if (!pausedRef.current && !rt.finished) {
        acc += dt * speedRef.current;
        let guard = 0;
        while (acc >= FIXED && guard < 5) {
          step(FIXED);
          acc -= FIXED;
          guard++;
        }
        if (acc > FIXED * 5) acc = 0;
      }
      draw();
      if (now - rt.uiT > 110) {
        rt.uiT = now;
        const scores = game.scores();
        tickComms(now);
        setComms(commsRef.current.slice(-30));
        setUi({
          scores,
          hud: agents.map((_, i) => game.hud(i)),
          alive: game.alive(),
          engines: [...rt.engines],
          lat: [...rt.lat],
          notes: [...rt.notes],
          time: Math.max(0, game.timeLimit - game.elapsed),
          fps: rt.fps,
          log: rt.log.slice(-26),
        });
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      rtRef.current = null;
      overRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // ---------------------------------------------------------------- input
  useEffect(() => {
    const map: Record<string, keyof HumanButtons> = {
      arrowleft: "left",
      a: "left",
      arrowright: "right",
      d: "right",
      arrowup: "up",
      w: "up",
      arrowdown: "down",
      s: "down",
      " ": "a",
      j: "a",
      enter: "a",
      k: "b",
      shift: "b",
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (map[k]) {
        buttonsRef.current[map[k]] = true;
        e.preventDefault();
      }
      if (k === "p" || k === "escape") setPaused((p) => !p);
      if (k === "r") restart();
      if (k >= "1" && k <= "4") {
        const idx = parseInt(k, 10) - 1;
        const rt = rtRef.current;
        if (rt && idx < rt.agents.length) togglePilot(idx);
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (map[k]) buttonsRef.current[map[k]] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = () => {
    setResult(null);
    overRef.current = null;
    setPaused(false);
    setUi(emptyUi());
    setRunId((r) => r + 1);
  };

  const meta = gameById(config.gameId);
  const timeStr = `${String(Math.floor(ui.time / 60)).padStart(2, "0")}:${String(
    Math.floor(ui.time % 60),
  ).padStart(2, "0")}`;
  const standings = ui.scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);

  return (
    <div className="relative min-h-screen bg-rack">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{ backgroundImage: `url(${panelImg})`, backgroundSize: "cover", mixBlendMode: "overlay" }}
        />
        <div className="grain" />
      </div>

      {/* ---- top broadcast bar ---- */}
      <header className="hair sticky top-0 z-30 border-b border-rule bg-rack/95 px-4 py-2.5 backdrop-blur-sm sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button onClick={onExit} className="sw flex items-center gap-2 px-3 py-2" aria-label="Back to the rack">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
              <path d="M15 5l-7 7 7 7" strokeLinecap="square" />
            </svg>
            <span className="silk text-cream/80">RACK</span>
          </button>
          <div className="hidden h-8 w-px bg-rule sm:block" />
          <div className="flex items-center gap-3">
            <span style={{ color: "#FFB020" }}>
              <Glyph id={config.gameId} size={26} />
            </span>
            <div>
              <div className="silk silk-am">{meta.code} · {meta.tag}</div>
              <div className="display text-[15px] leading-none text-cream">{meta.name}</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            <div className="text-right">
              <Silk>CLOCK</Silk>
              <div
                className="num display text-[24px] leading-none"
                style={{ color: ui.time < 12 ? "#FF4438" : "#FFB020" }}
              >
                {timeStr}
              </div>
            </div>
            <div className="hidden text-right sm:block">
              <Silk>RENDER</Silk>
              <div className="num text-[13px] text-cream/75">{Math.round(ui.fps)} FPS</div>
            </div>
            <div className="hidden text-right md:block">
              <Silk>ENGINE</Silk>
              <div className="text-[13px] text-cream/75">
                {config.engine === "live" ? "LIVE LLM UPLINK" : "LOCAL NEURAL"}
              </div>
            </div>
            <div className="hidden items-center gap-1 md:flex">
              <span className="silk mr-1">RATE</span>
              {RATES.map((r) => (
                <button
                  key={r.l}
                  onClick={() => {
                    setSpeed(r.v);
                    audio.play("click");
                  }}
                  className={`sw px-2.5 py-2 ${speed === r.v ? "sw-on" : ""}`}
                  aria-pressed={speed === r.v}
                >
                  <span className="silk" style={{ color: speed === r.v ? "#17120a" : undefined }}>
                    {r.l}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setMuted((m) => !m);
                audio.play("toggle");
              }}
              className={`sw px-3 py-2.5 ${muted ? "" : "sw-on"}`}
              aria-pressed={!muted}
            >
              <span className="silk" style={{ color: !muted ? "#17120a" : undefined }}>
                {muted ? "SND OFF" : "SND ON"}
              </span>
            </button>
            <button
              onClick={() => {
                audio.play("toggle");
                setVoiceOn((v) => !v);
              }}
              className={`sw px-3 py-2.5 ${voiceOn ? "sw-on" : ""}`}
              aria-pressed={voiceOn}
            >
              <span className="silk" style={{ color: voiceOn ? "#17120a" : undefined }}>
                {voiceOn ? "VOICE ON" : "VOICE OFF"}
              </span>
            </button>
            <button
              onClick={() => {
                setPaused((p) => !p);
                audio.play("toggle");
              }}
              className={`sw px-3.5 py-2.5 ${paused ? "sw-on" : ""}`}
            >
              <span className="silk" style={{ color: paused ? "#17120a" : undefined }}>
                {paused ? "RESUME" : "PAUSE"}
              </span>
            </button>
            <button
              onClick={() => {
                audio.play("click");
                restart();
              }}
              className="sw px-3.5 py-2.5"
            >
              <span className="silk">RESTART</span>
            </button>
          </div>
        </div>
      </header>

      {/* ---- body: instrument rail + screen well ---- */}
      <main className="relative mx-auto grid max-w-[1520px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[326px_minmax(0,1fr)]">
        {/* rail */}
        <section className="order-2 lg:order-1">
          <div className="plate relative">
            <Screws />
            <div className="border-b border-rule px-4 py-3">
              <Silk className="silk-am">CONTESTANT RACK</Silk>
            </div>
            <div>
              {config.players.map((pid, i) => {
                const agent = rtRef.current?.agents[i];
                const name = agent?.spec.name ?? pid.toUpperCase();
                const color = agent?.color ?? "#FFB020";
                const eng = ui.engines[i] ?? "—";
                return (
                  <div
                    key={pid + i}
                    className="relative border-b border-rule/70 px-4 py-3 last:border-0"
                    style={{ background: ui.alive[i] === false ? "rgba(255,68,56,0.05)" : undefined }}
                  >
                    <div
                      className="absolute left-0 top-0 h-full w-[3px]"
                      style={{ background: color, boxShadow: `0 0 12px ${color}55` }}
                    />
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-6 w-6 items-center justify-center text-[11px] font-bold"
                        style={{ background: color, color: "#0b0e12" }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="display truncate text-[13.5px] leading-none text-cream">{name}</div>
                        <div className="silk mt-1 truncate">
                          {ui.alive[i] === false ? "ELIMINATED" : eng === "PILOT" ? "HUMAN PILOT" : eng}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="num display text-[21px] leading-none" style={{ color }}>
                          {String(ui.scores[i] ?? 0).padStart(4, "0")}
                        </div>
                        <div className="silk mt-1">{ui.lat[i] ? `${ui.lat[i]}ms` : "—"}</div>
                      </div>
                    </div>

                    {ui.notes[i] ? (
                      <div
                        className="mt-2 truncate text-[10px] leading-[1.5] text-cream/62"
                        style={{ fontStyle: ui.engines[i] === "LLM" ? "italic" : "normal" }}
                      >
                        {ui.engines[i] === "LLM" ? `“${ui.notes[i]}”` : `◂ ${ui.notes[i]}`}
                      </div>
                    ) : null}

                    {(ui.hud[i] ?? []).map((h) => (
                      <div key={h.label} className="mt-2.5">
                        <div className="flex items-baseline justify-between">
                          <span className="silk">{h.label}</span>
                          <span className="num text-[10.5px] text-cream/80">{h.value}</span>
                        </div>
                        <div className="mt-1 h-[3px] w-full bg-rule">
                          <div
                            className="h-full transition-[width] duration-150"
                            style={{
                              width: `${Math.max(0, Math.min(1, h.pct)) * 100}%`,
                              background: color,
                              boxShadow: `0 0 8px ${color}66`,
                            }}
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => togglePilot(i)}
                      className={`sw mt-3 w-full px-2.5 py-2 ${eng === "PILOT" ? "sw-on" : ""}`}
                    >
                      <span className="silk" style={{ color: eng === "PILOT" ? "#17120a" : undefined }}>
                        {eng === "PILOT" ? "◉ RELEASE CONTROLS" : "◎ PILOT OVERRIDE"}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* pilot pad */}
          <div className="plate mt-4 px-4 py-4">
            <div className="flex items-center justify-between">
              <Silk className="silk-am">PILOT CONTROL PAD</Silk>
              <Silk>KEYS · WASD / ARROWS · SPACE · K</Silk>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
                {(
                  [
                    ["", "up", ""],
                    ["left", "down", "right"],
                  ] as const
                ).map((row, r) =>
                  row.map((cell, c) =>
                    cell ? (
                      <button
                        key={`${r}-${c}`}
                        className="sw flex h-11 w-11 items-center justify-center pad"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          buttonsRef.current[cell as keyof HumanButtons] = true;
                        }}
                        onPointerUp={() => (buttonsRef.current[cell as keyof HumanButtons] = false)}
                        onPointerLeave={() => (buttonsRef.current[cell as keyof HumanButtons] = false)}
                        aria-label={cell}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                          <path
                            d={
                              cell === "up"
                                ? "M12 19V6M6 12l6-6 6 6"
                                : cell === "down"
                                  ? "M12 5v13M6 12l6 6 6-6"
                                  : cell === "left"
                                    ? "M19 12H6M12 6l-6 6 6 6"
                                    : "M5 12h13M12 6l6 6-6 6"
                            }
                            strokeLinecap="square"
                          />
                        </svg>
                      </button>
                    ) : (
                      <span key={`${r}-${c}`} className="h-11 w-11" />
                    ),
                  ),
                )}
              </div>
              <div className="flex gap-2.5">
                {(["a", "b"] as const).map((b) => (
                  <button
                    key={b}
                    className="sw flex h-14 w-14 items-center justify-center rounded-full pad"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      buttonsRef.current[b] = true;
                    }}
                    onPointerUp={() => (buttonsRef.current[b] = false)}
                    onPointerLeave={() => (buttonsRef.current[b] = false)}
                    aria-label={`button ${b}`}
                  >
                    <span className="display text-[15px]">{b.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* screen well */}
        <section className="order-1 lg:order-2">
          <div className="plate relative p-2.5">
            <Screws />
            <div className="crt relative">
              <canvas
                ref={canvasRef}
                className="block w-full"
                style={{
                  aspectRatio: "16 / 9",
                  filter: "contrast(1.07) saturate(1.14) brightness(1.03)",
                }}
              />

              {/* pause overlay */}
              {paused && !result && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#06080a]/88">
                  <Silk className="silk-am">TRANSPORT HELD</Silk>
                  <div className="display mt-3 text-[clamp(2.4rem,7vw,4.6rem)] text-amber">PAUSED</div>
                  <div className="mt-2 text-[11.5px] text-cream/68">
                    The models are frozen mid-decision. Nothing is lost.
                  </div>
                  <div className="mt-7 flex gap-3">
                    <button className="sw sw-on px-6 py-3" onClick={() => setPaused(false)}>
                      <span className="silk" style={{ color: "#17120a" }}>RESUME</span>
                    </button>
                    <button className="sw px-6 py-3" onClick={restart}>
                      <span className="silk">RESTART · R</span>
                    </button>
                    <button className="sw px-6 py-3" onClick={onExit}>
                      <span className="silk">RACK · ESC</span>
                    </button>
                  </div>
                </div>
              )}

              {/* game-over overlay */}
              {result && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#06080a]/92 px-6">
                  <Silk className="silk-am">MATCH COMPLETE · RESULT WRITTEN TO LOCAL RECORDS</Silk>
                  <div className="display mt-3 text-[clamp(2.2rem,6.4vw,4.2rem)] text-amber">
                    {meta.name}
                  </div>
                  <div className="mt-1 text-[12px] text-cream/60">
                    CHAMPION —{" "}
                    <span className="text-cream">{result.row.champion}</span> · {result.row.points} PTS ·{" "}
                    {result.row.duration}s
                  </div>

                  <div className="mt-7 w-full max-w-[520px]">
                    {result.order.map((pi, rank) => {
                      const agent = rtRef.current?.agents[pi];
                      const color = agent?.color ?? "#FFB020";
                      return (
                        <div
                          key={pi}
                          className="flex items-center gap-3 border-b border-rule/70 py-2.5 last:border-0"
                        >
                          <span className="num display w-8 text-[17px]" style={{ color: rank === 0 ? "#FFB020" : "#A49B88" }}>
                            {String(rank + 1).padStart(2, "0")}
                          </span>
                          <span className="h-3 w-3" style={{ background: color }} />
                          <span className="flex-1 truncate text-[13px] text-cream">
                            {agent?.spec.name ?? "—"}
                          </span>
                          <span className="silk">{["4", "3", "2", "1"][rank] ?? "0"} PTS</span>
                          <span className="num w-[70px] text-right text-[15px]" style={{ color }}>
                            {String(Math.round(result.scores[pi] ?? 0)).padStart(4, "0")}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <button className="sw sw-on px-7 py-3.5" onClick={restart}>
                      <span className="display text-[16px]" style={{ color: "#17120a" }}>
                        RUN IT AGAIN · R
                      </span>
                    </button>
                    <button className="sw px-7 py-3.5" onClick={onExit}>
                      <span className="display text-[16px] text-cream">CHANGE CARTRIDGE</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* standings ticker */}
          <div className="plate mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
            <Silk className="silk-am">LIVE STANDINGS</Silk>
            {standings.map((s, rank) => {
              const agent = rtRef.current?.agents[s.i];
              const color = agent?.color ?? "#FFB020";
              return (
                <div key={s.i} className="flex items-center gap-2.5">
                  <span className="silk">{String(rank + 1).padStart(2, "0")}</span>
                  <span className="h-2.5 w-2.5" style={{ background: color }} />
                  <span className="text-[12px] text-cream/85">{agent?.spec.name ?? "—"}</span>
                  <span className="num text-[13px]" style={{ color }}>
                    {String(Math.round(s.s)).padStart(4, "0")}
                  </span>
                </div>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <Mark size={22} />
              <Silk>SIG-ARENA · SPECTATE / PILOT</Silk>
            </div>
          </div>

          {/* comms — the models talk */}
          <div className="mt-4">
            <Comms
              lines={comms}
              speaking={speaking}
              onSay={sayToBench}
              onStopAll={() => {
                voice.stopAll();
                audio.play("click");
              }}
              names={config.players.map((p, i) => rtRef.current?.agents[i]?.spec.name ?? p.toUpperCase())}
              colors={config.players.map((_, i) => rtRef.current?.agents[i]?.color ?? "#FFB020")}
            />
          </div>

          {/* telemetry */}
          <div className="plate-sunk mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
              <Silk className="silk-am">TELEMETRY — MODEL REASONING STREAM</Silk>
              <Silk>{config.engine === "live" ? "RAW UPLINK REPLY SHOWN" : "LOCAL POLICY TRACE"}</Silk>
            </div>
            <div className="log-fade max-h-[212px] overflow-y-auto px-4 py-3">
              {ui.log.length === 0 && (
                <div className="silk py-6 text-center text-cream/50">AWAITING FIRST DECISION…</div>
              )}
              {ui.log.map((l) => (
                <div key={l.id} className="flex gap-2.5 py-[3px] text-[11px] leading-[1.5]">
                  <span className="num shrink-0 text-cream/30">▸</span>
                  <span className="shrink-0 font-semibold" style={{ color: l.color }}>
                    {l.tag}
                  </span>
                  <span
                    className="min-w-0 flex-1 break-words"
                    style={{ color: l.kind === "ai" ? "#E8E2D4" : l.kind === "event" ? "#FFD27A" : "#A49B88" }}
                  >
                    {l.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* fixed pilot bar — phones only, appears the moment a model is possessed */}
      {ui.engines.some((e) => e === "PILOT") && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-rule bg-rack/96 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex gap-2">
            {(["left", "right", "up"] as const).map((d) => (
              <button
                key={d}
                className="pad sw flex h-12 w-12 items-center justify-center"
                onPointerDown={(e) => {
                  e.preventDefault();
                  buttonsRef.current[d] = true;
                }}
                onPointerUp={() => (buttonsRef.current[d] = false)}
                onPointerLeave={() => (buttonsRef.current[d] = false)}
                aria-label={d}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                  <path
                    d={d === "up" ? "M12 19V6M6 12l6-6 6 6" : d === "left" ? "M19 12H6M12 6l-6 6 6 6" : "M5 12h13M12 6l6 6-6 6"}
                    strokeLinecap="square"
                  />
                </svg>
              </button>
            ))}
          </div>
          <div className="silk">PILOT ACTIVE</div>
          <div className="flex gap-2">
            {(["a", "b"] as const).map((b) => (
              <button
                key={b}
                className="pad sw flex h-12 w-12 items-center justify-center rounded-full"
                onPointerDown={(e) => {
                  e.preventDefault();
                  buttonsRef.current[b] = true;
                }}
                onPointerUp={() => (buttonsRef.current[b] = false)}
                onPointerLeave={() => (buttonsRef.current[b] = false)}
                aria-label={`button ${b}`}
              >
                <span className="display text-[13px]">{b.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
