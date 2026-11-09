# Architecture

## Engine

`src/core/engine.ts` — deterministic RNG (mulberry32), feature length 14, weights for MLP. `MLP` class: prior vector normalisation so tanh stays responsive. `pick()` does argmax + exploration.

## Mind System

`src/core/mind.ts` — `Persona` (aggression, patience, verbosity, smugness, warmth, voice, style), `Bank` verb banks per style (needling/clipped/technical/deadpan/flowing), beliefs (14 strings, 4 sampled per model deterministically), attitudes (rival/threat/victim/nobody), grudges, heat/tilt/momentum. Commentary composed: `open + fact + belief + closer` — no repeats within 34 lines.

## Live LLM

`src/core/llm.ts` — POST to `https://text.pollinations.ai/openai`, fallback GET to `https://text.pollinations.ai/{prompt}`. Throttle 3200ms, timeout 11s, AbortController. Model list via `GET /models`. `parseMove` extracts `MOVE n` or falls back to first integer in range. Failure → local neural.

## Games

All implement `GameInstance` (`src/games/base.ts`): `update`, `draw`, `options` (returns `Option{label,feat[14]}`), `describe`, `scores`, `alive`, `isOver`, `hud`, `human`, `reset(seed)`. Stage loop: requestAnimationFrame, `dt` capped, feeds actions from either MLP (`pick`) or LLM (`parseMove`).

## UI

StartScreen (setup) ↔ Stage (canvas + HUD + comms). `StartScreen.tsx` handles roster selection, engine toggle, mode picker, remote model fetch, season load. `Stage.tsx` runs game loop, FX (shake/burst/flash via `fx.ts`), textures (`textures.ts`), audio (`audio.ts`), voice (`voice.ts`).

## Packaging

Web: `vite-plugin-singlefile` → `dist/index.html` (1.7 MB). Electron: `electron/main.cjs` BrowserWindow loads `dist/index.html`. Builder: NSIS installer → `release/Signal Arena Setup 1.0.0.exe`. Default Electron icon today; custom PNG planned.

## Persistence

`scores.ts` / `season.ts` — localStorage `sa_scores` / `sa_season`, JSON, no backend.
