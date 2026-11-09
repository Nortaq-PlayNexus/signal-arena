# Contributing to Signal Arena

## Code of Conduct

Be respectful, constructive, and inclusive. This is a parody/simulation sandbox — model personalities are fictional gameplay elements, not statements about real companies.

## How to Contribute

1. Fork the repo
2. Create a feature branch: `feat/your-feature` or `fix/bug-name`
3. Make changes, ensure `npx tsc --noEmit && npm run build` passes
4. Write clear commit messages (`feat:`, `fix:`, `docs:`, `refactor:`)
5. Open a PR with description, screenshots, and test evidence

## Development Setup

```powershell
git clone https://github.com/Nortaq-PlayNexus/signal-arena.git
cd signal-arena
npm install
npm run dev
```

## Adding a Game

1. Implement `GameInstance` in `src/games/yourgame.ts` (see `pellet.ts`)
2. Register in `src/games/index.ts`
3. Add features vector (14 dims) in `options()`
4. Add screenshot to `docs/screenshots/`

## Adding a Model to Roster

Edit `src/core/roster.ts` and persona in `src/core/mind.ts` (`PERSONA`).

## Pull Request Template

Use `.github/PULL_REQUEST_TEMPLATE.md`
