# Terminal Renderer Blank Screen Runbook

## Purpose

This runbook records the long-running blank-screen issue observed in Claudex and the recovery work added in PR #2. The failure was not reliably reproducible in a short test window. Keep this document as the first reference if the app becomes blank again after being open for a long time.

## Symptom

- Claudex stays open as a window, but the entire renderer becomes blank.
- The blank state appears after long-running use, not immediately after launch.
- The recurring user pattern was Workbench or project Terminal usage over a long period, often with long-lived terminal processes such as Claude, tmux, SSH, or continuous terminal output.
- Restarting the app may temporarily recover the UI.

## Why This Is Hard To Test

The issue is time-dependent. It likely requires a combination of long-lived terminal sessions, renderer-side event subscriptions, native PTY state, route changes, and delayed async callbacks. A short boot test or a few navigation cycles can catch syntax and obvious lifecycle errors, but it cannot prove that the app will remain healthy after many hours.

For that reason, PR #2 focuses on:

- preventing known lifecycle leaks and async races,
- recovering the BrowserWindow when the renderer process exits,
- adding a source verification harness,
- documenting what to inspect if the issue recurs.

## Evidence Collected Before The Fix

Local macOS crash reports pointed at renderer and terminal-adjacent failures:

- `Claudex Helper (Renderer)-2026-05-09-133426.ips`
  - Renderer process exited with `EXC_BREAKPOINT / SIGTRAP` after a long session.
- `Claudex-2026-05-07-230148.ips`
  - Main process crash involved native Node/N-API frames and `node-pty`.

The app did not previously handle `render-process-gone` or `unresponsive`, so a renderer crash could leave a visible but blank BrowserWindow.

## Fixed Areas In PR #2

### Main Process Recovery

File: `src/main/main.js`

- Handles `webContents` `render-process-gone`.
- Recovers non-clean renderer exits by reloading the window.
- Tracks repeated renderer crashes and shows a local recovery page instead of looping forever.
- Logs `unresponsive` renderer events.
- Keeps recovery mode stable if the BrowserWindow is recreated while recovery is active.

### STT Subscription Cleanup

File: `src/renderer/utils/stt-service.js`

- Replaced single callback slots with listener sets.
- `onStateChange()` and `onTranscribed()` return unsubscribe functions.
- Listener callback errors are isolated so one stale or broken callback cannot break notification delivery.

### TerminalPanel Lifecycle

File: `src/renderer/components/terminal/TerminalPanel.js`

- Tracks `_destroyed` state.
- Cleans STT subscriptions, resize observer, router handlers, xterm instances, wrappers, and backend terminals.
- Uses a single panel-level resize observer.
- Guards async local/SSH terminal creation after destroy.
- Closes late-created backend terminals if destroy wins the race.
- Guards delayed `runClaude` and SSH startup input against closed/destroyed tabs.
- Marks closing tabs synchronously and removes tabs by object identity after backend close.
- Catches backend close and `runClaude` invoke rejections.

### Workbench Lifecycle

File: `src/renderer/components/terminal/MultiTerminalView.js`

- Workbench remains persistent across normal navigation.
- Tracks `_destroyed` for future/app shutdown cleanup.
- Cleans STT subscriptions and document click listeners.
- Guards async local/SSH terminal creation after destroy.
- Closes late-created backend terminals if destroy wins the race.
- Guards delayed tmux/startup input against destroyed, removed, or closing cells.
- Marks closing cells synchronously and removes cells by object identity after backend close.

### Routed View Ownership

File: `src/renderer/app.js`

- Tracks `currentViewInstance`.
- Calls `destroyCurrentView()` during navigation.
- Keeps `MultiTerminalView` persistent and intentionally outside routed view destruction.
- Adds navigation-token guards for async routed loaders.
- Remote docs/PDF opens now await Workbench creation before adding a Workbench cell.

### ProjectDetail Ownership

File: `src/renderer/components/project/ProjectDetail.js`

- Owns tab component instances.
- Destroys non-terminal tab components when switching away.
- Caches project-detail terminal only while the ProjectDetail page is alive.
- Destroys the cached project terminal when ProjectDetail is destroyed.
- Uses render generation tokens so stale async tab renders cannot append duplicate components after rapid tab switching.
- Guards overview activity loading with the same stale-render protection.

### Verification Harness

File: `scripts/verify-terminal-crash-recovery.mjs`

This is a static/source-level guard for the lifecycle patterns above. It does not replace long-running manual verification.

Run:

```bash
node scripts/verify-terminal-crash-recovery.mjs
node --check src/main/main.js
node --check src/renderer/app.js
node --check src/renderer/components/project/ProjectDetail.js
node --check src/renderer/components/terminal/TerminalPanel.js
node --check src/renderer/components/terminal/MultiTerminalView.js
node --check src/renderer/utils/stt-service.js
```

## Expected Behavior After PR #2

- A renderer crash should no longer leave a permanent unexplained blank window.
- For isolated renderer exits, the BrowserWindow should reload.
- For repeated renderer exits in a short window, Claudex should show the local recovery page.
- Workbench terminals should survive normal navigation.
- ProjectDetail terminals should be closed when leaving ProjectDetail.
- STT and terminal UI callbacks should not keep writing into detached DOM.

## If The Blank Screen Happens Again

Capture evidence before restarting if possible.

### 1. Record The Visible State

- Is the window completely blank or is the recovery page visible?
- Did it happen while Workbench was open, ProjectDetail Terminal was open, SSH was connected, or Claude/tmux was running?
- Was the app idle for hours, or actively producing terminal output?
- Approximate app uptime and sleep/wake history.

### 2. Check macOS Crash Reports

Run:

```bash
ls -lt ~/Library/Logs/DiagnosticReports/*Claudex* 2>/dev/null | head -20
ls -lt ~/Library/Logs/DiagnosticReports/*Electron* 2>/dev/null | head -20
```

Open the newest relevant `.ips` files and record:

- process name,
- exception type,
- signal,
- crashed thread,
- whether frames mention `node-pty`, N-API, Electron, or GPU/Renderer.

### 3. Check Main Process Logs

If launched from terminal or dev mode, look for:

```text
[renderer-recovery] Renderer process gone:
[renderer-recovery] Renderer became unresponsive
[renderer-recovery] Failed to show recovery page
Terminal backend close failed
Workbench delayed startup input failed
Terminal Run Claude failed
```

The most important fields are renderer `reason` and `exitCode`.

### 4. Reproduce With A Long-Run Stress Session

Use Workbench and run:

```bash
while true; do
  date
  printf 'claudex terminal stress line %s\n' "$(date +%s)"
  sleep 0.2
done
```

Then periodically perform:

```text
Dashboard -> Project Detail -> Terminal tab -> Workbench -> Dashboard
```

Also test:

- creating and closing Workbench terminals,
- opening and leaving ProjectDetail Terminal,
- SSH terminal startup commands,
- Run Claude button in an existing terminal,
- app sleep/wake if that matches the original failure pattern.

### 5. Decide Which Failure Class It Is

Use this table:

| Observation | Likely Class | Next Action |
| --- | --- | --- |
| Recovery page appears | Renderer is still crashing repeatedly | inspect recovery reason/exit code and newest `.ips` |
| Window reloads and continues | Renderer crash recovered | inspect logs and identify trigger |
| Blank window with no recovery page | recovery handler failed or main process hung | inspect main process `.ips` and launch from terminal |
| App quits entirely | main process/native crash | inspect `Claudex-*.ips`, especially `node-pty` frames |
| UI works but terminal cells stop responding | backend terminal/router cleanup issue | inspect terminal manager logs and router lifecycle |

## Manual Verification Gap

PR #2 was verified with static checks, syntax checks, code review, and a successful macOS build/install. It was not proven by a multi-hour or overnight run. The next meaningful validation should be an overnight Workbench stress run with terminal output and periodic navigation.

## Useful Commands

Build and install current branch:

```bash
npm ci
npm run build:mac
rm -rf /Applications/Claudex.app
ditto dist/mac-arm64/Claudex.app /Applications/Claudex.app
codesign --verify --deep --strict --verbose=2 /Applications/Claudex.app
```

Verify source guards:

```bash
node scripts/verify-terminal-crash-recovery.mjs
git diff --check
```

Check PR branch status:

```bash
git status --short --branch
git log --oneline origin/master..HEAD
```

## 2026-05-16: bloom-forge OOM via eager file walk

Two renderer crashes (`EXC_BREAKPOINT` on `CrRendererMain`, JIT-frame crash stack) at 16:05:56 and 16:15:55 were traced to `files:list` returning a 37K-entry recursive nested tree for `bloom-forge` (`.venv-tts` was not in the main-process exclusion set). Every `chokidar` change inside the project triggered a full re-walk + IPC + sidebar re-render, growing the JS heap to OOM.

Fixed by replacing `files:list` with a single-level `files:listDir` and refreshing only the affected folder on `watcher:change` (commits `39ea186`..`023bd75` on branch `lazy-tree-2026-05-16`).
