'use strict';

const path = require('path');
const { isExcluded } = require('./path-filters');

let chokidar = null;

async function loadChokidar() {
  if (!chokidar) {
    chokidar = await import('chokidar');
  }
  return chokidar;
}

// Watcher pool: Map<projectId, { watcher, projectPath }>
const watchers = new Map();

let changeCallback = null;
const debounceTimers = new Map();

const DEBOUNCE_MS = 500;

function setChangeCallback(cb) {
  changeCallback = cb;
}

async function startWatching(projectId, projectPath) {
  // Already watching this project
  if (watchers.has(projectId)) return;

  const { watch } = await loadChokidar();

  const watcher = watch(projectPath, {
    ignored: (filePath, _stats) => {
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

  const emitChange = (eventType, filePath) => {
    // Debounce per project
    if (debounceTimers.has(projectId)) {
      clearTimeout(debounceTimers.get(projectId));
    }
    debounceTimers.set(projectId, setTimeout(() => {
      debounceTimers.delete(projectId);
      if (changeCallback) {
        changeCallback(projectId, {
          type: eventType,
          path: filePath,
          relativePath: path.relative(projectPath, filePath),
        });
      }
    }, DEBOUNCE_MS));
  };

  watcher
    .on('add', (fp) => emitChange('add', fp))
    .on('unlink', (fp) => emitChange('unlink', fp))
    .on('addDir', (fp) => emitChange('addDir', fp))
    .on('unlinkDir', (fp) => emitChange('unlinkDir', fp))
    .on('change', (fp) => emitChange('change', fp))
    .on('error', (err) => console.error(`[file-watcher] Error for ${projectId}:`, err.message));

  watchers.set(projectId, { watcher, projectPath });
}

function stopWatching(projectId) {
  const entry = watchers.get(projectId);
  if (!entry) return;

  if (debounceTimers.has(projectId)) {
    clearTimeout(debounceTimers.get(projectId));
    debounceTimers.delete(projectId);
  }

  entry.watcher.close().catch(() => {});
  watchers.delete(projectId);
}

function stopAll() {
  for (const [projectId] of watchers) {
    stopWatching(projectId);
  }
}

module.exports = {
  setChangeCallback,
  startWatching,
  stopWatching,
  stopAll,
};
