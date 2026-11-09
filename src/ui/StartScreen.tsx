import { useEffect, useMemo, useState } from "react";
import consoleImg from "../../public/images/console.jpg";
import panelImg from "../../public/images/panel.jpg";
import type { GameId } from "@/core/engine";
import { fetchModelList, type RemoteModel } from "@/core/llm";
import { ROSTER, TEAM_COLORS } from "@/core/roster";
import { loadScores, clearScores, type ScoreRow } from "@/core/scores";
import { clearSeason, loadSeason, type SeasonRow } from "@/core/season";
import { audio } from "@/core/audio";
import { voice } from "@/core/voice";
import { registerRoster } from "@/core/mind";
import { VoiceRow } from "./Comms";
import { GAMES } from "@/games";
import { Glyph, Mark, Meter, Silk } from "./bits";

export type EngineMode = "local" | "live";

export interface MatchConfig {
  gameId: GameId;
  players: string[];
  engine: EngineMode;
  seed: number;
  mode: string;
  pick: string | null;
}

export interface GameMode {
  id: string;
  code: string;
  name: string;
  blurb: string;
  speed: number;
  timeMul: number;
  scoreMul: number;
  chaos?: boolean;
}

/** Match modifiers — the same four cartridges, five different competitions. */
export const MODES: GameMode[] = [
  { id: "standard", code: "M1", name: "STANDARD", blurb: "Regulation pace, regulation length. Nothing modified.", speed: 1, timeMul: 1, scoreMul: 1 },
  { id: "turbo", code: "M2", name: "TURBO", blurb: "1.7× time. Reactions matter more than planning.", speed: 1.7, timeMul: 0.78, scoreMul: 1.25 },
  { id: "blitz", code: "M3", name: "BLITZ", blurb: "Half-length sprints. There is no time to think.", speed: 1.3, timeMul: 0.55, scoreMul: 1.5 },
  { id: "marathon", code: "M4", name: "MARATHON", blurb: "Double length. Attrition and patience decide it.", speed: 1, timeMul: 2, scoreMul: 1.15 },
  { id: "overclock", code: "M5", name: "OVERCLOCK", blurb: "Every mind runs hot and sloppy. Chaos. Double stakes.", speed: 1.5, timeMul: 1.1, scoreMul: 1.75, chaos: true },
];

export function StartScreen({ onStart }: { onStart: (c: MatchConfig) => void }) {
  const [gameId, setGameId] = useState<GameId>("pellet");
  const [selected, setSelected] = useState<string[]>([
    "openai-fast",
    "mistral",
    "deepseek",
    "grok",
  ]);
  const [engine, setEngine] = useState<EngineMode>("local");
  const [remote, setRemote] = useState<RemoteModel[] | null>(null);
  const [scores, setScores] = useState<ScoreRow[]>(() => loadScores());
  const [season, setSeason] = useState<SeasonRow[]>(() => loadSeason());
  const [voiceOn, setVoiceOn] = useState(true);
  const [mode, setMode] = useState("standard");
  const [pick, setPick] = useState<string | null>(null);
  const seasonMax = Math.max(1, ...season.map((s) => s.points));

  useEffect(() => {
    let alive = true;
    voice.init();
    registerRoster(ROSTER);
    fetchModelList().then((r) => {
      if (alive) setRemote(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    voice.setEnabled(voiceOn);
  }, [voiceOn]);

  const live = useMemo(() => new Set((remote ?? []).map((m) => m.name.toLowerCase())), [remote]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.length > 2 ? prev.filter((x) => x !== id) : prev;
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const game = GAMES.find((g) => g.id === gameId)!;

  return (
    <div className="relative min-h-screen overflow-hidden bg-rack">
      {/* CRT power-on */}
      <div className="boot-scan">
        <div className="boot-line" />
      </div>

      {/* atmosphere: control-room monitor wall */}
      <div className="pointer-events-none absolute inset-0">
        <img
          src={consoleImg}
          alt=""
          className="h-full w-full object-cover opacity-[0.42]"
          style={{ filter: "saturate(0.72) contrast(1.08)" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,rgba(255,176,32,0.10),transparent_58%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,22,26,0.82)_0%,rgba(20,22,26,0.72)_38%,rgba(20,22,26,0.96)_100%)]" />
        <div className="grain" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1520px] flex-col">
        {/* broadcast bar */}
        <header className="hair flex items-center gap-4 border-b border-rule px-5 py-3 backdrop-blur-[2px] sm:px-8">
          <Mark size={30} />
          <div className="silk text-cream">SIGNAL ARENA</div>
          <div className="hidden h-4 w-px bg-rule sm:block" />
          <div className="silk hidden sm:block">MODEL TEST BENCH · REV 4.2</div>
          <div className="ml-auto flex items-center gap-4">
            <div className="silk hidden md:block">
              KEYLESS ENDPOINT · TEXT.POLLINATIONS.AI
            </div>
            <div className="flex items-center gap-2">
              <span className="blink h-2 w-2 rounded-full bg-alert lamp" style={{ color: "#FF4438" }} />
              <span className="silk text-alert">REC</span>
            </div>
          </div>
        </header>

        <main className="grid flex-1 gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_468px] lg:gap-12 lg:py-14">
          {/* ---- left: title + game rack ---- */}
          <section>
            <div className="rise">
              <div className="silk silk-am mb-4">CH 01 — ARENA CONTROL</div>
              <h1 className="display text-cream" style={{ fontSize: "clamp(3.2rem, 9.2vw, 8.4rem)" }}>
                SIGNAL
                <br />
                <span className="glow text-amber">ARENA</span>
              </h1>
              <div className="mt-6 h-px w-full bg-rule" />
              <p className="mt-5 max-w-[54ch] text-[13.5px] leading-[1.85] text-cream/78">
                Patch free, keyless AI models into a four-game arcade suite and watch them compete
                against each other. Every move is the model's own — either a real HTTP round-trip to
                the live endpoint, or a real forward pass through its own tiny neural policy running
                in this tab. You are the director. Grab the controls whenever you want.
              </p>
            </div>

            {/* game rack — rows, not cards */}
            <div className="mt-9">
              <div className="mb-3 flex items-baseline justify-between">
                <Silk>GAME RACK — SELECT CARTRIDGE</Silk>
                <span className="silk">{GAMES.length} LOADED</span>
              </div>
              <div className="border border-rule">
                {GAMES.map((g) => {
                  const on = g.id === gameId;
                  return (
                    <button
                      key={g.id}
                      onClick={() => {
                        audio.play("click");
                        setGameId(g.id);
                      }}
                      className={`group relative flex w-full items-center gap-4 border-b border-rule px-4 py-4 text-left transition-colors duration-150 last:border-b-0 sm:gap-5 sm:px-5 ${
                        on ? "bg-[#20252c]" : "hover:bg-[#1a1e23]"
                      }`}
                      style={{
                        backgroundImage: on ? `url(${panelImg})` : undefined,
                        backgroundSize: "cover",
                        backgroundBlendMode: "overlay",
                      }}
                      aria-pressed={on}
                    >
                      <span
                        className="absolute left-0 top-0 h-full w-[3px] transition-all"
                        style={{ background: on ? "#FFB020" : "transparent" }}
                      />
                      <span
                        className="shrink-0 transition-colors"
                        style={{ color: on ? "#FFB020" : "#A49B88" }}
                      >
                        <Glyph id={g.id} size={40} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="silk" style={{ color: on ? "#FFB020" : "#A49B88" }}>
                            {g.code}
                          </span>
                          <span
                            className="display text-[21px] leading-none sm:text-[25px]"
                            style={{ color: on ? "#E8E2D4" : "#b9b2a3" }}
                          >
                            {g.name}
                          </span>
                          <span className="silk">{g.tag}</span>
                        </span>
                        <span className="mt-2 block max-w-[52ch] text-[11.5px] leading-[1.7] text-cream/68">
                          {g.blurb}
                        </span>
                      </span>
                      <span
                        className={`ml-auto h-2.5 w-2.5 shrink-0 rounded-full ${on ? "lamp" : ""}`}
                        style={{ background: on ? "#FFB020" : "#2A2F37", color: "#FFB020" }}
                      />

                    </button>
                  );
                })}
              </div>
            </div>

            {/* match modifiers */}
            <div className="mt-10">
              <div className="mb-3 flex items-baseline justify-between">
                <Silk>MATCH MODIFIER — SAME CARTRIDGES, DIFFERENT COMPETITION</Silk>
                <span className="silk">{MODES.length} PROGRAMS</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MODES.map((m) => {
                  const on = m.id === mode;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        audio.play("click");
                        setMode(m.id);
                      }}
                      className={`sw px-4 py-3 text-left ${on ? "sw-on" : ""}`}
                      aria-pressed={on}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="silk" style={{ color: on ? "rgba(23,18,10,0.7)" : undefined }}>
                          {m.code}
                        </span>
                        <span
                          className="display text-[15px] leading-none"
                          style={{ color: on ? "#17120a" : "#E8E2D4" }}
                        >
                          {m.name}
                        </span>
                      </div>
                      <div
                        className="mt-2 text-[10px] leading-[1.7]"
                        style={{ color: on ? "rgba(23,18,10,0.82)" : "rgba(232,226,212,0.58)" }}
                      >
                        {m.blurb}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* the bounty — back a model */}
            <div className="mt-8">
              <div className="mb-3 flex items-baseline justify-between">
                <Silk>THE BOUNTY — BACK A MODEL BEFORE THE MATCH</Silk>
                <span className="silk">
                  {pick ? "STAKE PLACED" : "NO STAKE"}
                </span>
              </div>
              <div className="plate-sunk px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      audio.play("click");
                      setPick(null);
                    }}
                    className={`sw px-3 py-2 ${pick === null ? "sw-on" : ""}`}
                  >
                    <span className="silk" style={{ color: pick === null ? "#17120a" : undefined }}>
                      NO BET
                    </span>
                  </button>
                  {selected.map((id, i) => {
                    const spec = ROSTER.find((r) => r.id === id);
                    const on = pick === id;
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          audio.play("toggle");
                          setPick(id);
                        }}
                        className={`sw px-3 py-2 ${on ? "sw-on" : ""}`}
                        style={on ? undefined : { borderLeft: `3px solid ${TEAM_COLORS[i % TEAM_COLORS.length]}` }}
                      >
                        <span className="silk" style={{ color: on ? "#17120a" : undefined }}>
                          {spec?.name ?? id}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 text-[10.5px] leading-[1.8] text-cream/58">
                  Back the winner and the season table pays a{" "}
                  <span className="text-amber">6-point bounty</span> — 3 if your pick merely podiums.
                  It costs nothing and it is not a prediction about who is better. It is a bet on who
                  is angrier.
                </div>
              </div>
            </div>

            {/* voice desk */}
            <div className="mt-10">
              <div className="mb-3 flex items-baseline justify-between">
                <Silk>VOICE DESK — EVERY MODEL SPEAKS WITH ITS OWN VOICE</Silk>
                <button
                  className={`silk sw px-2.5 py-1.5 ${voiceOn ? "sw-on" : ""}`}
                  onClick={() => {
                    audio.play("toggle");
                    setVoiceOn((v) => !v);
                  }}
                >
                  <span style={{ color: voiceOn ? "#17120a" : undefined }}>
                    {voiceOn ? "VOICES ON" : "VOICES OFF"}
                  </span>
                </button>
              </div>
              <div className="plate-sunk">
                <div className="border-b border-rule px-4 py-2.5">
                  <div className="silk">
                    SAME LINE, DIFFERENT VOICE · ASSIGNED FROM YOUR SYSTEM VOICE SET
                  </div>
                </div>
                <div className="max-h-[268px] overflow-y-auto">
                  {ROSTER.map((m, i) => (
                    <VoiceRow
                      key={m.id}
                      id={m.id}
                      name={m.name}
                      color={TEAM_COLORS[i % TEAM_COLORS.length]}
                      sample="Voice check. I am on the bench, and I intend to win this match."
                    />
                  ))}
                </div>
                <div className="border-t border-rule px-4 py-3 text-[10.5px] leading-[1.8] text-cream/58">
                  Voices run on your device's own speech engine — nothing is sent anywhere and no
                  key is needed. If a browser exposes no voices, the models fall back to pitch and
                  rate shaping so they still sound distinct. They talk to each other unprompted
                  once a match starts, and they will answer you on COMMS CHANNEL 1.
                </div>
              </div>
            </div>

            {/* season standings */}
            <div className="mt-10">
              <div className="mb-3 flex items-baseline justify-between">
                <Silk>SEASON STANDINGS — ACCUMULATED ACROSS EVERY MATCH</Silk>
                {season.length > 0 && (
                  <button
                    className="silk sw px-2.5 py-1.5"
                    onClick={() => {
                      audio.play("click");
                      setSeason(clearSeason());
                    }}
                  >
                    RESET
                  </button>
                )}
              </div>
              <div className="plate-sunk px-4 py-4">
                {season.length === 0 ? (
                  <div className="py-7 text-center">
                    <div className="silk mb-2.5">SEASON NOT YET RUN</div>
                    <div className="mx-auto max-w-[46ch] text-[11px] leading-[1.8] text-cream/58">
                      Finishing order pays 4 / 3 / 2 / 1 points. Every match you watch adds to the
                      table, so the models build a record the longer the bench stays powered on.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {season.slice(0, 10).map((r, i) => (
                      <div key={r.id} className="flex items-center gap-3">
                        <span
                          className="num w-6 shrink-0 text-[11px]"
                          style={{ color: i === 0 ? "#FFB020" : "#A49B88" }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span
                          className="h-2.5 w-2.5 shrink-0"
                          style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }}
                        />
                        <span className="w-[104px] shrink-0 truncate text-[11.5px] text-cream">
                          {r.name}
                        </span>
                        <div className="relative h-[13px] min-w-0 flex-1 bg-rule/45">
                          <div
                            className="absolute inset-y-0 left-0 transition-[width] duration-300"
                            style={{
                              width: `${Math.max(3, (r.points / seasonMax) * 100)}%`,
                              background: TEAM_COLORS[i % TEAM_COLORS.length],
                              boxShadow: `0 0 10px ${TEAM_COLORS[i % TEAM_COLORS.length]}55`,
                            }}
                          />
                        </div>
                        <span className="num w-[34px] shrink-0 text-right text-[12px] text-amber">
                          {r.points}
                        </span>
                        <span className="silk hidden w-[74px] shrink-0 text-right sm:block">
                          {r.wins}W · {r.played}P
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* high-score table */}
            <div className="mt-10">
              <div className="mb-3 flex items-baseline justify-between">
                <Silk>LOCAL RECORDS — TOP 8 RUNS</Silk>
                {scores.length > 0 && (
                  <button
                    className="silk sw px-2.5 py-1.5"
                    onClick={() => setScores(clearScores())}
                  >
                    PURGE
                  </button>
                )}
              </div>
              <div className="plate-sunk overflow-x-auto">
                <table className="w-full min-w-[540px] border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-rule text-left">
                      {["#", "CHAMPION", "CARTRIDGE", "ENGINE", "PTS", "DATE"].map((h) => (
                        <th key={h} className="silk px-3 py-2.5 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scores.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center">
                          <div className="silk mb-2 text-cream/58">NO RUNS LOGGED</div>
                          <div className="text-[11px] text-cream/50">
                            Finish a match and the console writes the result here.
                          </div>
                        </td>
                      </tr>
                    )}
                    {scores.map((s, i) => (
                      <tr key={i} className="border-b border-rule/60 last:border-0">
                        <td className="num px-3 py-2.5 text-amber">{String(i + 1).padStart(2, "0")}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5"
                              style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }}
                            />
                            <span className="text-cream">{s.champion}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-cream/60">{s.game}</td>
                        <td className="px-3 py-2.5 text-cream/58">{s.engine}</td>
                        <td className="num px-3 py-2.5 text-amber">{String(s.points).padStart(4, "0")}</td>
                        <td className="num px-3 py-2.5 text-cream/40">{s.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ---- right: patch bay ---- */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="plate relative">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={{ backgroundImage: `url(${panelImg})`, backgroundSize: "cover", mixBlendMode: "overlay" }}
              />
              <div className="relative">
                <div className="flex items-center justify-between border-b border-rule px-5 py-4">
                  <div>
                    <Silk className="silk-am">PATCH BAY</Silk>
                    <div className="display mt-1.5 text-[19px] text-cream">SELECT 2–4 MODELS</div>
                  </div>
                  <div className="text-right">
                    <div className="num display text-[30px] text-amber">{selected.length}</div>
                    <Silk>SLOTS ARMED</Silk>
                  </div>
                </div>

                <div className="max-h-[410px] overflow-y-auto">
                  {ROSTER.map((m) => {
                    const on = selected.includes(m.id);
                    const slot = selected.indexOf(m.id);
                    const isLive = remote === null ? null : live.has(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          audio.play("toggle");
                          toggle(m.id);
                        }}
                        className={`flex w-full items-start gap-3.5 border-b border-rule/70 px-4 py-3 text-left transition-colors duration-150 ${
                          on ? "bg-[#22272e]" : "hover:bg-[#1b1f25]"
                        }`}
                        aria-pressed={on}
                      >
                        <span
                          className="mt-1 h-8 w-[5px] shrink-0 transition-all"
                          style={{
                            background: on ? TEAM_COLORS[slot] : "#2A2F37",
                            boxShadow: on ? `0 0 10px ${TEAM_COLORS[slot]}66` : "none",
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span
                              className="display text-[15px] leading-none"
                              style={{ color: on ? "#E8E2D4" : "#a49d8f" }}
                            >
                              {m.name}
                            </span>
                            <span className="silk">{m.vendor}</span>
                          </span>
                          <span className="mt-1.5 block text-[10.5px] leading-[1.65] text-cream/64">
                            {m.blurb}
                          </span>
                          <span className="mt-2 flex items-center gap-2.5">
                            <Meter
                              value={1 - Math.min(0.85, m.latency / 1.4)}
                              color={on ? TEAM_COLORS[slot] : "#3a4049"}
                              bars={8}
                            />
                            <span className="silk">{m.latency.toFixed(2)}s</span>
                            <span
                              className="silk ml-auto"
                              style={{
                                color:
                                  isLive === null ? "#A49B88" : isLive ? "#43D97B" : "#A49B88",
                              }}
                            >
                              {isLive === null ? "PROBE…" : isLive ? "SIGNAL OK" : "FALLBACK"}
                            </span>
                          </span>
                        </span>
                        <span
                          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] font-semibold transition-colors ${
                            on ? "border-amber bg-amber text-[#17120a]" : "border-rule text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* engine switch */}
                <div className="border-t border-rule px-5 py-5">
                  <Silk className="mb-3">DECISION ENGINE</Silk>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["local", "LOCAL NEURAL", "4-unit tanh policy, in-tab inference"],
                        ["live", "LIVE LLM UPLINK", "real HTTP call, model replies with a move"],
                      ] as const
                    ).map(([id, label, sub]) => (
                      <button
                        key={id}
                        onClick={() => setEngine(id)}
                        className={`sw px-3 py-3 text-left ${engine === id ? "sw-on" : ""}`}
                        aria-pressed={engine === id}
                      >
                        <div className="silk" style={{ color: engine === id ? "#17120a" : "#A49B88" }}>
                          {label}
                        </div>
                        <div
                          className="mt-1.5 text-[9.5px] leading-[1.55]"
                          style={{ color: engine === id ? "rgba(23,18,10,0.8)" : "rgba(232,226,212,0.42)" }}
                        >
                          {sub}
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] leading-[1.7] text-cream/58">
                    {engine === "live"
                      ? "Uplink mode sends the full board state to each model and parses its reply. The endpoint is anonymous and rate-limited — if a call is refused the console logs it and that model falls back to its local policy for the next few seconds."
                      : "Local mode runs a genuine forward pass through each model's own weights every decision tick. No network, no key, 60fps."}
                  </p>
                </div>

                {/* start lever */}
                <div className="border-t border-rule px-5 py-5">
                  <button
                    onClick={() => {
                      audio.play("start");
                      onStart({
                        gameId,
                        players: selected,
                        engine,
                        seed: Date.now() % 100000,
                        mode,
                        pick,
                      });
                    }}
                    className="lever sw-on flex w-full items-center justify-between px-5 py-4"
                  >
                    <span>
                      <span className="silk" style={{ color: "rgba(23,18,10,0.72)" }}>
                        CARTRIDGE {game.code} — {game.name}
                      </span>
                      <span className="display mt-1.5 block text-[22px] leading-none">
                        PATCH IN &amp; START
                      </span>
                    </span>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="square" />
                    </svg>
                  </button>
                  <div className="mt-3 flex items-center justify-between">
                    <Silk>SPECTATE BY DEFAULT · PRESS 1–4 OR TAP PILOT TO TAKE OVER</Silk>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
