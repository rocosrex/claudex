import { Toast } from '../common/Toast.js';
import { terminalRouter } from '../../utils/terminal-router.js';
import { store } from '../../store/store.js';
import { getTerminalSettings, buildTerminalOptions } from './terminal-themes.js';
import { sttService } from '../../utils/stt-service.js';
import { STTIndicator } from './STTIndicator.js';

export class TerminalPanel {
  /**
   * @param {string} projectId
   * @param {string} projectPath
   * @param {Object} options
   * @param {boolean} options.autoRunClaude - Auto-run Claude on creation
   * @param {string} options.mode - 'embedded' (in-app) | 'panel' (bottom slide)
   */
  constructor(projectId, projectPath, options = {}) {
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.autoRunClaude = options.autoRunClaude || false;
    this.mode = options.mode || 'embedded';
    this.isSSH = options.isSSH || false;
    this.project = options.project || null;
    this.termId = null;
    this.terminal = null;  // xterm.js Terminal instance
    this.fitAddon = null;
    this.tabs = [];        // Manage multiple terminal sessions
    this.activeTabIndex = 0;
  }

  render() {
    const container = document.createElement('div');
    container.className = 'terminal-panel flex flex-col h-full';
    container.innerHTML = `
      <!-- Terminal tab bar -->
      <div class="terminal-tabs flex items-center gap-1 px-2 py-1 bg-slate-900 border-b border-slate-700">
        <div class="tabs-list flex gap-1 flex-1 overflow-x-auto"></div>
        <div class="tab-actions flex gap-1">
          <button class="btn-new-terminal text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                  title="New Terminal">+ Terminal</button>
          <button class="btn-run-claude text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                  title="Run Claude Code">▶ Claude</button>
          <button class="btn-stt-toggle text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                  title="Voice Input (PgDn×2)">🎙 Voice</button>
          <button class="btn-open-external text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                  title="Open in Terminal.app">🔗 External</button>
        </div>
      </div>
      <!-- Terminal body -->
      <div class="terminal-body flex-1 relative" style="min-height: 300px;">
        <div class="terminal-container w-full h-full"></div>
        <!-- Shown when no terminals are open -->
        <div class="terminal-placeholder absolute inset-0 flex items-center justify-center text-slate-500">
          <div class="text-center">
            <div class="text-4xl mb-3">⌨️</div>
            <p class="text-lg mb-2">No terminals open</p>
            <p class="text-sm">Click "+ Terminal" or "▶ Claude" above to get started</p>
          </div>
        </div>
      </div>
    `;

    this.container = container;
    this.setupEventListeners();
    this.setupSettingsListener();
    this.setupSTT();
    terminalRouter.init();

    // Auto-run
    if (this.autoRunClaude) {
      setTimeout(() => this.createAndRunClaude(), 100);
    }

    return container;
  }

  // --- Terminal creation ---
  async createTerminalSession(runClaude = false) {
    const result = await window.api.terminal.create(this.projectId, this.projectPath);
    if (result.error) {
      Toast.show(`Failed to create terminal: ${result.error}`, 'error');
      return;
    }

    const termId = result.termId;
    const settings = getTerminalSettings();
    const termOptions = buildTerminalOptions(settings);
    const term = new window.Terminal({
      ...termOptions,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    // Create independent wrapper for each terminal
    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper w-full h-full';

    // Add tab
    const tab = { termId, term, fitAddon, wrapper, title: runClaude ? '🤖 Claude' : '⌨️ Terminal' };
    this.tabs.push(tab);
    this.activeTabIndex = this.tabs.length - 1;

    // Register callbacks with router
    terminalRouter.register(
      termId,
      (data) => tab.term.write(data),
      () => {
        tab.title += ' (exited)';
        this.renderTabs();
        Toast.show('Terminal session ended', 'warning');
      }
    );

    // Update tab UI
    this.renderTabs();

    // Hide existing wrappers, show only new wrapper
    const termContainer = this.container.querySelector('.terminal-container');
    termContainer.querySelectorAll('.terminal-wrapper').forEach(w => w.style.display = 'none');
    termContainer.appendChild(wrapper);
    term.open(wrapper);

    // Call fitAddon after DOM mount
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        const cols = dims?.cols || 80;
        const rows = dims?.rows || 24;
        if (cols > 0 && rows > 0) {
          window.api.terminal.resize(termId, cols, rows);
        }
      } catch (e) { /* ignore initial fit errors */ }
    });

    // Hide placeholder
    const placeholder = this.container.querySelector('.terminal-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    // renderer -> main (key input)
    term.onData((data) => {
      window.api.terminal.input(termId, data);
    });

    // Ensure focus on terminal click
    wrapper.addEventListener('click', () => {
      term.focus();
    });

    // Prevent Electron from intercepting certain keys
    term.attachCustomKeyEventHandler((e) => {
      // Delegate Cmd+C (copy), Cmd+V (paste) to browser
      if (e.metaKey && (e.key === 'c' || e.key === 'v')) {
        return false;
      }
      // PgDn double-tap → STT toggle
      if (e.type === 'keydown' && e.key === 'PageDown') {
        if (sttService.handlePgDnKey()) return false;
      }
      return true;
    });

    // Immediate focus
    term.focus();

    // Resize handling
    this.resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols > 0 && dims.rows > 0) {
          window.api.terminal.resize(termId, dims.cols, dims.rows);
        }
      } catch (e) { /* ignore */ }
    });
    this.resizeObserver.observe(termContainer);

    // Run Claude Code
    if (runClaude) {
      setTimeout(() => {
        window.api.terminal.runClaude(termId);
      }, 500);
    }

    this.termId = termId;
    this.terminal = term;
    this.fitAddon = fitAddon;
  }

  async createAndRunClaude() {
    await this.createTerminalSession(true);
  }

  // --- Tab UI ---
  renderTabs() {
    const tabsList = this.container.querySelector('.tabs-list');
    tabsList.innerHTML = '';

    this.tabs.forEach((tab, index) => {
      const tabEl = document.createElement('div');
      const isActive = index === this.activeTabIndex;
      tabEl.className = `tab-item flex items-center gap-1 px-3 py-1 rounded text-xs cursor-pointer ${
        isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
      }`;
      tabEl.innerHTML = `
        <span>${tab.title}</span>
        <button class="tab-close ml-1 hover:text-red-400" data-index="${index}">✕</button>
      `;

      tabEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) {
          this.closeTab(index);
        } else {
          this.switchTab(index);
        }
      });

      tabsList.appendChild(tabEl);
    });
  }

  switchTab(index) {
    if (index < 0 || index >= this.tabs.length) return;
    this.activeTabIndex = index;
    const tab = this.tabs[index];

    // Hide all wrappers and show only the selected one
    const termContainer = this.container.querySelector('.terminal-container');
    termContainer.querySelectorAll('.terminal-wrapper').forEach(w => w.style.display = 'none');
    tab.wrapper.style.display = '';

    requestAnimationFrame(() => {
      try {
        tab.fitAddon.fit();
        tab.term.focus();
      } catch (e) { /* ignore */ }
    });

    this.termId = tab.termId;
    this.terminal = tab.term;
    this.fitAddon = tab.fitAddon;
    this.renderTabs();
  }

  async closeTab(index) {
    const tab = this.tabs[index];
    terminalRouter.unregister(tab.termId);
    await window.api.terminal.close(tab.termId);
    tab.term.dispose();
    if (tab.wrapper.parentNode) tab.wrapper.parentNode.removeChild(tab.wrapper);
    this.tabs.splice(index, 1);

    if (this.tabs.length === 0) {
      const placeholder = this.container.querySelector('.terminal-placeholder');
      if (placeholder) placeholder.style.display = 'flex';
      this.termId = null;
      this.terminal = null;
    } else {
      this.activeTabIndex = Math.min(this.activeTabIndex, this.tabs.length - 1);
      this.switchTab(this.activeTabIndex);
    }
    this.renderTabs();
  }

  // --- Events ---
  setupEventListeners() {
    this.container.querySelector('.btn-new-terminal').addEventListener('click', () => {
      if (this.isSSH) {
        this._createSSHSessionFromProject();
      } else {
        this.createTerminalSession(false);
      }
    });

    this.container.querySelector('.btn-run-claude').addEventListener('click', () => {
      if (this.isSSH) {
        this._createSSHSessionFromProject(true);
      } else if (this.termId && this.terminal) {
        window.api.terminal.runClaude(this.termId);
      } else {
        this.createAndRunClaude();
      }
    });

    const btnExternal = this.container.querySelector('.btn-open-external');
    if (this.isSSH) {
      btnExternal.style.display = 'none';
    } else {
      btnExternal.addEventListener('click', () => {
        window.api.terminal.openExternal(this.projectPath, true);
        Toast.show('Running Claude Code in Terminal.app', 'info');
      });
    }
  }

  async _createSSHSessionFromProject(runClaude = false) {
    const p = this.project;
    if (!p) return;

    let password = '';
    if (p.ssh_password_encrypted) {
      try {
        password = await window.api.security.decryptPassword(p.ssh_password_encrypted);
      } catch (e) { /* ignore */ }
    }

    const sshConfig = {
      host: p.ssh_host,
      port: p.ssh_port || 22,
      username: p.ssh_username,
      authType: p.ssh_auth_type || 'key',
      password,
      keyPath: p.ssh_key_path || '',
    };

    await this.createSSHSession(this.projectId, sshConfig);

    // Send startup command after connection
    const startupCmd = runClaude
      ? (p.ssh_startup_command || '')
      : '';
    if (startupCmd) {
      setTimeout(() => {
        window.api.terminal.input(this.termId, startupCmd + '\r');
      }, 500);
    }
  }

  // --- SSH Terminal ---
  async createSSHSession(projectId, sshConfig) {
    const result = await window.api.terminal.createSSH(projectId, sshConfig);
    if (result.error) {
      Toast.show(`SSH connection failed: ${result.error}`, 'error');
      return;
    }

    const termId = result.termId;
    const sshSettings = getTerminalSettings();
    const sshTermOptions = buildTerminalOptions(sshSettings);
    const term = new window.Terminal({
      ...sshTermOptions,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper w-full h-full';

    const host = sshConfig.host || 'remote';
    const tab = { termId, term, fitAddon, wrapper, title: `🔒 ${host}` };
    this.tabs.push(tab);
    this.activeTabIndex = this.tabs.length - 1;

    terminalRouter.register(
      termId,
      (data) => tab.term.write(data),
      () => {
        tab.title += ' (exited)';
        this.renderTabs();
        Toast.show('SSH session ended', 'warning');
      }
    );

    this.renderTabs();

    const termContainer = this.container.querySelector('.terminal-container');
    termContainer.querySelectorAll('.terminal-wrapper').forEach(w => w.style.display = 'none');
    termContainer.appendChild(wrapper);
    term.open(wrapper);

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        const cols = dims?.cols || 80;
        const rows = dims?.rows || 24;
        if (cols > 0 && rows > 0) {
          window.api.terminal.resize(termId, cols, rows);
        }
      } catch (e) { /* ignore */ }
    });

    const placeholder = this.container.querySelector('.terminal-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    term.onData((data) => {
      window.api.terminal.input(termId, data);
    });

    wrapper.addEventListener('click', () => term.focus());

    term.attachCustomKeyEventHandler((e) => {
      if (e.metaKey && (e.key === 'c' || e.key === 'v')) return false;
      if (e.type === 'keydown' && e.key === 'PageDown') {
        if (sttService.handlePgDnKey()) return false;
      }
      return true;
    });

    term.focus();

    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        const activeTab = this.tabs[this.activeTabIndex];
        if (!activeTab) return;
        try {
          activeTab.fitAddon.fit();
          const dims = activeTab.fitAddon.proposeDimensions();
          if (dims && dims.cols > 0 && dims.rows > 0) {
            window.api.terminal.resize(activeTab.termId, dims.cols, dims.rows);
          }
        } catch (e) { /* ignore */ }
      });
      this.resizeObserver.observe(termContainer);
    }

    this.termId = termId;
    this.terminal = term;
    this.fitAddon = fitAddon;
  }

  // --- STT Setup ---
  setupSTT() {
    // Add STT indicator to terminal body
    this.sttIndicator = new STTIndicator();
    const body = this.container.querySelector('.terminal-body');
    body.appendChild(this.sttIndicator.render());

    // STT state change → update indicator and button
    sttService.onStateChange((state) => {
      this.sttIndicator.update(state);
      const btn = this.container.querySelector('.btn-stt-toggle');
      if (btn) {
        if (state === 'idle') {
          btn.className = 'btn-stt-toggle text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300';
        } else {
          btn.className = 'btn-stt-toggle text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white';
        }
      }
    });

    // STT transcribed → insert into active terminal
    sttService.onTranscribed((text) => {
      if (this.termId) {
        window.api.terminal.input(this.termId, text);
      }
    });

    // Mic button click
    this.container.querySelector('.btn-stt-toggle').addEventListener('click', () => {
      sttService.toggle();
    });
  }

  // --- Settings change listener ---
  setupSettingsListener() {
    this._onSettingsChanged = () => {
      const settings = getTerminalSettings();
      const opts = buildTerminalOptions(settings);
      this.tabs.forEach(tab => {
        tab.term.options.theme = opts.theme;
        tab.term.options.fontFamily = opts.fontFamily;
        tab.term.options.fontSize = opts.fontSize;
        tab.term.options.lineHeight = opts.lineHeight;
        tab.term.options.cursorStyle = opts.cursorStyle;
        tab.term.options.cursorBlink = opts.cursorBlink;
        try { tab.fitAddon.fit(); } catch (e) { /* ignore */ }
      });
    };
    store.on('terminal-settings-changed', this._onSettingsChanged);
  }

  // --- Cleanup ---
  destroy() {
    if (this._onSettingsChanged) store.off('terminal-settings-changed', this._onSettingsChanged);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.sttIndicator) this.sttIndicator.destroy();
    this.tabs.forEach(tab => {
      terminalRouter.unregister(tab.termId);
      window.api.terminal.close(tab.termId);
      tab.term.dispose();
    });
    this.tabs = [];
  }
}
