---
name: run-claudex
description: Launch and drive the Claudex Electron desktop app on macOS via a Playwright REPL driver — click UI, open context menus, screenshot, read toasts. Use when asked to run or start Claudex, screenshot its window, verify a renderer/UI change actually works, or interact with its sidebar, dashboard, kanban, or terminal panels.
---

# Running Claudex

Electron 33 app, macOS, real display — **no xvfb, no `--no-sandbox`** (those are
Linux-container concerns and are wrong here). Drive it through
`driver.mjs`, a Playwright `_electron` REPL.

## STOP — quit Claudex.app first

`main.js` has **no `requestSingleInstanceLock()`**, and dev + packaged builds
share one userData dir (`build.productName` is nested under `build`, so dev
resolves to lowercase `claudex`, and APFS is case-insensitive → same folder).
Both open `~/Library/Application Support/claudex/claudex.db`.

```bash
ps aux | grep -i "Claudex.app" | grep -v grep     # must be empty
osascript -e 'quit app "Claudex"'                 # if not
```

Two instances won't corrupt the DB (SQLite WAL locks across processes), but
neither sees the other's writes, so a stale UI will overwrite real data.

## The DB is real user data

The driver drives the user's actual projects. `mi "Delete Project"` really
deletes; `mi "Open New Terminal"` and Claude Code buttons really spawn
Terminal.app windows. Prefer read-only commands; get consent before
destructive ones.

## Setup

```bash
cd <repo root>
npm install --no-save playwright-core   # not a project dep; --no-save keeps package.json clean
```

## Run

Batch mode — **use this by default** (there is no `tmux` on this machine, and
piping into the interactive REPL races because readline doesn't await async
handlers):

```bash
printf 'launch\nprojects\nrc 0\nmenu\nss menu\n' | node .claude/skills/run-claudex/driver.mjs --batch
```

Interactive: `node .claude/skills/run-claudex/driver.mjs`

Screenshots → `/tmp/claudex-shots/` (override `SCREENSHOT_DIR`).
**Open the PNG and look at it** — a blank frame means launch failed.

### Commands

| command | what it does |
|---|---|
| `launch` | launch, wait for `.sidebar-project-item` (not a blind sleep) |
| `projects` | list sidebar project rows with indices |
| `rc <n>` | right-click project row n → opens context menu |
| `menu` | dump the open context menu's items |
| `mi <text>` | click menu item containing text — **really executes it** |
| `ss [name]` | screenshot → `/tmp/claudex-shots/<name>.png` |
| `click <sel>` / `wait <sel>` / `text [sel]` / `eval <js>` | generic DOM |
| `toast` / `sleep <ms>` / `windows` / `quit` | misc |

### Selectors that matter

`.sidebar-project-item` · `.sidebar-context-menu` · `.sidebar-context-menu-item` · `.toast`

## Gotchas

- **`window.api.*` cannot be stubbed.** `contextBridge.exposeInMainWorld`
  objects are frozen; assigning over `window.api.terminal.openExternal`
  fails *silently* — the spy records nothing while the real IPC fires. To
  observe without side effects, assert on the resulting toast/DOM instead.
- **Use `.toast`, not `[class*="toast"]`.** The latter also matches the
  parent `.toast-container`, reporting every message twice.
- **SSH projects** (`ssh_host` set) hide path-dependent menu items. `rc` a
  local project when testing those; `projects` output marks SSH rows.
- Native modules (`node-pty`, `better-sqlite3`) are prebuilt for Electron's
  ABI — launch via the bundled Electron binary, never plain `node`.

## Tests

```bash
npm test                                                    # unit tests (node --test), no app launch
node .claude/skills/run-claudex/selection-copy-test.mjs     # Option+drag selection survives + Cmd+C
node .claude/skills/run-claudex/tui-copy-test.mjs           # TUI-owned drag: OSC 52, Cmd+C, out-of-bounds, Mouse toggle
```

`npm test` covers the pure helpers in `terminal-clipboard.js` and
`terminal-mouse-mode.js` (mouse-report parsing, drag range, OSC 52, the `Cmd+C`
matcher, the reporting guard) and needs no display.

Both `.mjs` tests drive the real app and read the system clipboard back with
`pbpaste`; each exits 0 only when every check passes and drops screenshots in
`/tmp/claudex-shots/`.

- **`selection-copy-test.mjs`** — a real Option+drag, a button-less mouse move
  and a real `Cmd+C` against a stand-in TUI that re-arms any-motion mouse
  tracking every second, proving the highlight survives and the text copies.
- **`tui-copy-test.mjs`** — the case where the TUI selects the text itself
  (Claude Code's fullscreen mode): a plain drag then `Cmd+C`, an OSC 52 write
  from the pty, a drag that leaves the terminal, and the **🖱 Mouse** toolbar
  toggle turning reporting off so plain drag selects in xterm. Uses `fake-tui.py`,
  which logs the mouse reports it receives so the out-of-bounds check can assert
  the release landed at the last in-bounds cell rather than the clamped edge.

**Run these after touching `terminal-clipboard.js`, `terminal-mouse-mode.js`,
`terminal-themes.js` (`macOptionClickForcesSelection`) or any terminal key
handler.** An isolated xterm harness is not a substitute and has already passed
these bugs: `Cmd+C` arrives as a bare `Meta` keydown *then* `c`, and only
Playwright's real input reproduces that ordering, trusted events, and modifier
state.

## Human path

`npm start` — opens a window, no automation hooks. Quit Claudex.app first.
