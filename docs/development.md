# Development

- Node.js 18+, npm 9+
- Path alias `@/*` → `src/*`
- TypeScript strict, `noUnusedLocals` + `noUnusedParameters`

```powershell
npm install
npm run dev            # Vite
npm run electron:dev   # Vite + Electron
npx tsc --noEmit       # typecheck
npm run build          # web build
npm run electron:build # Windows NSIS
```

## Structure

See [architecture.md](architecture.md).
