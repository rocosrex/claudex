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

function notContains(source, needle, message) {
  assert.ok(!source.includes(needle), message);
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
contains(main, "if (reason === 'clean-exit')", 'main process must only skip recovery for clean renderer exits');
contains(main, 'recoverRenderer(win, details);\n  });', 'main process must recover non-clean renderer exits');
notContains(main, 'Renderer exited without auto-reload', 'main process must not leave non-clean renderer exits unrecovered');

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
const app = read('src/renderer/app.js');
const projectDetail = read('src/renderer/components/project/ProjectDetail.js');

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
contains(terminalPanel, '_closeBackendTerminal(termId, context)', 'TerminalPanel must centralize caught backend terminal closes');
contains(terminalPanel, 'Promise.resolve(window.api.terminal.close(termId))', 'TerminalPanel backend close helper must catch invoke rejections');
containsAtLeast(terminalPanel, 'await this._closeBackendTerminal(result.termId,', 2, 'TerminalPanel must safely close backend terminals created after destroy');
contains(terminalPanel, "this._closeBackendTerminal(tab.termId, 'destroy')", 'TerminalPanel destroy must catch backend terminal close failures');
contains(terminalPanel, '_hasTab(termId)', 'TerminalPanel must provide a stable tab existence helper');
contains(terminalPanel, 'tab.termId === termId && !tab.closing', 'TerminalPanel tab existence helper must reject closing tabs');
containsAtLeast(terminalPanel, 'this._hasTab(termId)', 2, 'TerminalPanel delayed commands must verify the target tab still exists');
contains(terminalPanel, 'if (!tab || tab.closing) return;', 'TerminalPanel closeTab must be idempotent for closing tabs');
contains(terminalPanel, 'tab.closing = true;', 'TerminalPanel closeTab must mark tabs closing before awaiting backend close');
contains(terminalPanel, 'const tabIndex = this.tabs.indexOf(tab);', 'TerminalPanel closeTab must recompute tab index by identity after close');
contains(terminalPanel, 'this.tabs.splice(tabIndex, 1);', 'TerminalPanel closeTab must remove the closed tab by identity');
contains(terminalPanel, 'const currentActiveTab = this.tabs[this.activeTabIndex];', 'TerminalPanel closeTab must inspect current active tab after backend close');
contains(terminalPanel, '!currentActiveTab.closing', 'TerminalPanel closeTab must preserve only live current active tabs');
contains(terminalPanel, 'findIndex(candidate => !candidate.closing)', 'TerminalPanel closeTab must choose a live fallback tab');
contains(terminalPanel, 'await window.api.terminal.runClaude(termId)', 'TerminalPanel delayed Claude run must use the captured termId');
contains(terminalPanel, 'try {\n          await window.api.terminal.runClaude(termId);\n        } catch (e) {', 'TerminalPanel delayed Claude run rejection must be caught');
contains(terminalPanel, "addEventListener('click', async () => {", 'TerminalPanel Run Claude button must handle async invoke rejections');
contains(terminalPanel, 'const termId = this.termId;\n        if (!this._hasTab(termId)) return;', 'TerminalPanel Run Claude button must capture and verify active termId');
contains(terminalPanel, "console.warn('Terminal Run Claude failed', e)", 'TerminalPanel Run Claude button must catch invoke rejections');
containsAtLeast(terminalPanel, 'this.fitAddon = null', 4, 'TerminalPanel must clear stale fitAddon references when terminals are gone');
contains(terminalPanel, "window.api.terminal.input(termId, startupCmd + '\\r')", 'TerminalPanel delayed SSH startup input must use the captured termId');
contains(terminalPanel, "const termId = await this.createSSHSession(this.projectId, sshConfig)", 'TerminalPanel SSH startup must capture the created termId');
contains(terminalPanel, 'this.fitTab(tab);', 'TerminalPanel tab switching must resize backend through fit helper');

contains(multiTerminal, 'this._unsubscribeSttState = null', 'Workbench must store STT state unsubscribe');
contains(multiTerminal, 'this._unsubscribeSttTranscribed = null', 'Workbench must store STT transcription unsubscribe');
contains(multiTerminal, 'this._onDocumentClick = null', 'Workbench must store document click cleanup');
contains(multiTerminal, 'this._destroyed = false', 'Workbench must track destroy state');
contains(multiTerminal, '_hasTerminalCell(termId)', 'Workbench must provide a live terminal cell helper');
contains(multiTerminal, 'cell.termId === termId && !cell.closing', 'Workbench live terminal cell helper must reject closing cells');
contains(multiTerminal, 'if (this._destroyed) return', 'Workbench must guard async work after destroy');
containsAtLeast(multiTerminal, 'if (this._destroyed && result.termId)', 2, 'Workbench must detect backend terminals created after destroy');
contains(multiTerminal, '_closeBackendTerminal(termId, context)', 'Workbench must centralize caught backend terminal closes');
contains(multiTerminal, 'Promise.resolve(window.api.terminal.close(termId))', 'Workbench backend close helper must catch invoke rejections');
containsAtLeast(multiTerminal, 'await this._closeBackendTerminal(result.termId,', 2, 'Workbench must safely close backend terminals created after destroy');
contains(multiTerminal, "this._closeBackendTerminal(cell.termId, 'destroy')", 'Workbench destroy must catch backend terminal close failures');
contains(multiTerminal, 'async _sendStartupInput(termId, data)', 'Workbench delayed startup input must use a guarded helper');
contains(multiTerminal, 'if (this._destroyed || !this._hasTerminalCell(termId)) return;', 'Workbench delayed startup input must guard destroyed and removed terminal cells');
contains(multiTerminal, 'await window.api.terminal.input(termId, data)', 'Workbench delayed startup input must await terminal input');
contains(multiTerminal, "console.warn('Workbench delayed startup input failed', e)", 'Workbench delayed startup input failures must be logged');
containsAtLeast(multiTerminal, 'this._sendStartupInput(termId,', 3, 'Workbench delayed startup timers must use the guarded input helper');
contains(multiTerminal, 'if (cellData.closing) return;', 'Workbench removeCell must be idempotent for closing cells');
contains(multiTerminal, 'cellData.closing = true;', 'Workbench removeCell must mark cells closing before awaiting backend close');
contains(multiTerminal, 'const cellIndex = this.cells.indexOf(cellData);', 'Workbench removeCell must recompute cell index by identity after close');
contains(multiTerminal, 'this.cells.splice(cellIndex, 1);', 'Workbench removeCell must remove the closed cell by identity');
contains(multiTerminal, 'this._unsubscribeSttState?.()', 'Workbench must unsubscribe STT state listener');
contains(multiTerminal, 'this._unsubscribeSttTranscribed?.()', 'Workbench must unsubscribe STT transcription listener');
contains(multiTerminal, "document.removeEventListener('click', this._onDocumentClick)", 'Workbench must remove document click listener on destroy');
contains(multiTerminal, 'if (this._destroyed) return;\n    this._destroyed = true;', 'Workbench destroy must be idempotent');

contains(app, 'this.currentViewInstance = null', 'App must track the current routed view instance');
contains(app, 'destroyCurrentView()', 'App must centralize routed view destruction');
contains(app, 'this.currentViewInstance?.destroy', 'App must destroy current routed views through optional destroy');
contains(app, 'this.currentViewInstance = detail', 'App must own project detail view lifecycle');
contains(app, 'this.currentViewInstance = dashboard', 'App must own dashboard view lifecycle');
contains(app, 'this.currentViewInstance = null; // Workbench is intentionally persistent', 'App must leave Workbench persistent across navigation');
contains(app, 'async openRemoteFileInWorkbench(view, params)', 'App must open remote files through an awaitable Workbench helper');
contains(app, "const workbench = await this.navigate('terminal')", 'Remote Workbench opens must await terminal navigation');
contains(app, "if (!workbench || !this.isCurrentNavigation(navigationToken, 'terminal')) return;", 'Remote Workbench opens must guard stale navigation before adding cells');
contains(app, 'workbench.addEditorCell(params.filePath, params.projectId, { remote: true })', 'Remote docs files must open editor cells through the awaited Workbench');
contains(app, 'workbench.addPdfCell(params.filePath, params.projectId, { remote: true })', 'Remote PDFs must open PDF cells through the awaited Workbench');
contains(app, 'return this.loadMultiTerminal(navigationToken)', 'Terminal navigation must return the awaitable Workbench load');
contains(app, 'return this.multiTerminalView', 'loadMultiTerminal must resolve with the Workbench instance');
contains(app, "return null", 'loadMultiTerminal must return null when Workbench loading becomes stale or fails');
notContains(app, 'requestAnimationFrame', 'Remote Workbench opens must not rely on requestAnimationFrame');

contains(projectDetail, 'this._tabComponents = new Map()', 'ProjectDetail must track tab component lifecycles');
contains(projectDetail, 'this._tabRenderGenerations = new Map()', 'ProjectDetail must track async tab render generations');
contains(projectDetail, 'this._destroyed = false', 'ProjectDetail must track destroy state');
contains(projectDetail, '_destroyTabComponent(tabId)', 'ProjectDetail must destroy individual tab components');
contains(projectDetail, 'this._tabComponents.set(tabId, component)', 'ProjectDetail must store rendered tab components');
contains(projectDetail, 'destroy() {', 'ProjectDetail must expose destroy lifecycle');
contains(projectDetail, 'this._terminalPanel.destroy()', 'ProjectDetail destroy must tear down cached terminal panel');
contains(projectDetail, 'if (this._destroyed) return;', 'ProjectDetail must guard async work after destroy');
contains(projectDetail, '_nextTabRenderGeneration(tabId)', 'ProjectDetail must issue per-tab render generations');
contains(projectDetail, '_isCurrentTabRender(tabId, renderGeneration, container)', 'ProjectDetail must centralize stale async tab checks');
contains(projectDetail, 'const renderGeneration = this._nextTabRenderGeneration(tabId)', 'ProjectDetail must create a generation for each tab render');
contains(projectDetail, "this.renderOverview(content, renderGeneration)", 'ProjectDetail overview tab must capture render generation');
contains(projectDetail, 'async renderOverview(container, renderGeneration)', 'ProjectDetail overview renderer must receive render generation');
contains(projectDetail, "_isCurrentTabRender('overview', renderGeneration, container)", 'ProjectDetail overview async activity load must reject stale continuations');
contains(projectDetail, "this.renderTerminalTab(content, renderGeneration)", 'ProjectDetail terminal tab must capture render generation');
contains(projectDetail, "this.renderTabPlaceholder(content, 'todos', 'TodoList', renderGeneration)", 'ProjectDetail todos tab must capture render generation');
contains(projectDetail, "this.renderTabPlaceholder(content, 'notes', 'NoteList', renderGeneration)", 'ProjectDetail notes tab must capture render generation');
contains(projectDetail, "this.renderTabPlaceholder(content, 'timer', 'TimeTracker', renderGeneration)", 'ProjectDetail timer tab must capture render generation');
containsAtLeast(projectDetail, "_isCurrentTabRender('terminal', renderGeneration, container)", 3, 'ProjectDetail terminal async render must reject stale continuations');
containsAtLeast(projectDetail, '_isCurrentTabRender(tabId, renderGeneration, container)', 5, 'ProjectDetail dynamic tab async renders must reject stale continuations');

console.log('terminal crash recovery verification passed');
