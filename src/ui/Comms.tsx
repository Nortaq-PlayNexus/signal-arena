import { useEffect, useRef, useState } from "react";
import type { CommsLine } from "@/core/mind";
import { voice } from "@/core/voice";

/* ------------------------------------------------------------------ */
/* Speaking indicator — a live level meter driven by the voice desk     */
/* ------------------------------------------------------------------ */
export function Wave({ active, color, bars = 5 }: { active: boolean; color?: string; bars?: number }) {
  return (
    <span className="inline-flex h-[13px] items-end gap-[2px]" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-[2px] origin-bottom"
          style={{
            background: active ? color ?? "#FFB020" : "#343a42",
            height: active ? `${30 + ((i * 37) % 70)}%` : "22%",
            animation: active ? `level 0.42s ease-in-out ${i * 0.07}s infinite alternate` : "none",
            transition: "height .18s",
          }}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Comms panel — the models talk to each other and to you              */
/* ------------------------------------------------------------------ */
export function Comms({
  lines,
  speaking,
  onSay,
  onStopAll,
  names,
  colors,
}: {
  lines: CommsLine[];
  speaking: Map<string, string>;
  onSay: (text: string, target: number | null) => void;
  onStopAll: () => void;
  names: string[];
  colors: string[];
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const SR =
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    setMicOk(Boolean(SR));
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSay(t, target);
    setText("");
  };

  const toggleMic = () => {
    const SR = (
      window as unknown as {
        SpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          onresult: (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void;
          onend: () => void;
          onerror: () => void;
          start: () => void;
          stop: () => void;
        };
      }
    ).SpeechRecognition ??
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            continuous: boolean;
            onresult: (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void;
            onend: () => void;
            onerror: () => void;
            start: () => void;
            stop: () => void;
          };
        }
      ).webkitSpeechRecognition;
    if (!SR) return;
    if (micOn) {
      recRef.current?.stop();
      setMicOn(false);
      return;
    }
    try {
      const r = new SR();
      r.lang = "en-US";
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (e) => {
        const t = e.results[0]?.[0]?.transcript ?? "";
        setText(t);
      };
      r.onend = () => {
        setMicOn(false);
        const el = document.getElementById("comms-input") as HTMLInputElement | null;
        const t = (el?.value ?? "").trim();
        if (t) {
          onSay(t, target);
          setText("");
        }
      };
      r.onerror = () => setMicOn(false);
      recRef.current = r;
      r.start();
      setMicOn(true);
    } catch {
      setMicOk(false);
    }
  };

  return (
    <div className="plate-sunk overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="lamp h-2 w-2 rounded-full" style={{ background: "#43D97B", color: "#43D97B" }} />
          <span className="silk silk-am">COMMS CHANNEL 1 — OPEN</span>
        </div>
        <button onClick={onStopAll} className="silk sw px-2.5 py-1.5">
          CUT AUDIO
        </button>
      </div>

      <div ref={boxRef} className="log-fade max-h-[248px] min-h-[132px] overflow-y-auto px-4 py-3">
        {lines.length === 0 && (
          <div className="py-8 text-center">
            <div className="silk mb-2 text-cream/50">CHANNEL QUIET</div>
            <div className="mx-auto max-w-[42ch] text-[10.5px] leading-[1.8] text-cream/58">
              The models talk on their own as the match unfolds. Say anything below and
              they will answer out loud.
            </div>
          </div>
        )}
        {lines.map((l) => (
          <div key={l.id} className="flex gap-2.5 py-[5px]">
            {l.kind === "user" ? (
              <>
                <span className="silk mt-[3px] shrink-0 text-amber">YOU</span>
                <span className="min-w-0 flex-1 break-words text-[11px] leading-[1.65] text-cream">
                  {l.text}
                </span>
              </>
            ) : (
              <>
                <span className="mt-[2px] shrink-0">
                  <Wave active={speaking.has(l.who)} color={l.color} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[10px] font-semibold tracking-[0.14em]" style={{ color: l.color }}>
                      {l.name}
                    </span>
                    <span className="silk">
                      {l.kind === "event" ? "REACT" : l.kind === "reply" ? "TO YOU" : "THINKING"}
                    </span>
                  </span>
                  <span
                    className="mt-[3px] block break-words text-[11.5px] leading-[1.65]"
                    style={{
                      color: l.kind === "event" ? "#FFD27A" : "#E8E2D4",
                      fontStyle: l.kind === "thought" ? "italic" : "normal",
                    }}
                  >
                    {l.text}
                  </span>
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-rule px-3 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => setTarget(null)}
            className={`sw px-2.5 py-1.5 ${target === null ? "sw-on" : ""}`}
          >
            <span className="silk" style={{ color: target === null ? "#17120a" : undefined }}>
              EVERYONE
            </span>
          </button>
          {names.map((n, i) => (
            <button
              key={n + i}
              onClick={() => setTarget(i)}
              className={`sw px-2.5 py-1.5 ${target === i ? "sw-on" : ""}`}
              style={target === i ? undefined : { borderLeft: `3px solid ${colors[i]}` }}
            >
              <span className="silk" style={{ color: target === i ? "#17120a" : undefined }}>
                {n}
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            id="comms-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") send();
            }}
            placeholder={micOn ? "listening…" : "say something to the bench…"}
            className="min-w-0 flex-1 border border-rule bg-[#0c0f13] px-3 py-2.5 text-[11.5px] text-cream outline-none placeholder:text-cream/38 focus:border-amber"
          />
          {micOk && (
            <button
              onClick={toggleMic}
              className={`sw px-3 ${micOn ? "sw-on" : ""}`}
              aria-label="Talk instead of typing"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="square" />
              </svg>
            </button>
          )}
          <button onClick={send} className="sw sw-on px-4">
            <span className="silk" style={{ color: "#17120a" }}>
              SEND
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Voice row — used on the power-on screen to audition each model       */
/* ------------------------------------------------------------------ */
export function VoiceRow({
  id,
  name,
  color,
  sample,
}: {
  id: string;
  name: string;
  color: string;
  sample: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [label, setLabel] = useState(() => voice.voiceLabel(id));

  useEffect(() => {
    return voice.subscribe(() => {
      setSpeaking(voice.speaking().has(id));
      setLabel(voice.voiceLabel(id));
    });
  }, [id]);

  return (
    <div className="flex items-center gap-3 border-b border-rule/70 px-4 py-2.5 last:border-0">
      <span className="h-6 w-[4px] shrink-0" style={{ background: color }} />
      <span className="w-[112px] shrink-0 truncate text-[11px] text-cream">{name}</span>
      <Wave active={speaking} color={color} />
      <span className="silk min-w-0 flex-1 truncate">{label}</span>
      <button
        onClick={() => voice.test(id, sample)}
        className="sw px-2.5 py-1.5"
        aria-label={`Hear ${name}`}
      >
        <span className="silk">AUDITION</span>
      </button>
    </div>
  );
}
