# Changelog

All notable changes to Claudex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.10.10] - 2026-09-01

### Added
- `.claude/skills/run-claudex/selection-copy-test.mjs` — an internal developer regression test (not an end-user feature) that drives the running app through Playwright with a real ⌥ Option+drag, a real mouse move and a real `Cmd+C`, then reads the system clipboard back with `pbpaste`. An isolated xterm harness passed this bug twice while the real app still failed, so terminal selection changes are verified against the shipping app from now on

### Fixed
- The selection highlight disappeared roughly once a second while a TUI such as Claude Code was running, even though `Cmd+C` copied the right text after 1.10.9. xterm.js answers a mouse-mode re-arm with `SelectionService.disable()`, which clears the selection outright — so the copy was correct while the screen insisted nothing was selected. That re-arm cannot be intercepted from outside xterm, so terminals now remember the selection's range as well as its text and re-apply it whenever the selection disappears with no user action behind it. ⌥ Option+drag selections stay visible until you actually click or type. Restoration is skipped when the terminal content scrolled underneath the selection, since the stored coordinates would then point at different cells; `Cmd+C` still copies from the text snapshot in that case

## [1.10.9] - 2026-09-01

### Fixed
- `Cmd+C` still silently did nothing when copying Claude Code's output, even after the 1.10.8 fix — pasting kept returning stale clipboard content. 1.10.8 closed only one of the three ways xterm.js 5.5.0 destroys a selection; the two remaining ones are specific to any-motion mouse tracking (`DECSET ?1003`), which Claude Code turns on at startup. First, every button-less mouse move becomes a pty report and xterm clears the selection on any user input, so the pointer twitching as you release an ⌥ Option+drag was enough to lose it. Second, re-emitting an already-active mouse mode fires xterm's `onProtocolChange` unconditionally, which disables the selection service outright — and Claude Code re-emits the whole `?1000/?1002/?1003/?1006` block on every click, resize and large paste, so the selection died with no user action at all. Terminals now swallow button-less mouse moves while a selection is held, and `Cmd+C` falls back to a snapshot of the last selection when the live one has already been wiped. Applies to the Workbench grid and `TerminalPanel` (local and SSH). One visible limitation remains: when a TUI re-arms mouse tracking the highlight disappears, but `Cmd+C` still copies the right text
- Verified in the real app with Playwright rather than an isolated harness — `master` failed with no clipboard write at all, the fix passes 3/3. The previous harness could not reproduce the failure because `Cmd+C` arrives as a bare `Meta` keydown *followed by* `c`, and only the real key sequence exposed the snapshot being discarded one event before the copy asked for it

## [1.10.8] - 2026-08-19

### Fixed
- Copying with `Cmd+C` intermittently did nothing while Claude Code, tmux or vim was running — pasting then yielded stale clipboard content, which made it look like "only Claude's output won't copy". Root cause: xterm.js clears the active selection whenever data flagged as user input reaches the pty; with mouse tracking on, a trackpad wheel tick becomes an SGR mouse report, and in the alt buffer it becomes arrow-key sequences, so macOS momentum-scroll ticks landing between mouse-up and `Cmd+C` silently wiped the selection. Terminals now swallow wheel events while a selection is held — only in the states where the wheel would turn into pty input, so local scrollback scrolling is unaffected — and `Cmd+C` writes the selection to the clipboard directly instead of relying on the focus-sensitive native copy-event chain. Applies to the Workbench grid and `TerminalPanel` (local and SSH). Verified with an isolated Electron + xterm harness (bug reproduced 9/9 unpatched, 10/10 fixed) and an in-app E2E pass; a content matrix confirmed Korean (NFC/NFD), emoji, box drawing, OSC 8 links and wrapped lines all copy intact

## [1.10.7] - 2026-07-19

### Added
- Right-click a project row in the sidebar and choose "Open New Terminal" to open macOS Terminal.app already `cd`-ed into that project's folder. `claude` is not launched automatically. The item is hidden for projects without a local path (e.g. SSH-only entries), and a toast reports failures
- `.claude/skills/run-claudex/` — an internal developer skill (not an end-user feature) that launches and drives the app through Playwright's `_electron` API for UI interaction and screenshots

### Fixed
- Selecting text with the mouse and copying it with `Cmd+C` did nothing while a TUI such as Claude Code, vim or tmux was running in the terminal. Those programs enable xterm mouse tracking (DECSET `?1000`/`?1002`/`?1006`), so xterm.js forwards drags to the application instead of building a local selection — correct terminal behaviour, but the standard macOS escape hatch was shut: xterm gates Option+drag behind `macOptionClickForcesSelection`, which defaults to `false` and was never set. **Hold ⌥ Option while dragging** to select inside a TUI. Plain drag still goes to the TUI, so Claude Code's click and scroll handling is unchanged. Fixed in the shared `buildTerminalOptions()`, so it applies to `TerminalPanel` (local and SSH) and `MultiTerminalView` alike

## [1.10.6] - 2026-05-19

### Added
- Drag-and-drop files or folders from Finder onto a terminal pane to insert their shell-quoted absolute paths at the prompt (matches macOS Terminal.app / iTerm2 behaviour). Works in both the single `TerminalPanel` and `MultiTerminalView` grid cells; non-file drags (e.g. cell-swap titlebar drag) continue to work unchanged

## [1.10.5] - 2026-05-16

### Added
- Renderer crash diagnostics — crash details (exit code, uptime, terminal count, last heartbeat age) are now written to `~/Library/Logs/claudex/` for post-mortem analysis
- Periodic heartbeat from renderer to main process tracks renderer liveness

### Changed
- Sidebar file tree is now lazy-loaded — folder children are fetched on expand instead of walking the entire project tree up front; large projects (e.g. those with `.venv`, `node_modules`, or thousands of files) no longer freeze the renderer on first expand
- File watcher events refresh only the affected directory instead of reloading the whole project tree
- Excluded path rules (dot-named directories, `node_modules`, `dist`, `build`, `out`, `__pycache__`, `coverage`) are now shared between the file watcher and the directory loader — no more inconsistencies between what is watched and what is shown

### Fixed
- Symlinked directories are now correctly treated as directories in the sidebar tree
- Selecting a tree item and then deleting its parent directory no longer leaves a stale selection
- Refreshed directories that are now empty show an `(empty)` placeholder instead of silently collapsing
- Stale cache entries for deleted directories are evicted from descendant paths

## [1.10.4] - 2026-03-07

### Added
- Right-click context menu on projects, folders, and files in sidebar
  - Create Markdown File, New File, New Folder on projects and folders
  - Rename and Delete on files and folders
- Inline rename with Enter key for selected files/folders (Finder-style)
- `files:createDir` and `files:delete` backend IPC handlers
- Modal-based file/folder name input (replaces unsupported `window.prompt`)

### Changed
- Translated kanban board UI from Korean to English (In Progress, Review, Done, etc.)
- Made project path input editable in ProjectForm

## [1.10.3] - 2026-03-05

### Added
- Project drag & drop reorder in sidebar with insertion line indicator
- File tree internal drag & drop — move files/folders between directories
- File move support for both local (fs.rename) and SSH (sftp.rename)
- Finder file drop onto project root node

### Fixed
- Finder file drag & drop now works correctly using webUtils.getPathForFile

## [1.10.2] - 2026-03-05

### Added
- File system watcher (chokidar) — auto-refreshes sidebar file tree on local changes
- Finder drag & drop — drop files onto sidebar folders to copy (local) or upload (SSH/SFTP)
- Context menu "Refresh" option for project file trees
- Drag-over visual feedback CSS for drop targets

### Changed
- Translated 70+ Korean UI strings to English across 9 files (database, STT, sidebar, project, terminal)

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
