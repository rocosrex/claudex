# Terminal Renderer Crash Recovery Design

## Context

Claudex can enter a severe blank-screen state after long-running use. The observed pattern is consistent: the app is used with Workbench or project Terminal tabs open, often running Claude, tmux, or another long-lived terminal process. Local crash artifacts support this diagnosis:

- `Claudex Helper (Renderer)-2026-05-09-133426.ips` shows the renderer process exited with `EXC_BREAKPOINT / SIGTRAP` after a long session.
- `Claudex-2026-05-07-230148.ips` shows a main-process crash involving native Node/N-API frames and `node-pty`.
- `src/main/main.js` does not currently handle `render-process-gone`, `unresponsive`, or related recovery events, so a renderer crash can leave the BrowserWindow visible but blank.

## Problem Statement

The app must not remain as an unrecoverable blank window after long-running terminal use. Terminal-related resources must be cleaned up when their owning view is left or destroyed, and renderer crashes must be detected and recovered or shown as an explicit recovery state.

## Goals

- Build a fast feedback loop that stresses long-running terminal usage and captures renderer/main-process failures.
- Clean up renderer-side component lifecycles so detached views do not keep terminals, observers, timers, or callbacks alive unintentionally.
- Add main-process recovery for renderer crashes to prevent a permanent blank screen.
- Keep the implementation narrow and compatible with the current vanilla JS/Electron architecture.

## Non-Goals

- Replacing `node-pty` or xterm.js.
- Reworking the whole router or introducing a framework.
- Changing the existing Workbench UX.
- Touching the unrelated pending `Sidebar.js` user change.

## Approach

Use the combined approach approved in brainstorming: reproduce and instrument the terminal failure path, fix lifecycle leaks, and add crash recovery. This addresses both likely root cause and user-visible failure mode.

## Diagnosis Loop

Create an agent-runnable stress scenario:

1. Launch the Electron app in development mode.
2. Open Workbench or a project Terminal tab.
3. Run a sustained-output command and optionally launch tmux/Claude.
4. Repeatedly switch between dashboard, project detail, terminal tab, and Workbench.
5. Create and close terminal sessions repeatedly.
6. Record renderer console errors, `render-process-gone` events, terminal counts, router handler counts, observer counts, and memory trend.

The loop succeeds only if it can detect the specific blank-screen failure or prove that renderer crashes are now recovered.

## Renderer Lifecycle Design

`App` should own the currently mounted view instance. When navigating away, it should call `destroy()` on the active view if that method exists before removing DOM nodes.

`ProjectDetail` should become an explicit lifecycle owner for tab components:

- Keep references to created tab components.
- Call `destroy()` on active or cached tab components when the page is destroyed.
- Continue to cache terminal tab DOM only while the project detail page itself is alive.

`TimeTracker` already exposes `destroy()`, but it is not called by `ProjectDetail`. The new ownership path should make its interval cleanup effective.

`TerminalPanel` should have one clear cleanup path:

- `terminalRouter.unregister(termId)`
- `window.api.terminal.close(termId)`
- `term.dispose()`
- wrapper DOM removal
- observer disconnect when the panel is destroyed

Avoid creating one `ResizeObserver` per terminal session without tracking and disconnecting each one. Prefer a panel-level observer that fits the active tab or all tabs as needed.

`MultiTerminalView` is intentionally persistent across app navigation. It should keep that behavior, but its callbacks must not target destroyed DOM if the view is ever destroyed. It should remain the long-lived owner of its cells until explicit close or app shutdown.

## STT Subscription Design

`sttService` currently stores single callback slots for transcription and state changes. Add unsubscribe support so components can remove their callback on destroy. The initial implementation can remain simple, but each registering component must receive a cleanup function and call it from `destroy()`.

This prevents stale UI handlers from writing into detached DOM and makes ownership explicit.

## Main Process Crash Recovery

Add `webContents` handlers during BrowserWindow creation:

- `render-process-gone`: log `reason` and `exitCode`, then recover.
- `unresponsive`: log the event and avoid immediate destructive recovery.
- Optional console forwarding in development for faster diagnosis.

Recovery policy:

- For `crashed`, `oom`, or `killed`, reload the same window.
- Guard against reload loops by tracking recent crash timestamps.
- If repeated crashes happen within a short window, stop auto-reload and show a local recovery page or minimal HTML recovery state.
- The recovery state should tell the user the renderer crashed and that restarting the app is recommended.

This ensures a crash does not leave an unexplained blank screen.

## Error Handling

Renderer lifecycle cleanup should tolerate already-closed terminals and disposed DOM. Cleanup methods should be idempotent so repeated navigation or tab close operations do not throw.

Main-process recovery logging should not crash if the BrowserWindow is already destroyed. `terminal:input`, `terminal:resize`, and `terminal:close` should continue treating missing terminals as harmless.

## Testing And Verification

Use a narrow verification set:

- Static check: no syntax errors in modified renderer and main-process modules.
- Lifecycle check: navigate away from project detail after opening timer and terminal tabs; verify their cleanup paths run.
- Terminal stress check: sustained terminal output with repeated view switches does not produce blank screen.
- Crash recovery check: simulate renderer termination and verify the window reloads or shows the recovery state instead of staying blank.
- Regression check: Workbench remains persistent across navigation and existing terminal cells continue working.

## Files Expected To Change

- `src/main/main.js`
- `src/renderer/app.js`
- `src/renderer/components/project/ProjectDetail.js`
- `src/renderer/components/terminal/TerminalPanel.js`
- `src/renderer/components/terminal/MultiTerminalView.js`
- `src/renderer/utils/stt-service.js`

Optional:

- `scripts/terminal-stress-check.*` or another lightweight verification script if it materially improves the feedback loop.

## Risks

- Over-cleaning could close terminals users expect to remain alive. Workbench must stay persistent; project-detail terminals should live only with their project detail page.
- Auto-reload could hide crash details if logging is insufficient. Recovery logs must include reason and exit code.
- Native `node-pty` crashes may still occur after renderer cleanup. Crash recovery mitigates the blank screen, while logs guide any later native-terminal fix.

## Acceptance Criteria

- A renderer crash no longer leaves a permanent blank app window.
- Leaving project detail reliably destroys owned tab components.
- Terminal sessions are closed or preserved according to their owner: project detail closes on page destroy, Workbench persists across navigation.
- STT UI callbacks are unsubscribed when terminal components are destroyed.
- The stress scenario can run without unbounded handler/observer growth.
