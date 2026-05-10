# Terminal Renderer Crash Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent long-running terminal sessions from leaving Claudex as a permanent blank window by cleaning terminal lifecycles and adding renderer crash recovery.

**Architecture:** Keep Workbench persistent across navigation, but make project-detail tabs owned by `ProjectDetail` and destroyed when that page is left. Add renderer crash recovery in the Electron main process, and use small source-based verification checks because this repository has no test framework.

**Tech Stack:** Electron 33, vanilla JavaScript ES modules in the renderer, CommonJS in the main process, xterm.js, node-pty, shell verification with Node.

---

## File Structure

- Modify: `src/main/main.js`
  - Owns BrowserWindow creation and renderer crash recovery.
- Modify: `src/renderer/app.js`
  - Owns top-level SPA view lifecycle and keeps Workbench persistent.
- Modify: `src/renderer/components/project/ProjectDetail.js`
  - Owns project-detail tab components and destroys them when leaving the page.
- Modify: `src/renderer/components/terminal/TerminalPanel.js`
  - Owns project-detail and bottom-panel terminal sessions, resize observer, xterm disposal, and STT subscriptions.
- Modify: `src/renderer/components/terminal/MultiTerminalView.js`
  - Owns persistent Workbench cells and STT subscriptions.
- Modify: `src/renderer/utils/stt-service.js`
  - Owns STT callback subscription and unsubscription.
- Create: `scripts/verify-terminal-crash-recovery.mjs`
  - Lightweight source verification used by each task.

Do not modify `src/renderer/components/common/Sidebar.js`; it already has unrelated user changes in the working tree.

---

### Task 1: Add Verification Harness

**Files:**
- Create: `scripts/verify-terminal-crash-recovery.mjs`

- [ ] **Step 1: Create the verification harness**

Create `scripts/verify-terminal-crash-recovery.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolutePath), `${relativePath} must exist`);
  return fs.readFileSync(absolutePath, 'utf8');
}

const files = [
  'src/main/main.js',
  'src/renderer/app.js',
  'src/renderer/components/project/ProjectDetail.js',
  'src/renderer/components/terminal/TerminalPanel.js',
  'src/renderer/components/terminal/MultiTerminalView.js',
  'src/renderer/utils/stt-service.js',
];

for (const file of files) {
  const source = read(file);
  assert.ok(source.length > 0, `${file} must not be empty`);
}

console.log('terminal crash recovery verification harness is ready');
```

- [ ] **Step 2: Run the harness**

Run:

```bash
node scripts/verify-terminal-crash-recovery.mjs
```

Expected:

```text
terminal crash recovery verification harness is ready
```

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-terminal-crash-recovery.mjs
git commit -m "test: add terminal crash recovery verification harness"
```

---

### Task 2: Add Main-Process Renderer Crash Recovery

**Files:**
- Modify: `scripts/verify-terminal-crash-recovery.mjs`
- Modify: `src/main/main.js`

- [ ] **Step 1: Extend the harness with main-process checks**

Replace `scripts/verify-terminal-crash-recovery.mjs` with:

```js
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolutePath), `${relativePath} must exist`);
  return fs.readFileSync(absolutePath, 'utf8');
}

function contains(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

const main = read('src/main/main.js');

contains(main, 'render-process-gone', 'main process must detect renderer exits');
contains(main, 'unresponsive', 'main process must log unresponsive renderers');
contains(main, 'rendererCrashTimestamps', 'main process must track recent renderer crashes');
contains(main, 'showRendererRecoveryPage', 'main process must have a recovery page path');
contains(main, 'attachWindowRecoveryHandlers(mainWindow)', 'BrowserWindow must attach recovery handlers');

console.log('terminal crash recovery verification passed');
```

- [ ] **Step 2: Run the harness and verify it fails**

Run:

```bash
node scripts/verify-terminal-crash-recovery.mjs
```

Expected: FAIL with this assertion message:

```text
main process must detect renderer exits
```

- [ ] **Step 3: Add recovery helpers to `src/main/main.js`**

Insert after `let mainWindow = null;`:

```js
const RENDERER_CRASH_WINDOW_MS = 30_000;
const RENDERER_CRASH_LIMIT = 3;
let rendererCrashTimestamps = [];

function rendererRecoveryHtml(reason, exitCode) {
  const safeReason = String(reason || 'unknown');
  const safeExitCode = exitCode === undefined ? 'unknown' : String(exitCode);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Claudex Recovery</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 560px;
      padding: 32px;
      text-align: center;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 22px;
    }
    p {
      margin: 8px 0;
      color: #94a3b8;
      line-height: 1.5;
    }
    code {
      color: #c4b5fd;
    }
  </style>
</head>
<body>
  <main>
    <h1>Claudex renderer crashed</h1>
    <p>The app stopped reloading because the renderer crashed repeatedly.</p>
    <p>Restart Claudex to continue. The last reason was <code>${safeReason}</code> with exit code <code>${safeExitCode}</code>.</p>
  </main>
</body>
</html>`;
}

function showRendererRecoveryPage(win, details) {
  if (!win || win.isDestroyed()) return;
  const html = rendererRecoveryHtml(details?.reason, details?.exitCode);
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err) => {
    console.error('[renderer-recovery] Failed to show recovery page:', err.message);
  });
}

function recoverRenderer(win, details) {
  if (!win || win.isDestroyed()) return;

  const now = Date.now();
  rendererCrashTimestamps = rendererCrashTimestamps
    .filter((timestamp) => now - timestamp < RENDERER_CRASH_WINDOW_MS);
  rendererCrashTimestamps.push(now);

  console.error('[renderer-recovery] Renderer process gone:', details);

  if (rendererCrashTimestamps.length >= RENDERER_CRASH_LIMIT) {
    showRendererRecoveryPage(win, details);
    return;
  }

  setTimeout(() => {
    if (!win.isDestroyed()) {
      win.reload();
    }
  }, 500);
}

function attachWindowRecoveryHandlers(win) {
  win.webContents.on('render-process-gone', (_event, details) => {
    const reason = details?.reason || 'unknown';
    if (['crashed', 'oom', 'killed', 'integrity-failure'].includes(reason)) {
      recoverRenderer(win, details);
      return;
    }
    console.warn('[renderer-recovery] Renderer exited without auto-reload:', details);
  });

  win.webContents.on('unresponsive', () => {
    console.warn('[renderer-recovery] Renderer became unresponsive');
  });

  if (process.env.NODE_ENV === 'development') {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
  }
}
```

- [ ] **Step 4: Attach recovery handlers during window creation**

In `createWindow()`, immediately before `mainWindow.loadFile(...)`, add:

```js
  attachWindowRecoveryHandlers(mainWindow);
```

The section should read:

```js
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath);
  }

  attachWindowRecoveryHandlers(mainWindow);
  mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));
```

- [ ] **Step 5: Run verification**

Run:

```bash
node --check src/main/main.js
node scripts/verify-terminal-crash-recovery.mjs
```

Expected:

```text
terminal crash recovery verification passed
```

- [ ] **Step 6: Commit**

```bash
git add src/main/main.js scripts/verify-terminal-crash-recovery.mjs
git commit -m "fix: recover from renderer crashes"
```

---

### Task 3: Add STT Unsubscribe Support

**Files:**
- Modify: `scripts/verify-terminal-crash-recovery.mjs`
- Modify: `src/renderer/utils/stt-service.js`

- [ ] **Step 1: Extend the harness with STT service checks**

Update `scripts/verify-terminal-crash-recovery.mjs` so it includes these checks after the existing `main` checks:

```js
const stt = read('src/renderer/utils/stt-service.js');

contains(stt, '_transcribedListeners = new Set()', 'STT service must keep transcribed listeners in a Set');
contains(stt, '_stateListeners = new Set()', 'STT service must keep state listeners in a Set');
contains(stt, 'return () => this._transcribedListeners.delete(callback)', 'STT transcribed subscriptions must be removable');
contains(stt, 'return () => this._stateListeners.delete(callback)', 'STT state subscriptions must be removable');
contains(stt, 'for (const callback of [...this._stateListeners])', 'STT service must notify all state listeners safely');
contains(stt, 'for (const callback of [...this._transcribedListeners])', 'STT service must notify all transcription listeners safely');
```

- [ ] **Step 2: Run the harness and verify it fails**

Run:

```bash
node scripts/verify-terminal-crash-recovery.mjs
```

Expected: FAIL with this assertion message:

```text
STT service must keep transcribed listeners in a Set
```

- [ ] **Step 3: Replace single callback fields in `stt-service.js`**

In the constructor, replace:

```js
    // Callbacks
    this._onTranscribed = null;
    this._onStateChange = null;
```

with:

```js
    // Callbacks
    this._transcribedListeners = new Set();
    this._stateListeners = new Set();
```

- [ ] **Step 4: Replace subscription methods and state notification**

Replace `onTranscribed`, `onStateChange`, and `_setState` with:

```js
  onTranscribed(callback) {
    this._transcribedListeners.add(callback);
    return () => this._transcribedListeners.delete(callback);
  }

  onStateChange(callback) {
    this._stateListeners.add(callback);
    callback(this.state);
    return () => this._stateListeners.delete(callback);
  }

  _setState(newState) {
    this.state = newState;
    for (const callback of [...this._stateListeners]) {
      try {
        callback(newState);
      } catch (e) {
        console.error('STT state listener failed:', e);
      }
    }
  }
```

- [ ] **Step 5: Replace transcription notification**

In `_processRecording()`, replace:

```js
      if (text.length >= this.minTextLength && this._onTranscribed) {
        this._onTranscribed(text);
      }
```

with:

```js
      if (text.length >= this.minTextLength) {
        for (const callback of [...this._transcribedListeners]) {
          try {
            callback(text);
          } catch (e) {
            console.error('STT transcription listener failed:', e);
          }
        }
      }
```

- [ ] **Step 6: Run verification**

Run:

```bash
node --check src/renderer/utils/stt-service.js
node scripts/verify-terminal-crash-recovery.mjs
```

Expected:

```text
terminal crash recovery verification passed
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/utils/stt-service.js scripts/verify-terminal-crash-recovery.mjs
git commit -m "fix: make STT subscriptions removable"
```

---

### Task 4: Clean Terminal Component Subscriptions And Resize Observers

**Files:**
- Modify: `scripts/verify-terminal-crash-recovery.mjs`
- Modify: `src/renderer/components/terminal/TerminalPanel.js`
- Modify: `src/renderer/components/terminal/MultiTerminalView.js`

- [ ] **Step 1: Extend the harness with terminal component checks**

Update `scripts/verify-terminal-crash-recovery.mjs` so it includes these checks after the STT checks:

```js
const terminalPanel = read('src/renderer/components/terminal/TerminalPanel.js');
const multiTerminal = read('src/renderer/components/terminal/MultiTerminalView.js');

contains(terminalPanel, 'this._destroyed = false', 'TerminalPanel must track destroy state');
contains(terminalPanel, 'this._unsubscribeSttState = null', 'TerminalPanel must store STT state unsubscribe');
contains(terminalPanel, 'this._unsubscribeSttTranscribed = null', 'TerminalPanel must store STT transcription unsubscribe');
contains(terminalPanel, 'setupResizeObserver()', 'TerminalPanel must centralize resize observer setup');
contains(terminalPanel, 'fitActiveTab()', 'TerminalPanel must fit terminals through one active-tab helper');
contains(terminalPanel, 'if (this._destroyed) return', 'TerminalPanel destroy must be idempotent');
contains(terminalPanel, 'this._unsubscribeSttState?.()', 'TerminalPanel must unsubscribe STT state listener');
contains(terminalPanel, 'this._unsubscribeSttTranscribed?.()', 'TerminalPanel must unsubscribe STT transcription listener');

contains(multiTerminal, 'this._unsubscribeSttState = null', 'Workbench must store STT state unsubscribe');
contains(multiTerminal, 'this._unsubscribeSttTranscribed = null', 'Workbench must store STT transcription unsubscribe');
contains(multiTerminal, 'this._onDocumentClick = null', 'Workbench must store document click cleanup');
contains(multiTerminal, 'this._unsubscribeSttState?.()', 'Workbench must unsubscribe STT state listener');
contains(multiTerminal, 'this._unsubscribeSttTranscribed?.()', 'Workbench must unsubscribe STT transcription listener');
contains(multiTerminal, "document.removeEventListener('click', this._onDocumentClick)", 'Workbench must remove document click listener on destroy');
```

- [ ] **Step 2: Run the harness and verify it fails**

Run:

```bash
node scripts/verify-terminal-crash-recovery.mjs
```

Expected: FAIL with this assertion message:

```text
TerminalPanel must track destroy state
```

- [ ] **Step 3: Update `TerminalPanel` constructor**

In `src/renderer/components/terminal/TerminalPanel.js`, add these fields at the end of the constructor:

```js
    this.resizeObserver = null;
    this._destroyed = false;
    this._unsubscribeSttState = null;
    this._unsubscribeSttTranscribed = null;
```

- [ ] **Step 4: Add centralized fit helpers to `TerminalPanel`**

Insert before `// --- Terminal creation ---`:

```js
  setupResizeObserver() {
    if (this.resizeObserver) return;
    const termContainer = this.container.querySelector('.terminal-container');
    this.resizeObserver = new ResizeObserver(() => this.fitActiveTab());
    this.resizeObserver.observe(termContainer);
  }

  fitTab(tab) {
    if (!tab) return;
    try {
      tab.fitAddon.fit();
      const dims = tab.fitAddon.proposeDimensions();
      if (dims && dims.cols > 0 && dims.rows > 0) {
        window.api.terminal.resize(tab.termId, dims.cols, dims.rows);
      }
    } catch (e) {
      // Ignore fit errors from detached or hidden terminals.
    }
  }

  fitActiveTab() {
    this.fitTab(this.tabs[this.activeTabIndex]);
  }
```

- [ ] **Step 5: Replace per-terminal resize observer creation**

In `createTerminalSession()`, replace the `// Resize handling` block from `this.resizeObserver = new ResizeObserver...` through `this.resizeObserver.observe(termContainer);` with:

```js
    this.setupResizeObserver();
```

In `createSSHSession()`, replace the `if (!this.resizeObserver) { ... }` resize observer block with:

```js
    this.setupResizeObserver();
```

- [ ] **Step 6: Store STT unsubscribe functions in `TerminalPanel`**

In `setupSTT()`, replace:

```js
    sttService.onStateChange((state) => {
```

with:

```js
    this._unsubscribeSttState = sttService.onStateChange((state) => {
```

Then replace:

```js
    sttService.onTranscribed((text) => {
```

with:

```js
    this._unsubscribeSttTranscribed = sttService.onTranscribed((text) => {
```

- [ ] **Step 7: Make `TerminalPanel.destroy()` idempotent**

Replace `destroy()` with:

```js
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._onSettingsChanged) store.off('terminal-settings-changed', this._onSettingsChanged);
    this._unsubscribeSttState?.();
    this._unsubscribeSttTranscribed?.();
    this._unsubscribeSttState = null;
    this._unsubscribeSttTranscribed = null;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.sttIndicator) {
      this.sttIndicator.destroy();
      this.sttIndicator = null;
    }

    for (const tab of [...this.tabs]) {
      terminalRouter.unregister(tab.termId);
      window.api.terminal.close(tab.termId);
      tab.term.dispose();
      if (tab.wrapper.parentNode) tab.wrapper.parentNode.removeChild(tab.wrapper);
    }
    this.tabs = [];
    this.termId = null;
    this.terminal = null;
    this.fitAddon = null;
  }
```

- [ ] **Step 8: Update `MultiTerminalView` constructor and document click cleanup**

In the constructor, add:

```js
    this._unsubscribeSttState = null;
    this._unsubscribeSttTranscribed = null;
    this._onDocumentClick = null;
```

In `setupDropdown()`, replace:

```js
    document.addEventListener('click', () => {
      menu.style.display = 'none';
    });
```

with:

```js
    this._onDocumentClick = () => {
      if (this.container && this.container.isConnected) {
        menu.style.display = 'none';
      }
    };
    document.addEventListener('click', this._onDocumentClick);
```

- [ ] **Step 9: Store STT unsubscribe functions in `MultiTerminalView`**

In `setupSTT()`, replace:

```js
    sttService.onStateChange((state) => {
```

with:

```js
    this._unsubscribeSttState = sttService.onStateChange((state) => {
```

Then replace:

```js
    sttService.onTranscribed((text) => {
```

with:

```js
    this._unsubscribeSttTranscribed = sttService.onTranscribed((text) => {
```

- [ ] **Step 10: Expand `MultiTerminalView.destroy()` cleanup**

At the start of `destroy()`, after the settings listener cleanup, add:

```js
    this._unsubscribeSttState?.();
    this._unsubscribeSttTranscribed?.();
    this._unsubscribeSttState = null;
    this._unsubscribeSttTranscribed = null;

    if (this._onDocumentClick) {
      document.removeEventListener('click', this._onDocumentClick);
      this._onDocumentClick = null;
    }
```

- [ ] **Step 11: Run verification**

Run:

```bash
node --check src/renderer/components/terminal/TerminalPanel.js
node --check src/renderer/components/terminal/MultiTerminalView.js
node scripts/verify-terminal-crash-recovery.mjs
```

Expected:

```text
terminal crash recovery verification passed
```

- [ ] **Step 12: Commit**

```bash
git add src/renderer/components/terminal/TerminalPanel.js src/renderer/components/terminal/MultiTerminalView.js scripts/verify-terminal-crash-recovery.mjs
git commit -m "fix: clean terminal UI subscriptions"
```

---

### Task 5: Add App And ProjectDetail Lifecycle Ownership

**Files:**
- Modify: `scripts/verify-terminal-crash-recovery.mjs`
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/components/project/ProjectDetail.js`

- [ ] **Step 1: Extend the harness with lifecycle checks**

Update `scripts/verify-terminal-crash-recovery.mjs` so it includes these checks after the terminal component checks:

```js
const app = read('src/renderer/app.js');
const projectDetail = read('src/renderer/components/project/ProjectDetail.js');

contains(app, 'this.currentViewInstance = null', 'App must track the current mounted view');
contains(app, 'destroyCurrentView()', 'App must centralize current view destruction');
contains(app, 'this.currentViewInstance?.destroy', 'App must call destroy on current view instances');
contains(app, 'this.currentViewInstance = detail', 'App must own ProjectDetail instances');
contains(app, 'this.currentViewInstance = dashboard', 'App must own DashboardView instances');
contains(app, 'this.currentViewInstance = null; // Workbench is intentionally persistent', 'Workbench must remain persistent across navigation');

contains(projectDetail, 'this._tabComponents = new Map()', 'ProjectDetail must track tab component instances');
contains(projectDetail, 'this._destroyed = false', 'ProjectDetail must track destroy state');
contains(projectDetail, '_destroyTabComponent(tabId)', 'ProjectDetail must destroy tab components');
contains(projectDetail, 'this._tabComponents.set(tabId, component)', 'ProjectDetail must store tab components');
contains(projectDetail, 'destroy() {', 'ProjectDetail must expose destroy');
contains(projectDetail, 'this._terminalPanel.destroy()', 'ProjectDetail must destroy cached terminal panel');
```

- [ ] **Step 2: Run the harness and verify it fails**

Run:

```bash
node scripts/verify-terminal-crash-recovery.mjs
```

Expected: FAIL with this assertion message:

```text
App must track the current mounted view
```

- [ ] **Step 3: Add current view ownership to `App`**

In the `App` constructor, after `this.multiTerminalView = null;`, add:

```js
    this.currentViewInstance = null;
```

Add this method before `navigate(view, params = {})`:

```js
  destroyCurrentView() {
    if (this.currentViewInstance?.destroy) {
      try {
        this.currentViewInstance.destroy();
      } catch (e) {
        console.error('Failed to destroy current view:', e);
      }
    }
    this.currentViewInstance = null;
    this.currentDocsEditor = null;
    this.currentSTT = null;
  }
```

- [ ] **Step 4: Use `destroyCurrentView()` during navigation**

In `navigate(view, params = {})`, replace the separate docs/STT destroy blocks:

```js
    // Destroy docs editor on navigation away
    if (this.currentDocsEditor) {
      this.currentDocsEditor.destroy();
      this.currentDocsEditor = null;
    }

    // Destroy STT recorder on navigation away
    if (this.currentSTT) {
      this.currentSTT.destroy();
      this.currentSTT = null;
    }
```

with:

```js
    this.destroyCurrentView();
```

- [ ] **Step 5: Set current view instances in `navigate()`**

In the `dashboard` case, after `dashboard.onNavigate = ...`, add:

```js
        this.currentViewInstance = dashboard;
```

In the `project-detail` case, after `detail.onNavigate = ...`, add:

```js
        this.currentViewInstance = detail;
```

In the `terminal` case, before `this.loadMultiTerminal();`, add:

```js
        this.currentViewInstance = null; // Workbench is intentionally persistent
```

In the default case, after `dashboard.onNavigate = ...`, add:

```js
        this.currentViewInstance = dashboard;
```

- [ ] **Step 6: Set async view ownership in loader methods**

In `loadDocsEditor(params)`, after `this.currentDocsEditor = editor;`, add:

```js
      this.currentViewInstance = editor;
```

In `loadSTT()`, after `this.currentSTT = new STTRecorder();`, add:

```js
      this.currentViewInstance = this.currentSTT;
```

In `loadKanban()`, after `kanban.onNavigate = ...`, add:

```js
      this.currentViewInstance = kanban;
```

- [ ] **Step 7: Add lifecycle fields to `ProjectDetail`**

In the `ProjectDetail` constructor, add:

```js
    this._tabComponents = new Map();
    this._terminalPanel = null;
    this._terminalEl = null;
    this._destroyed = false;
```

- [ ] **Step 8: Guard async project loading**

Update the start of `loadProject()` so it begins with this guard:

```js
  async loadProject() {
    if (this._destroyed) return;
```

Inside the `if (!this.project)` block, immediately after `const allProjects = await window.api.projects.list();`, add:

```js
      if (this._destroyed) return;
```

The top of `loadProject()` should read:

```js
  async loadProject() {
    if (this._destroyed) return;
    try {
      const projects = store.getState().projects;
      this.project = projects.find(p => p.id === this.projectId);

      if (!this.project) {
        const allProjects = await window.api.projects.list();
        if (this._destroyed) return;
        store.setState({ projects: allProjects });
        this.project = allProjects.find(p => p.id === this.projectId);
      }
```

- [ ] **Step 9: Add tab component cleanup helpers to `ProjectDetail`**

Insert before `showTab(tabId)`:

```js
  _destroyTabComponent(tabId) {
    const component = this._tabComponents.get(tabId);
    if (!component) return;
    if (component.destroy) {
      try {
        component.destroy();
      } catch (e) {
        console.error(`Failed to destroy ${tabId} tab:`, e);
      }
    }
    this._tabComponents.delete(tabId);
  }

  _destroyAllTabComponents() {
    for (const tabId of [...this._tabComponents.keys()]) {
      this._destroyTabComponent(tabId);
    }
  }
```

- [ ] **Step 10: Destroy non-terminal tab components when switching tabs**

At the start of `showTab(tabId)`, before `this.activeTab = tabId;`, add:

```js
    const previousTab = this.activeTab;
    if (previousTab && previousTab !== tabId && previousTab !== 'terminal') {
      this._destroyTabComponent(previousTab);
    }
```

Keep terminal cached across tab switches, and destroy it only when `ProjectDetail.destroy()` runs.

- [ ] **Step 11: Store dynamically loaded tab components**

In `renderTabPlaceholder()`, after `container.appendChild(component.render());`, add:

```js
        this._tabComponents.set(tabId, component);
```

- [ ] **Step 12: Add `ProjectDetail.destroy()`**

Before `statusLabel(status)`, add:

```js
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    this._destroyAllTabComponents();

    if (this._terminalPanel) {
      this._terminalPanel.destroy();
      this._terminalPanel = null;
    }
    if (this._terminalEl?.parentNode) {
      this._terminalEl.parentNode.removeChild(this._terminalEl);
    }
    this._terminalEl = null;
    this.container = null;
  }
```

- [ ] **Step 13: Run verification**

Run:

```bash
node --check src/renderer/app.js
node --check src/renderer/components/project/ProjectDetail.js
node scripts/verify-terminal-crash-recovery.mjs
```

Expected:

```text
terminal crash recovery verification passed
```

- [ ] **Step 14: Commit**

```bash
git add src/renderer/app.js src/renderer/components/project/ProjectDetail.js scripts/verify-terminal-crash-recovery.mjs
git commit -m "fix: destroy routed view lifecycles"
```

---

### Task 6: Run App-Level Stress Verification

**Files:**
- Modify only if a defect is found during this task.

- [ ] **Step 1: Confirm the working tree before manual verification**

Run:

```bash
git status --short
```

Expected: only the pre-existing user change is allowed:

```text
 M src/renderer/components/common/Sidebar.js
```

- [ ] **Step 2: Run static verification**

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

Expected:

```text
terminal crash recovery verification passed
```

- [ ] **Step 3: Start the app**

Run:

```bash
npm run dev
```

Expected: Electron launches Claudex without syntax or module import errors.

- [ ] **Step 4: Exercise terminal stress path**

In Workbench, create a blank terminal and run:

```bash
while true; do date; printf 'claudex terminal stress line %s\n' "$(date +%s)"; sleep 0.2; done
```

Then perform this sequence ten times:

```text
Dashboard -> Project Detail -> Terminal tab -> Workbench -> Dashboard
```

Expected:

```text
The app stays visible, terminal output continues, and no permanent blank screen appears.
```

- [ ] **Step 5: Verify project-detail terminal cleanup**

Open a project detail page, open the Terminal tab, create one terminal, then navigate back to Dashboard.

Expected in the main-process logs:

```text
No repeated terminal:data routing errors.
No renderer-process-gone event during normal navigation.
```

Expected in the UI:

```text
Dashboard is visible after navigation.
Workbench terminals remain available when returning to Workbench.
The project-detail terminal is closed when the project-detail page is left.
```

- [ ] **Step 6: Verify renderer recovery manually**

Open DevTools for the renderer from the Electron app menu or by temporarily enabling `mainWindow.webContents.openDevTools()` in development, then terminate the renderer process from DevTools or macOS Activity Monitor.

Expected:

```text
The main process logs [renderer-recovery] Renderer process gone.
The BrowserWindow reloads instead of staying blank.
If the renderer is killed three times within 30 seconds, the recovery page appears.
```

Remove any temporary DevTools change before committing.

- [ ] **Step 7: Commit only if verification required fixes**

If Task 6 required code changes, commit those files:

```bash
git add src/main/main.js src/renderer/app.js src/renderer/components/project/ProjectDetail.js src/renderer/components/terminal/TerminalPanel.js src/renderer/components/terminal/MultiTerminalView.js src/renderer/utils/stt-service.js scripts/verify-terminal-crash-recovery.mjs
git commit -m "fix: stabilize terminal crash recovery"
```

If no code changed, do not create an empty commit.

---

## Final Verification

Run:

```bash
git status --short
node scripts/verify-terminal-crash-recovery.mjs
node --check src/main/main.js
node --check src/renderer/app.js
node --check src/renderer/components/project/ProjectDetail.js
node --check src/renderer/components/terminal/TerminalPanel.js
node --check src/renderer/components/terminal/MultiTerminalView.js
node --check src/renderer/utils/stt-service.js
```

Expected:

```text
terminal crash recovery verification passed
```

`git status --short` may still show the unrelated pre-existing `src/renderer/components/common/Sidebar.js` user change. Do not stage or revert it.

## Implementation Notes

- Keep Workbench persistent by not assigning `multiTerminalView` as the routed `currentViewInstance`.
- Keep project-detail terminal cached only while its `ProjectDetail` instance exists.
- Cleanup methods must be idempotent because close buttons, navigation, and process shutdown can overlap.
- If native `node-pty` crashes continue after this work, use the new renderer recovery logs to isolate main-process terminal-manager races in a separate fix.
