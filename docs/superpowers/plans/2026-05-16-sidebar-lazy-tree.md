# Sidebar Lazy File-Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eager recursive file walk that backs the Sidebar project tree with a single-level lazy loader, eliminating the V8 OOM crashes that happen when a large project (e.g. `bloom-forge`, ~37K walkable files / 1.5GB `.venv-tts`) is expanded and then mutated by a running script.

**Architecture:** Today `files:list` returns a fully recursive nested tree (`walkProjectFiles`) and the Sidebar holds the entire tree in `filesCache`; every chokidar `watcher:change` event triggers a full re-walk and a sidebar re-render. The new design adds a single-level `files:listDir(dirPath)` IPC mirroring the existing remote-folder lazy pattern (`Sidebar.js:1006-1023`), changes `toggleProjectTree` and folder expand to fetch only one level, and narrows `watcher:change` handling to refresh the specific parent directory of the changed file. `walkProjectFiles` / `files:list` become dead code and are removed. Exclusion rules (dotfiles + `.venv-tts`-style siblings) are extracted into a shared module so the file-watcher and the new walker stay in sync.

**Tech Stack:** Electron 33 (IPC via `contextBridge`), vanilla JS renderer, `chokidar` 5 file watcher, no test framework — verification is via standalone Node scripts and manual reproduction with `bloom-forge`.

**Context flags for the executor:**
- Working tree currently has uncommitted diagnostic changes (5 files, 135 lines: heartbeat, persistent crash log, "Add to Workbench" context menu). Those do **not** touch `walkProjectFiles` / `renderFileTree` / `refreshProjectTree` / `toggleProjectTree`. They DO touch `Sidebar.js` (different region — context menu around L296) and `app.js`. Resolve any merge by keeping both; flag if anything actually conflicts.
- No test framework. Do not add Jest/Mocha — add small standalone Node scripts under `scripts/verify/` and run them via `node scripts/verify/<name>.js`.
- The reproduction project is `/Users/rocos.rex/Projects/unitygame/bloom-forge` (Unity + Python). Crashes recorded at `~/Library/Logs/DiagnosticReports/Claudex Helper (Renderer)-2026-05-16-1{0556,1555}.ips`. `bloom-forge`'s id in `claudex.db` is `06acc49c-97e7-42f6-b027-99da4a6835f9`.

---

## File Structure

**New files:**
- `src/main/path-filters.js` — shared exclusion rules (dotfile regex + named-dir blacklist + helper `isExcluded(name)`). Used by both the new `files:listDir` handler and `file-watcher.js`.
- `scripts/verify/list-dir-perf.js` — standalone Node script that calls the new `listDir` logic against `bloom-forge` and asserts (a) no descent into `.venv-tts`, (b) round-trip under 100ms, (c) payload size under 50KB.

**Modified files:**
- `src/main/main.js` — add `files:listDir` IPC handler; delete `walkProjectFiles` and `files:list` handler; delete the local `EXCLUDED_DIRS` Set (now imported).
- `src/main/preload.js` — expose `files.listDir(dirPath)`; remove `files.list`.
- `src/main/file-watcher.js` — import shared filters; rewrite `ignored` glob to use the shared `isExcluded` predicate.
- `src/renderer/components/common/Sidebar.js` — drop `filesCache` of recursive trees, keep only per-directory caches; rewrite `toggleProjectTree` to fetch root-level only; rewrite `renderFileTree` so local folders lazy-load the same way remote ones already do (`L1006-1023`); rewrite `refreshProjectTree` → `refreshFolder(dirAbsPath)` that updates only the affected branch.

---

## Task 1 — Shared path-filter module

**Files:**
- Create: `src/main/path-filters.js`
- Test: `scripts/verify/path-filters.js`

- [ ] **Step 1: Write the verification script (failing)**

Create `scripts/verify/path-filters.js`:

```javascript
'use strict';
const assert = require('node:assert/strict');
const { isExcluded, EXCLUDED_NAMES } = require('../../src/main/path-filters');

// Named exclusions
for (const n of ['node_modules', '.git', '.venv', 'dist', 'build', '__pycache__']) {
  assert.equal(isExcluded(n), true, `${n} should be excluded`);
}

// Dotfile / dot-dir family (the bug class)
for (const n of ['.venv-tts', '.venv-prod', '.DS_Store', '.cache', '.idea', '.anything']) {
  assert.equal(isExcluded(n), true, `${n} should be excluded (dotfile rule)`);
}

// Allowed
for (const n of ['src', 'docs', 'remotion', 'output', 'README.md', 'gallery-config.json']) {
  assert.equal(isExcluded(n), false, `${n} should NOT be excluded`);
}

// EXCLUDED_NAMES sanity
assert.ok(EXCLUDED_NAMES instanceof Set);
assert.ok(EXCLUDED_NAMES.has('node_modules'));

console.log('path-filters: OK');
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node scripts/verify/path-filters.js
```

Expected: `Error: Cannot find module '.../src/main/path-filters'`

- [ ] **Step 3: Implement the module**

Create `src/main/path-filters.js`:

```javascript
'use strict';

// Heavy / generated directories we never want to enumerate or watch.
// Kept as a Set for O(1) name lookups by the project-tree walker.
const EXCLUDED_NAMES = new Set([
  'node_modules', 'dist', 'build', '.next', 'out',
  '__pycache__', 'coverage', '.nyc_output',
  '.cache', '.turbo',
]);

// Anything starting with '.' is treated as excluded. This catches the
// .venv / .venv-tts / .venv-* family, .git, .DS_Store, IDE folders, etc.
// in a single rule, keeping walker and chokidar consistent.
function isExcluded(name) {
  if (!name) return false;
  if (name.charCodeAt(0) === 46) return true; // '.'
  return EXCLUDED_NAMES.has(name);
}

module.exports = { isExcluded, EXCLUDED_NAMES };
```

- [ ] **Step 4: Run verification — should pass**

```bash
node scripts/verify/path-filters.js
```

Expected: `path-filters: OK`

- [ ] **Step 5: Commit**

```bash
git add src/main/path-filters.js scripts/verify/path-filters.js
git commit -m "feat(main): shared path-filter module for walker + watcher"
```

---

## Task 2 — `files:listDir` IPC handler (single-level)

**Files:**
- Modify: `src/main/main.js` (add new handler; keep `files:list` for now — removed in Task 5)
- Modify: `src/main/preload.js` (expose `files.listDir`)
- Test: `scripts/verify/list-dir-perf.js`

- [ ] **Step 1: Write the failing perf/correctness script**

Create `scripts/verify/list-dir-perf.js`:

```javascript
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

// Bypass Electron — exercise the pure function directly.
const { listDir } = require('../../src/main/files-list-dir');

const ROOT = '/Users/rocos.rex/Projects/unitygame/bloom-forge';

const t0 = Date.now();
const entries = listDir(ROOT);
const ms = Date.now() - t0;

console.log(`listDir returned ${entries.length} entries in ${ms}ms`);

// Smoke: under 100ms for a 1-level read, even on a 2.3GB project root.
assert.ok(ms < 100, `listDir took ${ms}ms (>100ms budget)`);

// Must not contain .venv-tts (excluded by dotfile rule)
assert.ok(!entries.some(e => e.name === '.venv-tts'),
  '.venv-tts must not appear in listDir output');

// Must contain at least the well-known visible entries.
for (const n of ['scripts', 'docs', 'gallery-config.json']) {
  assert.ok(entries.some(e => e.name === n), `expected to see ${n}`);
}

// Payload size guard: serialized < 50KB
const bytes = Buffer.byteLength(JSON.stringify(entries), 'utf8');
assert.ok(bytes < 50_000, `payload ${bytes}B exceeds 50KB`);
console.log(`payload ${bytes}B — OK`);

// Each entry shape: { name, absolutePath, isDirectory }
for (const e of entries) {
  assert.equal(typeof e.name, 'string');
  assert.equal(typeof e.absolutePath, 'string');
  assert.equal(typeof e.isDirectory, 'boolean');
  assert.equal(e.absolutePath, path.join(ROOT, e.name));
}
console.log('list-dir-perf: OK');
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node scripts/verify/list-dir-perf.js
```

Expected: `Error: Cannot find module '.../src/main/files-list-dir'`

- [ ] **Step 3: Implement `listDir` as a pure, requireable function**

Create `src/main/files-list-dir.js`:

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isExcluded } = require('./path-filters');

function listDir(dirPath) {
  if (!dirPath) return [];
  let items;
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const item of items) {
    if (isExcluded(item.name)) continue;
    out.push({
      name: item.name,
      absolutePath: path.join(dirPath, item.name),
      isDirectory: item.isDirectory(),
    });
  }

  out.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return out;
}

module.exports = { listDir };
```

- [ ] **Step 4: Run verification — should pass**

```bash
node scripts/verify/list-dir-perf.js
```

Expected output:
```
listDir returned <N> entries in <ms>ms
payload <bytes>B — OK
list-dir-perf: OK
```

- [ ] **Step 5: Wire the IPC handler in `main.js`**

In `src/main/main.js`, near the existing `ipcMain.handle('files:list', ...)` (around L476), add:

```javascript
const { listDir } = require('./files-list-dir');

ipcMain.handle('files:listDir', (_, dirPath) => {
  return listDir(dirPath);
});
```

Leave `files:list` / `walkProjectFiles` in place for now — they get removed in Task 5 once renderer no longer calls them.

- [ ] **Step 6: Expose it in `preload.js`**

In `src/main/preload.js`, inside the `files:` object (around L72), add:

```javascript
listDir: (dirPath) => ipcRenderer.invoke('files:listDir', dirPath),
```

- [ ] **Step 7: Commit**

```bash
git add src/main/files-list-dir.js src/main/main.js src/main/preload.js scripts/verify/list-dir-perf.js
git commit -m "feat(main): files:listDir single-level IPC handler"
```

---

## Task 3 — Sidebar uses `listDir` for the project root

**Files:**
- Modify: `src/renderer/components/common/Sidebar.js` — `toggleProjectTree`, drop `filesCache` recursive value, switch to per-directory `dirCache: Map<absPath, entries[]>`.

- [ ] **Step 1: Add a `dirCache` and helper for the lazy load**

In `Sidebar.js`, near the existing `this.filesCache = new Map();` declaration (L53), replace with:

```javascript
// Per-directory listings: Map<absolutePath, entries[]>
// (For local projects. Remote/SSH projects keep using the existing remote API.)
this.dirCache = new Map();
// Tracks which local project roots have been loaded at least once.
// Used to decide "show empty / show error / show entries".
this.loadedRoots = new Set();
```

(Search-and-replace `this.filesCache` everywhere in this file in subsequent steps — Task 4 finishes the migration.)

- [ ] **Step 2: Rewrite the local branch of `toggleProjectTree`**

Replace the local-project block in `toggleProjectTree` (around L937-952). Current code uses `window.api.files.list(projectPath)` and stores the full recursive tree in `this.filesCache`. New code:

```javascript
if (!this.dirCache.has(projectPath)) {
  try {
    if (isRemote) {
      // unchanged remote path — keep existing logic
      let remotePath = project.ssh_remote_path || '';
      if (!remotePath) {
        const homeDir = await window.api.remote.homeDir(projectId);
        remotePath = (homeDir && !homeDir.error) ? homeDir : '/';
      }
      const result = await window.api.remote.listFiles(projectId, remotePath);
      if (result && result.error) throw new Error(result.error);
      this.dirCache.set(projectPath, Array.isArray(result) ? result : []);
    } else {
      const entries = await window.api.files.listDir(projectPath);
      this.dirCache.set(projectPath, entries);
    }
    this.loadedRoots.add(projectId);
  } catch (e) {
    console.error('Failed to load project root:', e);
    this.dirCache.set(projectPath, []);
    this.loadedRoots.add(projectId);
    const errEl = document.createElement('div');
    errEl.className = 'sidebar-docs-tree';
    errEl.innerHTML = `<div class="sidebar-docs-item empty" style="padding-left:2rem;font-size:0.7rem;color:#f87171;">${isRemote ? 'SSH connection failed' : 'Error'}: ${e.message || 'Unknown'}</div>`;
    wrapper.appendChild(errEl);
    return;
  }
}
```

(Note: the remote shape from `remote.listFiles` already returns single-level entries — see the existing lazy branch at L1006-1023 — so this unifies the cache key by absolute path.)

- [ ] **Step 3: Update `renderProjects` to look up the new cache**

At Sidebar.js L793-795, replace:

```javascript
if (isExpanded && this.filesCache.has(p.id)) {
  // ...
  const treeEl = this.renderFileTree(this.filesCache.get(p.id), p.id, p.path, 0, isRemote);
```

with:

```javascript
if (isExpanded && this.dirCache.has(p.path || '__remote__')) {
  const rootEntries = this.dirCache.get(p.path || '__remote__');
  const treeEl = this.renderFileTree(rootEntries, p.id, p.path, 0, isRemote);
```

For SSH/remote projects (`p.path` is empty), key the cache by the literal `'__remote__'` plus project id, e.g. `__remote__:${p.id}` — adjust both writer and reader consistently. Pick one convention and apply it.

- [ ] **Step 4: Manual reproduction (positive case)**

```bash
npm start
```

In the running app:
1. Expand `bloom-forge` in the sidebar.
2. Confirm the root listing shows `scripts/`, `docs/`, `gallery-config.json`, etc.
3. Confirm `.venv-tts/`, `.venv/`, `.git/` are **not** visible.
4. Open DevTools (Cmd+Option+I) → Memory tab → take a heap snapshot. Note the JS heap size.

Expected: heap remains under ~80MB after expanding the project root. Previously the recursive walk pushed a 37K-entry nested object into renderer state.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/common/Sidebar.js
git commit -m "refactor(sidebar): load project root via files:listDir"
```

---

## Task 4 — Folder expansion + watcher refresh become per-directory

**Files:**
- Modify: `src/renderer/components/common/Sidebar.js` — `renderFileTree` (local-folder branch), `refreshProjectTree` → `refreshFolder`, watcher handler.

- [ ] **Step 1: Make local folder expansion lazy (mirror the remote branch)**

In `renderFileTree` (L978), the current local-folder behavior uses `f.children` that was pre-walked. Replace the local branch of folder-click (the `else` of `if (remote && childrenContainer ...)` at L1006) so that **local folders also lazy-load**:

```javascript
// Replace the unconditional "show children" branch with the same lazy
// load the remote branch does, keyed on absolutePath.
if (childrenContainer && childrenContainer.children.length === 0) {
  childrenContainer.innerHTML = '<div class="text-xs text-slate-500" style="padding-left:2rem;">Loading...</div>';
  childrenContainer.style.display = '';
  try {
    let children;
    if (remote) {
      const res = await window.api.remote.listFiles(projectId, f.absolutePath);
      children = (res && !res.error) ? res : [];
    } else {
      children = await window.api.files.listDir(f.absolutePath);
    }
    this.dirCache.set(f.absolutePath, children);
    childrenContainer.innerHTML = '';
    if (children.length > 0) {
      const childTree = this.renderFileTree(children, projectId, projectPath, depth + 1, remote);
      childrenContainer.appendChild(childTree);
    } else {
      childrenContainer.innerHTML = '<div class="text-xs text-slate-500" style="padding-left:2rem;">(empty)</div>';
    }
  } catch (err) {
    childrenContainer.innerHTML = `<div class="text-xs text-red-400" style="padding-left:2rem;">Error: ${err.message}</div>`;
  }
  return;
}
```

Also remove the prerender block at L1104-1112 (the `if (f.children && f.children.length > 0)` path) — children no longer arrive pre-attached.

- [ ] **Step 2: Replace `refreshProjectTree` with `refreshFolder(dirAbsPath, projectId)`**

The current `refreshProjectTree` (L189) does a full re-walk. Replace it with a function that re-fetches only the affected directory:

```javascript
async refreshFolder(dirAbsPath, projectId) {
  // Only refresh if this directory is currently in cache (i.e. visible).
  if (!this.dirCache.has(dirAbsPath)) return;

  const { projects } = store.getState();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const isRemote = !!project.ssh_host;

  try {
    const entries = isRemote
      ? await window.api.remote.listFiles(projectId, dirAbsPath)
      : await window.api.files.listDir(dirAbsPath);
    if (entries && !entries.error) {
      this.dirCache.set(dirAbsPath, Array.isArray(entries) ? entries : []);
    }
  } catch (e) {
    console.error('Failed to refresh folder:', e);
    return;
  }

  // Re-render just this subtree if its DOM node is mounted, otherwise
  // re-render the whole project (rare path — root only).
  const isProjectRoot = project.path === dirAbsPath;
  if (isProjectRoot) {
    this.renderProjects();
    return;
  }
  // For nested folders, find the existing folder-children container and
  // replace its contents. If we can't locate it, fall back to renderProjects.
  const tree = this.container.querySelector('.sidebar-docs-tree');
  if (!tree) return this.renderProjects();
  // Brute force: find the folder DOM node whose data-abs matches.
  // (Add `data-abs` attribute in Step 3.)
  const folderEl = tree.querySelector(`[data-abs="${CSS.escape(dirAbsPath)}"]`);
  const childrenContainer = folderEl?.nextElementSibling;
  if (!folderEl || !childrenContainer?.classList.contains('sidebar-folder-children')) {
    return this.renderProjects();
  }
  const entries = this.dirCache.get(dirAbsPath) || [];
  childrenContainer.innerHTML = '';
  if (entries.length > 0) {
    const childTree = this.renderFileTree(entries, projectId, project.path, /*depth*/ 1, isRemote);
    childrenContainer.appendChild(childTree);
  }
}
```

- [ ] **Step 3: Tag folder DOM nodes with `data-abs`**

In `renderFileTree` where `folderItem` is created (around L985), add the attribute so `refreshFolder` can find them:

```javascript
folderItem.dataset.abs = f.absolutePath;
```

- [ ] **Step 4: Rewire `watcher:change` to use `refreshFolder`**

Replace the existing handler (Sidebar.js L182-186):

```javascript
window.api.watcher.onChange((projectId, data) => {
  if (!this.expandedProjects.has(projectId)) return;
  const { projects } = store.getState();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // chokidar emits absolute paths in data.path; refresh the parent dir.
  const changedPath = data?.path;
  if (!changedPath) return;
  const lastSlash = changedPath.lastIndexOf('/');
  const parentDir = lastSlash > 0 ? changedPath.slice(0, lastSlash) : project.path;
  this.refreshFolder(parentDir, projectId);
});
```

- [ ] **Step 5: Manual reproduction — the actual bug**

This is the regression check. In the running app:
1. Expand `bloom-forge` (`Projects/unitygame/bloom-forge`) in the sidebar.
2. Open a Workbench terminal pointed at `bloom-forge`.
3. Open DevTools → Performance tab → start recording → also tab to Memory and watch JS heap.
4. In the terminal, run a script that writes the same file repeatedly, e.g.:

   ```bash
   for i in $(seq 1 200); do
     date > /Users/rocos.rex/Projects/unitygame/bloom-forge/gallery-config.json
     sleep 0.2
   done
   ```

5. Watch DevTools Memory. JS heap should stay roughly flat (allow a few MB jitter for the debounce timers and DOM diff).
6. Run for at least 60 seconds. Pre-fix this would push heap upward and eventually crash the renderer (`EXC_BREAKPOINT` in `~/Library/Logs/DiagnosticReports`). Post-fix the renderer must stay alive.

If a crash occurs anyway:
- Capture the new `.ips` from `~/Library/Logs/DiagnosticReports/`.
- Compare against the pre-fix two (`...-2026-05-16-1{0556,1555}.ips`).
- Stop and report back rather than guessing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/common/Sidebar.js
git commit -m "refactor(sidebar): lazy folder expansion + per-directory watcher refresh"
```

---

## Task 5 — Remove dead `walkProjectFiles` / `files:list` and unify watcher excludes

**Files:**
- Modify: `src/main/main.js` (delete `walkProjectFiles`, `EXCLUDED_DIRS` Set local to main.js, `files:list` handler)
- Modify: `src/main/preload.js` (delete `files.list`)
- Modify: `src/main/file-watcher.js` (use shared `isExcluded`)

- [ ] **Step 1: Verify there are no remaining renderer callers of `files.list`**

```bash
grep -rn "api\.files\.list\b\|files:list\b" src/renderer/ src/main/
```

Expected: zero hits in `src/renderer/`. Any remaining hits in `src/main/` are the handler being deleted. If a renderer caller exists that wasn't migrated, stop and migrate it before deleting.

- [ ] **Step 2: Delete `walkProjectFiles`, the local `EXCLUDED_DIRS`, and `files:list`**

In `src/main/main.js`:
- Remove the `const EXCLUDED_DIRS = new Set([...])` block (around L437-441).
- Remove `function walkProjectFiles(...)` (L443-468).
- Remove `ipcMain.handle('files:list', ...)` (L476-479).

- [ ] **Step 3: Delete `files.list` from `preload.js`**

In `src/main/preload.js`, inside `files:`, remove the `list:` line (L72).

- [ ] **Step 4: Make `file-watcher.js` use the shared filter**

Replace the local `EXCLUDED_DIRS` array (L14-18) and the `ignored` construction (L38-39) with:

```javascript
const { isExcluded } = require('./path-filters');

// ... inside startWatching, replace the `ignored` construction with a
// function predicate so chokidar consults it for every path it considers:
const watcher = watch(projectPath, {
  ignored: (filePath, stats) => {
    if (filePath === projectPath) return false;
    // Chokidar passes absolute paths; check each segment under projectPath.
    const rel = path.relative(projectPath, filePath);
    if (!rel) return false;
    return rel.split(path.sep).some(seg => isExcluded(seg));
  },
  persistent: true,
  ignoreInitial: true,
  depth: 10,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
  },
});
```

- [ ] **Step 5: Re-run path-filter and list-dir verifications**

```bash
node scripts/verify/path-filters.js
node scripts/verify/list-dir-perf.js
```

Both must still print `... : OK`.

- [ ] **Step 6: Manual sanity — start the app and re-expand bloom-forge**

```bash
npm start
```

Confirm:
- Sidebar tree still renders correctly.
- Touching a file in `bloom-forge` (e.g. `touch /Users/rocos.rex/Projects/unitygame/bloom-forge/gallery-config.json`) updates the corresponding folder in the tree.
- Touching a file in `.venv-tts` does **not** trigger any re-render (watcher excludes it).

- [ ] **Step 7: Commit**

```bash
git add src/main/main.js src/main/preload.js src/main/file-watcher.js
git commit -m "refactor: remove eager files:list walker; unify watcher excludes"
```

---

## Task 6 — Post-mortem note in the existing crash-recovery runbook

**Files:**
- Modify: `docs/runbooks/terminal-renderer-blank-screen.md`

- [ ] **Step 1: Append a section linking this fix to the May 16 crashes**

Add at the bottom:

```markdown
## 2026-05-16: bloom-forge OOM via eager file walk

Two renderer crashes (`EXC_BREAKPOINT` on `CrRendererMain`, JIT-frame crash stack) at 16:05:56 and 16:15:55 were traced to `files:list` returning a 37K-entry recursive nested tree for `bloom-forge` (`.venv-tts` was not in the main-process exclusion set). Every `chokidar` change inside the project triggered a full re-walk + IPC + sidebar re-render, growing the JS heap to OOM.

Fixed by replacing `files:list` with a single-level `files:listDir` and refreshing only the affected folder on `watcher:change` (commit history under tag `lazy-tree-2026-05-16`).
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/terminal-renderer-blank-screen.md
git commit -m "docs: link sidebar lazy-tree fix to renderer-crash runbook"
```

---

## Self-Review Notes

**Spec coverage**

- Root cause (`walkProjectFiles` recursive + `refreshProjectTree` full re-walk on every change): Tasks 2, 3, 4.
- Exclusion inconsistency (`.venv` excluded but `.venv-tts` not): Task 1 (shared module), Task 5 (watcher migrated).
- Dead-code cleanup after migration: Task 5.
- Manual verification against the actual repro (`bloom-forge`): Task 4 Step 5.
- Documentation pointer for future maintainers: Task 6.

**Out of scope for this plan (and acknowledged):**

- Persisting Workbench cells across renderer restarts. The crash recovery already exists; persistence is a separate plan. Add a `[[2026-05-XX-workbench-persistence]]` reference once that plan is written.
- The uncommitted diagnostics changes (heartbeat + persistent crash log + "Add to Workbench" context menu). They are valuable for next time something else crashes; commit them on their own branch before or after this plan, not as part of it.

**Placeholder scan**: No "TBD"/"add appropriate handling"/"similar to Task N" — every code block is concrete.

**Type consistency**:
- `isExcluded(name)` defined Task 1, used Tasks 2 and 5.
- `dirCache: Map<absolutePath, entries[]>` and entry shape `{ name, absolutePath, isDirectory }` introduced Task 2 Step 3, consumed Tasks 3 & 4.
- `refreshFolder(dirAbsPath, projectId)` arg order consistent in Task 4 Step 2 (definition) and Step 4 (caller).
