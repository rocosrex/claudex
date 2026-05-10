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
contains(main, 'rendererRecoveryShown', 'main process must guard recovery page loops');
contains(main, 'function escapeHtml', 'recovery page must escape dynamic details');
contains(main, 'Content-Security-Policy', 'recovery page must include a CSP');
contains(main, "default-src 'none'", 'recovery page CSP must deny default loads');
contains(main, 'lastRendererCrashDetails', 'main process must store last recovery details');
contains(main, 'if (rendererRecoveryShown)', 'createWindow must branch for recovery mode');
contains(main, "reason: 'recovery-mode'", 'recreated recovery windows must have fallback recovery details');
contains(main, 'showRendererRecoveryPage(mainWindow', 'createWindow must load recovery page during recovery mode');

const stt = read('src/renderer/utils/stt-service.js');

contains(stt, '_transcribedListeners = new Set()', 'STT service must keep transcribed listeners in a Set');
contains(stt, '_stateListeners = new Set()', 'STT service must keep state listeners in a Set');
contains(stt, 'return () => this._transcribedListeners.delete(callback)', 'STT transcribed subscriptions must be removable');
contains(stt, 'return () => this._stateListeners.delete(callback)', 'STT state subscriptions must be removable');
contains(stt, 'for (const callback of [...this._stateListeners])', 'STT service must notify all state listeners safely');
contains(stt, 'for (const callback of [...this._transcribedListeners])', 'STT service must notify all transcription listeners safely');

console.log('terminal crash recovery verification passed');
