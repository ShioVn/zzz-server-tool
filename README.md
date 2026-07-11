# ZZZ Server Tool

Web-based config builder for ZZZ private servers. Agents, W-Engines, Drive Discs, Endgames, and server config import.

## Features

- **Agents** — Select agents, set level/talents/awakening, export avatar\_overrides
- **Weapons** — Browse W-Engines, adjust level/refinement
- **Discs** — Add Drive Discs by ID or catalog, customize main/sub stats
- **Endgames** — Pick Shiyu Defense / Deadly Assault zones
- **Server** — Import config to private server, save/restart server

## Quick Start (standalone EXE)

1. Download `zzz-server-tool.exe` from Releases
2. Double-click — browser opens at `http://localhost:3000`
3. Set server path, pick agents/weapons/discs, click **Import Config**

> No Node.js required. Windows 64-bit only.

## Usage (from source)

### Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Working Remielle](https://git.xeondev.com/remielle/remielle)

### Quick start

```bash
setup.bat        # Windows — auto-installs Node.js + runs npm install
```

Or manually:

```bash
npm install
npm run dev       # → http://localhost:5173 (dev mode with hot reload)
```

### Production build

```bash
npm run build
npm run preview   # → http://localhost:3000
```

\n
