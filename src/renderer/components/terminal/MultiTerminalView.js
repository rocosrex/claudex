// MultiTerminalView - Full-page multi-terminal grid view
import { store } from '../../store/store.js';
import { Toast } from '../common/Toast.js';
import { terminalRouter } from '../../utils/terminal-router.js';

const MAX_TERMINALS = 8;

export class MultiTerminalView {
  constructor() {
    this.container = null;
    this.cells = []; // { termId, term, fitAddon, cellEl, projectName }
    this.dragSourceIndex = -1;
    this.resizeObserver = null;
  }

  render() {
    terminalRouter.init();

    const el = document.createElement('div');
    el.className = 'multi-terminal-view';
    el.innerHTML = `
      <div class="multi-terminal-header">
        <h2 class="text-lg font-semibold text-slate-100">🖥 Multi Terminal</h2>
        <div class="flex items-center gap-2">
          <span class="terminal-count text-xs text-slate-500"></span>
          <div class="add-terminal-dropdown">
            <button class="btn-add-terminal btn-primary text-sm px-3 py-1.5">+ Add Terminal</button>
            <div class="add-terminal-menu" style="display:none;"></div>
          </div>
        </div>
      </div>
      <div class="multi-terminal-grid" data-count="0">
        <div class="empty-state h-full">
          <div class="empty-state-icon">🖥</div>
          <p class="text-lg text-slate-400 mb-2">No terminals open</p>
          <p class="text-sm text-slate-500">Click "+ Add Terminal" above to get started</p>
        </div>
      </div>
    `;

    this.container = el;
    this.setupDropdown();
    this.setupResizeObserver();

    return el;
  }

  // --- Dropdown menu ---
  setupDropdown() {
    const btn = this.container.querySelector('.btn-add-terminal');
    const menu = this.container.querySelector('.add-terminal-menu');

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (this.cells.length >= MAX_TERMINALS) {
        Toast.show(`Maximum ${MAX_TERMINALS} terminals allowed`, 'warning');
        return;
      }
      await this.populateMenu();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
      menu.style.display = 'none';
    });

    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  async populateMenu() {
    const menu = this.container.querySelector('.add-terminal-menu');
    const projects = store.getState().projects || [];
    const sshProjects = projects.filter(p => p.ssh_host);

    let html = `
      <div class="menu-item" data-action="blank">
        <span>⌨️</span><span>Blank Terminal</span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-header">Projects</div>
    `;

    if (projects.length === 0) {
      html += '<div class="menu-item" style="opacity:0.5;cursor:default;"><span>No projects</span></div>';
    } else {
      for (const p of projects) {
        html += `<div class="menu-item" data-action="project" data-project-id="${p.id}" data-project-path="${p.path || ''}" data-project-name="${p.icon || ''} ${p.name}">
          <span>${p.icon || '📁'}</span><span>${p.name}</span>
        </div>`;
      }
    }

    if (sshProjects.length > 0) {
      html += `
        <div class="menu-divider"></div>
        <div class="menu-header">SSH Terminal</div>
      `;
      for (const p of sshProjects) {
        html += `<div class="menu-item" data-action="ssh" data-project-id="${p.id}" data-project-name="🔒 ${p.ssh_username}@${p.ssh_host}">
          <span>🔒</span><span>${p.ssh_username}@${p.ssh_host}</span>
        </div>`;
      }
    }

    menu.innerHTML = html;

    // Bind click events
    menu.querySelectorAll('.menu-item[data-action]').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        menu.style.display = 'none';

        if (action === 'blank') {
          this.addTerminal('__blank__', '', '⌨️ Terminal');
        } else if (action === 'project') {
          // SSH 설정이 있는 프로젝트는 자동으로 SSH 접속
          const proj = (store.getState().projects || []).find(p => p.id === item.dataset.projectId);
          if (proj && proj.ssh_host) {
            this.addSSHTerminal(proj.id, `🔒 ${proj.ssh_username}@${proj.ssh_host}`);
          } else {
            this.addTerminal(item.dataset.projectId, item.dataset.projectPath, item.dataset.projectName);
          }
        } else if (action === 'ssh') {
          this.addSSHTerminal(item.dataset.projectId, item.dataset.projectName);
        }
      });
    });
  }

  // --- Terminal creation ---
  async addTerminal(projectId, projectPath, title) {
    if (this.cells.length >= MAX_TERMINALS) return;

    const result = await window.api.terminal.create(projectId, projectPath);
    if (result.error) {
      Toast.show(`Failed to create terminal: ${result.error}`, 'error');
      return;
    }

    this.createCell(result.termId, title, { autoTmux: true });
  }

  async addSSHTerminal(projectId, title) {
    if (this.cells.length >= MAX_TERMINALS) return;

    const projects = store.getState().projects || [];
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    // Decrypt password if stored (works for password auth, key passphrase, etc.)
    let password = '';
    if (project.ssh_password_encrypted) {
      try {
        password = await window.api.security.decryptPassword(project.ssh_password_encrypted);
      } catch (e) { /* ignore */ }
    }

    const sshConfig = {
      host: project.ssh_host,
      port: project.ssh_port || 22,
      username: project.ssh_username,
      authType: project.ssh_auth_type || 'key',
      password,
      keyPath: project.ssh_key_path || '',
    };

    const result = await window.api.terminal.createSSH(projectId, sshConfig);
    if (result.error) {
      Toast.show(`SSH connection failed: ${result.error}`, 'error');
      return;
    }

    const startupCommand = project.ssh_startup_command || '';
    this.createCell(result.termId, title, { autoTmux: true, startupCommand });
  }

  createCell(termId, title, options = {}) {
    const grid = this.container.querySelector('.multi-terminal-grid');

    // Remove empty state if present
    const emptyState = grid.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Create cell element
    const cellEl = document.createElement('div');
    cellEl.className = 'terminal-cell';
    cellEl.draggable = false; // Only titlebar is draggable

    cellEl.innerHTML = `
      <div class="cell-titlebar" draggable="true">
        <div class="cell-title">
          <span class="truncate">${title}</span>
        </div>
        <button class="cell-close" title="Close">✕</button>
      </div>
      <div class="cell-terminal-container"></div>
    `;

    // Create xterm instance
    const term = new window.Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        cursorAccent: '#0f172a',
        selectionBackground: '#6366f1',
        selectionForeground: '#ffffff',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f8fafc',
      },
      fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 3000,
      allowProposedApi: true,
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    const termContainer = cellEl.querySelector('.cell-terminal-container');
    term.open(termContainer);

    // Register with router
    terminalRouter.register(
      termId,
      (data) => term.write(data),
      () => {
        const titleSpan = cellEl.querySelector('.cell-title .truncate');
        if (titleSpan) titleSpan.textContent += ' (exited)';
      }
    );

    // Key input
    term.onData((data) => {
      window.api.terminal.input(termId, data);
    });

    // Custom key handler
    term.attachCustomKeyEventHandler((e) => {
      if (e.metaKey && (e.key === 'c' || e.key === 'v')) return false;
      return true;
    });

    // Store cell data
    const cellData = { termId, term, fitAddon, cellEl, title };
    this.cells.push(cellData);
    const cellIndex = this.cells.length - 1;

    // Close button
    cellEl.querySelector('.cell-close').addEventListener('click', () => {
      this.removeCell(cellData);
    });

    // Drag & Drop on titlebar
    this.setupCellDrag(cellEl, cellIndex);

    grid.appendChild(cellEl);
    this.updateGridLayout();

    // Fit after DOM paint
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols > 0 && dims.rows > 0) {
          window.api.terminal.resize(termId, dims.cols, dims.rows);
        }
        term.focus();
      } catch (e) { /* ignore */ }

      // Auto-start tmux, then startup command
      if (options.autoTmux) {
        setTimeout(() => {
          window.api.terminal.input(termId, 'tmux new-session\r');
          // Send startup command after tmux is ready
          if (options.startupCommand) {
            setTimeout(() => {
              window.api.terminal.input(termId, options.startupCommand + '\r');
            }, 1000);
          }
        }, 300);
      }
    });
  }

  async removeCell(cellData) {
    const index = this.cells.indexOf(cellData);
    if (index === -1) return;

    terminalRouter.unregister(cellData.termId);
    await window.api.terminal.close(cellData.termId);
    cellData.term.dispose();
    if (cellData.cellEl.parentNode) cellData.cellEl.remove();
    this.cells.splice(index, 1);

    this.updateGridLayout();

    // Show empty state if no cells
    if (this.cells.length === 0) {
      const grid = this.container.querySelector('.multi-terminal-grid');
      grid.innerHTML = `
        <div class="empty-state h-full">
          <div class="empty-state-icon">🖥</div>
          <p class="text-lg text-slate-400 mb-2">No terminals open</p>
          <p class="text-sm text-slate-500">Click "+ Add Terminal" above to get started</p>
        </div>
      `;
    }
  }

  // --- Grid layout ---
  updateGridLayout() {
    const grid = this.container.querySelector('.multi-terminal-grid');
    const count = this.cells.length;
    grid.setAttribute('data-count', String(count));

    // Update counter
    const countEl = this.container.querySelector('.terminal-count');
    if (countEl) {
      countEl.textContent = count > 0 ? `${count}/${MAX_TERMINALS}` : '';
    }

    // Refit all terminals
    requestAnimationFrame(() => {
      this.cells.forEach(cell => {
        try {
          cell.fitAddon.fit();
          const dims = cell.fitAddon.proposeDimensions();
          if (dims && dims.cols > 0 && dims.rows > 0) {
            window.api.terminal.resize(cell.termId, dims.cols, dims.rows);
          }
        } catch (e) { /* ignore */ }
      });
    });
  }

  // --- Drag & Drop ---
  setupCellDrag(cellEl, initialIndex) {
    const titlebar = cellEl.querySelector('.cell-titlebar');

    titlebar.addEventListener('dragstart', (e) => {
      this.dragSourceIndex = this.cells.findIndex(c => c.cellEl === cellEl);
      cellEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(this.dragSourceIndex));
    });

    titlebar.addEventListener('dragend', () => {
      cellEl.classList.remove('dragging');
      this.dragSourceIndex = -1;
      // Remove all drag-over classes
      this.container.querySelectorAll('.terminal-cell.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });

    cellEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      cellEl.classList.add('drag-over');
    });

    cellEl.addEventListener('dragleave', () => {
      cellEl.classList.remove('drag-over');
    });

    cellEl.addEventListener('drop', (e) => {
      e.preventDefault();
      cellEl.classList.remove('drag-over');

      const targetIndex = this.cells.findIndex(c => c.cellEl === cellEl);
      if (this.dragSourceIndex === -1 || this.dragSourceIndex === targetIndex) return;

      // Swap cells
      this.swapCells(this.dragSourceIndex, targetIndex);
      this.dragSourceIndex = -1;
    });
  }

  swapCells(fromIndex, toIndex) {
    const grid = this.container.querySelector('.multi-terminal-grid');

    // Swap in array
    const temp = this.cells[fromIndex];
    this.cells[fromIndex] = this.cells[toIndex];
    this.cells[toIndex] = temp;

    // Reorder DOM
    grid.innerHTML = '';
    this.cells.forEach(cell => {
      grid.appendChild(cell.cellEl);
    });

    this.updateGridLayout();
  }

  // --- Resize observer ---
  setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.cells.forEach(cell => {
        try {
          cell.fitAddon.fit();
          const dims = cell.fitAddon.proposeDimensions();
          if (dims && dims.cols > 0 && dims.rows > 0) {
            window.api.terminal.resize(cell.termId, dims.cols, dims.rows);
          }
        } catch (e) { /* ignore */ }
      });
    });

    const grid = this.container.querySelector('.multi-terminal-grid');
    this.resizeObserver.observe(grid);
  }

  // --- Cleanup ---
  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.cells.forEach(cell => {
      terminalRouter.unregister(cell.termId);
      window.api.terminal.close(cell.termId);
      cell.term.dispose();
    });
    this.cells = [];
  }
}
