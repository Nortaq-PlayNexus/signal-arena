import { MLP, hashStr, makeRng } from "./engine";

export interface ModelSpec {
  id: string;
  name: string;
  vendor: string;
  blurb: string;
  /** live-LLM decoding + local-net personality */
  temperature: number;
  explore: number;
  latency: number;
  weight: number;
}

/**
 * The roster: free, keyless text models. Identity, tuning and the seed used to
 * derive each one's local neural weights all live here.
 */
export const ROSTER: ModelSpec[] = [
  {
    id: "openai-fast",
    name: "OPENAI-FAST",
    vendor: "OpenAI",
    blurb: "Low-latency generalist. Reads the board quickly, commits early.",
    temperature: 0.06,
    explore: 0.05,
    latency: 0.6,
    weight: 1.0,
  },
  {
    id: "mistral",
    name: "MISTRAL",
    vendor: "Mistral AI",
    blurb: "Small, aggressive, positional. Punishes anyone who drifts wide.",
    temperature: 0.1,
    explore: 0.09,
    latency: 0.85,
    weight: 1.04,
  },
  {
    id: "deepseek",
    name: "DEEPSEEK",
    vendor: "DeepSeek",
    blurb: "Long-horizon planner. Trades short-term points for endgame shape.",
    temperature: 0.08,
    explore: 0.04,
    latency: 1.15,
    weight: 1.12,
  },
  {
    id: "qwen-coder",
    name: "QWEN-CODER",
    vendor: "Alibaba",
    blurb: "Pattern matcher. Extremely good at the stack, chaotic everywhere else.",
    temperature: 0.12,
    explore: 0.14,
    latency: 0.95,
    weight: 1.02,
  },
  {
    id: "llama",
    name: "LLAMA",
    vendor: "Meta",
    blurb: "Balanced all-rounder. Rarely brilliant, almost never last.",
    temperature: 0.11,
    explore: 0.11,
    latency: 0.9,
    weight: 1.0,
  },
  {
    id: "gemini",
    name: "GEMINI",
    vendor: "Google",
    blurb: "Wide attention. Tracks every rival at once and stays out of trouble.",
    temperature: 0.09,
    explore: 0.06,
    latency: 0.8,
    weight: 1.06,
  },
  {
    id: "grok",
    name: "GROK",
    vendor: "xAI",
    blurb: "Chaotic. High exploration, high reward, occasional spectacular crash.",
    temperature: 0.18,
    explore: 0.22,
    latency: 1.0,
    weight: 0.98,
  },
  {
    id: "kimi",
    name: "KIMI",
    vendor: "Moonshot",
    blurb: "Patient and defensive. Guards first, answers second.",
    temperature: 0.07,
    explore: 0.05,
    latency: 1.1,
    weight: 1.05,
  },
  {
    id: "glm",
    name: "GLM",
    vendor: "Zhipu AI",
    blurb: "Methodical. Converts small advantages into reliable points.",
    temperature: 0.1,
    explore: 0.08,
    latency: 1.05,
    weight: 1.03,
  },
  {
    id: "minimax",
    name: "MINIMAX",
    vendor: "MiniMax",
    blurb: "Conflict-seeking. Goes wherever the fight is thickest.",
    temperature: 0.15,
    explore: 0.17,
    latency: 1.2,
    weight: 0.96,
  },
  {
    id: "nova-fast",
    name: "NOVA-FAST",
    vendor: "Amazon",
    blurb: "Burst decision maker. Refreshes its mind more often than anyone.",
    temperature: 0.09,
    explore: 0.1,
    latency: 0.55,
    weight: 1.01,
  },
  {
    id: "claude-fast",
    name: "CLAUDE-FAST",
    vendor: "Anthropic",
    blurb: "Careful and conservative. Values survival over a big score.",
    temperature: 0.06,
    explore: 0.03,
    latency: 1.0,
    weight: 1.07,
  },
];

export const TEAM_COLORS = ["#FFB020", "#43D97B", "#FF5C86", "#6EA8FE"];

export interface PlayerAgent {
  spec: ModelSpec;
  color: string;
  net: MLP;
  rng: () => number;
}

export function buildAgents(
  ids: string[],
  prior: number[],
  seed: number,
): PlayerAgent[] {
  return ids.map((id, i) => {
    const spec = ROSTER.find((m) => m.id === id) ?? ROSTER[i % ROSTER.length];
    const s = hashStr(spec.id) ^ seed ^ (i * 0x9e3779b9);
    return {
      spec,
      color: TEAM_COLORS[i % TEAM_COLORS.length],
      net: new MLP(s, prior.map((p) => p * spec.weight)),
      rng: makeRng(s),
    };
  });
}
