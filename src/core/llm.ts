// Live LLM uplink — keyless, free text inference.
// Primary: POST https://text.pollinations.ai/openai (OpenAI-compatible, no auth).
// Fallback: GET https://text.pollinations.ai/{prompt}?model=…
// Every call is wrapped in a timeout and degrades to LOCAL NEURAL on failure.

export interface LlmReply {
  text: string;
  ms: number;
  ok: boolean;
}

const OPENAI_URL = "https://text.pollinations.ai/openai";
const SIMPLE_URL = "https://text.pollinations.ai/";

let lastCallAt = 0;
const MIN_GAP = 3200; // anonymous tier is heavily rate-limited; stay polite

async function throttle() {
  const now = Date.now();
  const wait = lastCallAt + MIN_GAP - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export function parseMove(text: string, count: number): number {
  if (!text) return -1;
  // preferred: "MOVE 3"
  const explicit = text.match(/move\s*[:#-]?\s*([0-9]+)/i);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    if (n >= 1 && n <= count) return n - 1;
  }
  // fallback: first standalone integer in range
  const m = text.match(/(?:^|\D)([1-9]\d?)(?=\D|$)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= count) return n - 1;
  }
  return -1;
}

export async function askModel(
  model: string,
  system: string,
  user: string,
  seed: number,
  timeoutMs = 11000,
): Promise<LlmReply> {
  await throttle();
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.85,
        seed,
        private: true,
        referrer: "signal-arena",
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const text: string =
      data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? String(data ?? "");
    return { text: String(text).trim(), ms: performance.now() - t0, ok: true };
  } catch (e) {
    try {
      const url =
        SIMPLE_URL +
        encodeURIComponent(user.slice(0, 1500)) +
        `?model=${encodeURIComponent(model)}&seed=${seed}&system=${encodeURIComponent(system.slice(0, 320))}`;
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = (await res.text()).trim();
      return { text, ms: performance.now() - t0, ok: true };
    } catch {
      return { text: "", ms: performance.now() - t0, ok: false };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the model for one line of colour commentary. Never blocks the match. */
export async function askCommentary(model: string, user: string, seed: number): Promise<LlmReply> {
  return askModel(
    model,
    "You are a terse arcade commentator. Reply with ONE short sentence, max 11 words, lowercase, no punctuation at the end.",
    user,
    seed,
    8000,
  );
}

export interface RemoteModel {
  name: string;
  description?: string;
  tier?: string;
}

/** Discover which models the keyless endpoint is currently serving. */
export async function fetchModelList(timeoutMs = 6000): Promise<RemoteModel[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("https://text.pollinations.ai/models", { signal: ctl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) {
      return data.map((m: unknown) =>
        typeof m === "string"
          ? { name: m }
          : { name: (m as RemoteModel).name, description: (m as RemoteModel).description },
      );
    }
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
