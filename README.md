# Signal Arena

[![Release](https://img.shields.io/badge/Release-v1.0.0-blue)](https://github.com/Nortaq-PlayNexus/signal-arena/releases/tag/v1.0.0)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-10%2F11-lightgrey)](https://github.com/Nortaq-PlayNexus/signal-arena/releases)
[![Web](https://img.shields.io/badge/Stack-React%20%2B%20Vite-61DAFB)](https://vitejs.dev/)
[![Stars](https://img.shields.io/github/stars/Nortaq-PlayNexus/signal-arena)](https://github.com/Nortaq-PlayNexus/signal-arena/stargazers)

![Signal Arena Start Screen](docs/screenshots/01-start-screen.png)

**Patch real, keyless AI models into a four-game arcade suite and spectate them compete.**

Signal Arena is a browser-based (and Electron-packaged for Windows) arcade arena where real AI models — OpenAI, Mistral, DeepSeek, Grok, Claude and others — compete head-to-head across four games. Watch live commentary, rankings, and rivalries unfold in real time. Includes a fully offline Local Neural mode powered by a deterministic MLP policy.

## Overview

What if LLMs competed in arcade games while commenting on each other live? Signal Arena makes that real.

- **Local Neural Mode** — 12-model roster driven by a real forward-pass MLP (14 inputs → 4 tanh → output) with seeded weights. Deterministic, offline, zero network.
- **Live LLM Mode** — Keyless free inference via Pollinations.ai (no API key). Models choose moves and provide commentary in-channel. Degrades gracefully to local policy on rate limits.
- **Real Personality System** — Each model has aggression, patience, smugness, warmth, voice style, beliefs, grudges, and memory. Taunts and retorts are composed, not canned.
- **Four Games** — Pellet (steer/capture), Stack (drops), Circuit (racetrack), Brawl (combat). Same engine, 5 match modes.
- **Season System** — Points and history persist across matches. Turn any match into a championship run.

## Key Features

| Feature | Status |
|---|---|
| 4 arcade games with canvas rendering + FX (shake, burst, flash) | ✅ Implemented |
| 12-model roster with personas, voice synthesis, belie beliefs | ✅ Implemented |
| Local Neural MLP agent (fully deterministic) | ✅ Implemented |
| Live LLM move selection + commentary (Pollinations, rate-limited) | ✅ Implemented |
| Score / season / history persistence (localStorage) | ✅ Implemented |
| 5 match modifiers: Standard, Turbo, Blitz, Marathon, Overclock | ✅ Implemented |
| Human takeover (keyboard pilot) | ✅ Implemented |
| Windows EXE installer (Electron) | ✅ Implemented — v1.0.0 |
| GitHub Actions CI (build/typecheck) | 🚧 Planned |

## Visual Showcase

### Start Screen — Roster & Match Setup

![Start Screen](docs/screenshots/01-start-screen.png)

> The start screen lets you pick the game (Pellet / Stack / Circuit / Brawl), select 2–12 models, choose Local Neural or Live LLM, pick a mode modifier (Standard / Turbo / Blitz / Marathon / Overclock), set a seed, and view season standings before you launch.

Built with Tailwind CSS 4, Archivo Black + IBM Plex Mono. Photos: concrete / console / panel / steel / tarmac textures in `public/images/`.

### In-Match

During a match the Stage renders the game canvas, HUD (`HudCell` bars), live comms feed (thoughts / events / user replies), and optional voice. Minds track rival, momentum, tilt, heat, and produce composed commentary from beliefs + game facts.

## Installation

### Windows Executable (Recommended)

1. Download **Signal Arena Setup 1.0.0.exe** from the [Releases](https://github.com/Nortaq-PlayNexus/signal-arena/releases/tag/v1.0.0)
2. Run installer (per-user, no admin required)
3. Launch from Start Menu → Signal Arena

SHA256: `0C0AF697B6F27572BFE863FC58FA34BB28347AC23043A8D276D331B6BB43A8EE`

### Web — Dev

```powershell
git clone https://github.com/Nortaq-PlayNexus/signal-arena.git
cd signal-arena
npm install
npm run dev
# Open http://localhost:5173
```

### Web — Production (single file)

```powershell
npm install
npm run build
# Output: dist/index.html — open in any modern browser, fully self-contained (1.7 MB)
```

Requirements: Node.js 18+, npm 9+. Chrome / Edge / Firefox latest.

## Quick Start

```powershell
npm install
npm run dev
```

Pick a game, keep the default 4-model roster, hit Start. For offline play, keep **Engine: Local Neural**. For live models, switch to **Live LLM** (needs internet, anonymous Pollinations tier).

## Usage

1. **Choose Game** — Select Pellet, Stack, Circuit, or Brawl.
2. **Select Models** — Pick 2–12 from the roster (OpenAI Fast, Mistral, DeepSeek, Qwen, Llama, Gemini, Grok, Kimi, GLM, MiniMax, Nova, Claude).
3. **Choose Engine** — Local Neural (offline) or Live LLM (keyless).
4. **Choose Mode** — Standard / Turbo (1.7× speed) / Blitz (half length) / Marathon (2×) / Overclock (chaos, double stakes).
5. **Start** — Watch the match, read comms, use operator chat to address any model live.
6. **Human Pilot** — Hold keys to take over one model; release to hand control back.

## Architecture

```
src/
  core/
    engine.ts   — Deterministic core: RNG (mulberry32), MLP policy (14→4→1 tanh), interfaces
    mind.ts     — Persona system: beliefs, banks, grudges, composed commentary
    roster.ts   — 12-model roster with vendors, colors, metadata
    llm.ts      — Pollinations live uplink (throttled, timeout, fallback)
    scores.ts / season.ts — Persistence (localStorage)
    audio.ts / voice.ts / fx.ts / textures.ts — Sound / TTS / particles / canvas textures
  games/
    base.ts     — Shared game interface helpers
    pellet.ts / stack.ts / circuit.ts / brawl.ts — Four implementations of GameInstance
    index.ts    — Registry
  ui/
    App.tsx     — Root (Start ↔ Stage)
    StartScreen.tsx — Setup, mode picker, standings
    Stage.tsx   — Canvas loop, HUD, comms, operator input
    Comms.tsx / bits.tsx — Chat feed / shared UI
```

**Engine contract** (`GameInstance`): `update(dt, actions)`, `draw(ctx,w,h)`, `options(i)` → `Option{label, feat[14]}`, `describe`, `scores`, `alive`, `hud`, `human`. The MLP scores each option's feature vector and picks argmax + stochastic exploration.

## Tech Stack

- React 19.2, TypeScript 5.9 (strict), Vite 7.3
- Tailwind CSS 4.1 + `@tailwindcss/vite`
- Electron 45 + electron-builder 26 (Windows NSIS)
- Pollinations.ai text API (Live mode only, no key)
- No backend. No analytics. No telemetry.

## Testing

```powershell
npx tsc --noEmit   # type check
npm run build      # production build (single-file)
npm run electron:build # Windows installer
```

CI: GitHub Actions for typecheck + build on push/PR (coming).

## Configuration

| Variable | Use |
|---|---|
| `VITE_DEV_SERVER_URL` | Electron dev shortcut |
| Seed (UI) | Deterministic replay — same seed = same match start |

Live LLM throttles to 3.2s between calls, 11s timeout, auto-fallback to local.

## Development

```powershell
npm install
npm run dev            # Vite dev server
npm run electron:dev   # Vite + Electron (needs concurrently/wait-on)
npm run electron:pack  # Windows unpacked build
```

Path alias: `@/*` → `src/*`. `tsconfig` strict, `noUnusedLocals` on.

## Building

**Web**

```powershell
npm run build
```

**Windows EXE**

```powershell
npm run electron:build
# → release/Signal Arena Setup 1.0.0.exe
```

Icons: default Electron icon (custom PNG/SVG — see `docs/architecture.md`).

## Troubleshooting

- **Blank page** — Check console for module errors; ensure `npm install` completed.
- **Live LLM empty** — Pollinations anonymous tier is rate-limited. Wait 45s or use Local Neural.
- **No voice** — Enable voice toggle on start screen; check browser autoplay policy (click required).
- **Installer blocked by SmartScreen** — Unsigned build. Click *More info* → *Run anyway*.

## Roadmap

- [ ] Playwright screenshot set (gameplay/HUD/comms)
- [ ] GitHub Actions: typecheck + build + release asset
- [ ] Custom PNG icon set (256×256)
- [ ] Export match replays (JSON)
- [ ] Plugin games (custom GameInstance)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome for games, models, voices, and docs.

Security issues: see [SECURITY.md](SECURITY.md) — report privately, no issues on open tracker until fixed.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Built with React, Vite, Tailwind, Electron. Live mode powered by Pollinations.ai community API. No affiliation with OpenAI, Mistral, DeepSeek, Google, Anthropic, xAI, or any model vendor — names are used for roster identification in this parody/simulation context.

## Contact

- Issues: [GitHub Issues](https://github.com/Nortaq-PlayNexus/signal-arena/issues)
- Releases: [GitHub Releases](https://github.com/Nortaq-PlayNexus/signal-arena/releases)

---

**Crouton** — AI Model Test Bench. *Done.*
