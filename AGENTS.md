# Agent Notes

## Long-Running Terminal Blank Screen

Important: Claudex previously entered a blank renderer window after being open for a long time with Workbench or project Terminal sessions running. This is not reliably testable with a short smoke test.

If this issue appears again, start from:

- `docs/runbooks/terminal-renderer-blank-screen.md`

Before restarting the app, capture the visible state, terminal usage pattern, app uptime, sleep/wake history, and the newest `~/Library/Logs/DiagnosticReports/*Claudex*` crash reports. The key areas to inspect are renderer recovery logs, `node-pty`/native crash frames, terminal lifecycle cleanup, STT subscriptions, and stale async routed-view updates.
