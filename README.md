# ZZZ Server Tool

Web-based config builder for ZZZ private servers. Agents, W-Engines, Drive Discs, Endgames, and `config.zon` export.

## Features

- **Agents** — Select agents, set level/talents/awakening, export avatar_overrides
- **Weapons** — Browse W-Engines, adjust level/refinement
- **Discs** — Add Drive Discs by ID or catalog, customize main/sub stats
- **Endgames** — Pick Shiyu Defense / Deadly Assault zones
- **Server** — Import/Export JSON, Export config.zon, Save/Restart server

## Usage

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
npm run dev       # → http://localhost:5173
```

### Build

```bash
npm run build     # output in build/
```

