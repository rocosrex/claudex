# Changelog

All notable changes to Claudex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.10.1] - 2026-03-04

### Added
- STT voice toggle button in Workbench view

## [1.10.0] - 2026-03-03

### Added
- Speaker recognition (voice ID) for STT using sherpa-onnx-node embeddings
- Speaker enrollment modal with voice sample recording UI
- Speaker identification displayed in STT indicator pill
- Speaker management section in terminal settings
- Background speaker processing via worker thread

## [1.9.0] - 2026-03-03

### Added
- Terminal voice input (STT) with PgDn double-tap toggle
- VAD (Voice Activity Detection) for hands-free continuous dictation
- Floating pill indicator showing STT state (listening/recording/transcribing)
- Mic toggle button in TerminalPanel toolbar
- Noise filtering: RMS threshold, minimum recording duration, minimum text length

## [1.8.0] - 2026-03-03

### Added
- SSH remote file access via SFTP (browse, open, edit, save remote files)
- Remote file manager with connection pooling and 5-min idle auto-disconnect
- SSH connection test button in project settings
- Remote path browser after successful SSH connection test
- Lazy-loading remote directory tree in sidebar
- SSH badge on remote projects in sidebar
- Project delete functionality (sidebar context menu + project detail header)
- Resizable dividers between Workbench cells
- SSH terminal support in project detail Terminal tab

### Changed
- Workbench cells use flex layout with drag-to-resize dividers (replaced CSS Grid)
- SSH terminals no longer auto-start tmux (Windows compatibility)
- Remote files always open in Workbench editor cells (not standalone DocsEditorView)
- File icons: `.md` files use 📄, `.txt` files use 🗒️
- Folder toggle icon changed to `›` with brighter color for visibility

### Fixed
- Remote file save error (ENOENT) when using standalone docs editor
- SSH file tree not displaying (recursive traversal too slow over network)
- Sidebar search filter not working (missing store listener)
- Dotfile filter too aggressive in remote file listing

## [1.7.0] - 2026-03-03

### Changed
- Renamed "Terminal" to "Workbench" throughout the app
- Polished editor cell UI in Workbench grid

### Fixed
- PDF.js viewer rendering issues

## [1.6.0] - 2026-03-03

### Added
- Editor cells in Multi Terminal (Workbench) grid — open and edit code files inline
- PDF viewer cells in Multi Terminal grid — render PDFs alongside terminals

## [1.5.0] - 2026-03-03

### Added
- Terminal theme settings with 8 macOS-style presets (Default Dark, Solarized, Monokai, Dracula, Nord, One Dark, Gruvbox, Tokyo Night)
- Persistent sidebar width across sessions via localStorage

## [1.4.0] - 2026-03-03

### Added
- Auto-update UI with download progress and 3-second countdown restart
- Docs editor for project documentation files
- All UI text localized to English

### Changed
- Split README into English (default) and Korean versions

## [1.3.0] - 2026-03-03

### Added
- Auto-update support via electron-updater
- README.md with project overview and setup instructions

### Changed
- Improved .gitignore for better security (exclude credentials, build artifacts)

## [1.0.0] - 2026-03-02

### Added
- Initial release of Claudex
- Project dashboard with status filters, search, and statistics cards
- Todo checklist with priority levels (low/medium/high/urgent)
- Ideas & notes with markdown support, types, tags, and pinning
- Kanban board with drag-and-drop stage management
- Time tracker with start/stop timer and daily/weekly statistics
- Activity log timeline
- Embedded xterm.js terminal with tab management
- Claude Code launcher (run Claude in project directory)
- External Terminal.app integration
- Dark theme UI (Slate + Indigo)
- SQLite database with WAL mode
- macOS native titlebar (hiddenInset)
