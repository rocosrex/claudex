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

function containsAtLeast(source, needle, count, message) {
  const actual = source.split(needle).length - 1;
  assert.ok(actual >= count, `${message} (found ${actual}, expected at least ${count})`);
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
contains(stt, 'try {\n      callback(this.state);\n    } catch (e) {', 'STT initial state callback must be isolated');
contains(stt, 'for (const callback of [...this._stateListeners])', 'STT service must notify all state listeners safely');
contains(stt, 'for (const callback of [...this._transcribedListeners])', 'STT service must notify all transcription listeners safely');

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
contains(terminalPanel, 'if (this._destroyed) return;\n    const result = await window.api.terminal.create(this.projectId, this.projectPath);', 'TerminalPanel must skip local terminal creation after destroy');
contains(terminalPanel, 'if (this._destroyed) return;\n    const result = await window.api.terminal.createSSH(projectId, sshConfig);', 'TerminalPanel must skip SSH terminal creation after destroy');
containsAtLeast(terminalPanel, 'this._destroyed && result.termId', 2, 'TerminalPanel must detect backend terminals created after destroy');
containsAtLeast(terminalPanel, 'window.api.terminal.close(result.termId)', 2, 'TerminalPanel must close backend terminals created after destroy');
contains(terminalPanel, 'if (this._destroyed) return;\n        window.api.terminal.runClaude(termId);', 'TerminalPanel delayed Claude run must skip after destroy');
contains(terminalPanel, "if (this._destroyed) return;\n        window.api.terminal.input(this.termId, startupCmd + '\\r');", 'TerminalPanel delayed SSH startup input must skip after destroy');
contains(terminalPanel, 'this.fitTab(tab);', 'TerminalPanel tab switching must resize backend through fit helper');

contains(multiTerminal, 'this._unsubscribeSttState = null', 'Workbench must store STT state unsubscribe');
contains(multiTerminal, 'this._unsubscribeSttTranscribed = null', 'Workbench must store STT transcription unsubscribe');
contains(multiTerminal, 'this._onDocumentClick = null', 'Workbench must store document click cleanup');
contains(multiTerminal, 'this._unsubscribeSttState?.()', 'Workbench must unsubscribe STT state listener');
contains(multiTerminal, 'this._unsubscribeSttTranscribed?.()', 'Workbench must unsubscribe STT transcription listener');
contains(multiTerminal, "document.removeEventListener('click', this._onDocumentClick)", 'Workbench must remove document click listener on destroy');

console.log('terminal crash recovery verification passed');
