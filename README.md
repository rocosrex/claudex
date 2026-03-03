# Claudex

[![한국어](https://img.shields.io/badge/lang-한국어-blue)](README.ko.md)

A desktop application that combines development project management with a Claude Code launcher.

Manage multiple development projects through a GUI and launch Claude Code with a single click.

![Platform](https://img.shields.io/badge/platform-macOS-blue)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Project Dashboard** — Project list with status filters, search, and stats cards
- **Todo Checklist** — Per-project TODOs with priority levels (low/medium/high/urgent) and file attachments
- **Notes** — Markdown notes with type classification, tags, and pin support
- **Kanban Board** — Drag-and-drop projects through backlog → in_progress → review → done
- **Time Tracking** — Per-project timer with daily/weekly statistics
- **Integrated Terminal** — Embedded xterm.js terminal with SSH support
- **Claude Code Launcher** — Launch `claude` in any project directory with one click
- **Auto Update** — Automatic updates via GitHub Releases

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33 |
| Frontend | Vanilla JS + Web Components |
| CSS | Tailwind CSS (CDN) + Custom CSS Variables |
| Terminal | xterm.js 5.5 + node-pty |
| Database | better-sqlite3 (SQLite WAL mode) |
| Auto Update | electron-updater + GitHub Releases |

## Getting Started

### Prerequisites

- macOS
- Node.js 20+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (optional, for terminal launcher)

### Setup

```bash
git clone https://github.com/rocosrex/claudex.git
cd claudex
chmod +x setup.sh && ./setup.sh
```

Or manually:

```bash
npm install
npx electron-rebuild
```

### Run

```bash
# Production mode
npm start

# Development mode (with DevTools & hot reload)
npm run dev
```

### Build

```bash
# macOS build (dmg + zip)
npm run build:mac

# Build + publish to GitHub Releases
GH_TOKEN=$(gh auth token) npm run publish
```

## Screenshots

> TODO: Screenshots coming soon

## Roadmap

| Phase | Platform | Status |
|-------|----------|--------|
| **Phase 1** | macOS Desktop (Electron) | In Progress |
| **Phase 2** | iOS / Android (Flutter) | Planned |
| **Phase 3** | Desktop ↔ Mobile Real-time Sync | Planned |

## License

MIT
