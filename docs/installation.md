# Installation

## Windows EXE

Download from Releases: `Signal Arena Setup 1.0.0.exe`
Run, launch from Start Menu. Per-user install.

SHA256: `0C0AF697B6F27572BFE863FC58FA34BB28347AC23043A8D276D331B6BB43A8EE`

## Web Dev

```powershell
git clone https://github.com/Nortaq-PlayNexus/signal-arena.git
cd signal-arena
npm install
npm run dev
# http://localhost:5173
```

## Production Build

```powershell
npm install
npm run build
# dist/index.html — self-contained
```

## Electron Dev

```powershell
npm run electron:dev
```
