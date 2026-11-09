# Changelog

All notable changes to Signal Arena will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - 2026-11-10

### Added
- Initial professional release
- Four games: Pellet, Stack, Circuit, Brawl
- 12-model roster with personas, voices, beliefs, grudges
- Local Neural MLP agent (14→4→1 tanh, deterministic)
- Live LLM mode via Pollinations (keyless, throttled, fallback)
- Season + score persistence
- 5 match modes (Standard, Turbo, Blitz, Marathon, Overclock)
- Human pilot takeover
- Windows EXE installer (Electron NSIS)
- Start-screen screenshot + full README
- MIT license, security policy, contributing guide

### Fixed
- Removed unused vars/null handling in `src/core/mind.ts` (address param, unused method)
- Package renamed `react-vite-tailwind` → `signal-arena`, v1.0.0
- Added repo metadata, gitignore, Electron packaging config
