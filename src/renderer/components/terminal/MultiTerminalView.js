// MultiTerminalView - Full-page multi-terminal grid view
import { store } from '../../store/store.js';
import { Toast } from '../common/Toast.js';
import { terminalRouter } from '../../utils/terminal-router.js';
import { getTerminalSettings, buildTerminalOptions } from './terminal-themes.js';

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
        <h2 class="text-lg font-semibold text-slate-100">⌘ Workbench</h2>
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
    this.setupSettingsListener();

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
    this.createCell(result.termId, title, { autoTmux: false, startupCommand });
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
    const settings = getTerminalSettings();
    const termOptions = buildTerminalOptions(settings);
    const term = new window.Terminal({
      ...termOptions,
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
    const cellData = { type: 'terminal', termId, term, fitAddon, cellEl, title };
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

      // Auto-start tmux (local terminals only), then startup command
      if (options.autoTmux) {
        setTimeout(() => {
          window.api.terminal.input(termId, 'tmux new-session\r');
          if (options.startupCommand) {
            setTimeout(() => {
              window.api.terminal.input(termId, options.startupCommand + '\r');
            }, 1000);
          }
        }, 300);
      } else if (options.startupCommand) {
        // SSH terminals: send startup command directly (no tmux)
        setTimeout(() => {
          window.api.terminal.input(termId, options.startupCommand + '\r');
        }, 500);
      }
    });
  }

  async removeCell(cellData) {
    const index = this.cells.indexOf(cellData);
    if (index === -1) return;

    if (cellData.type === 'terminal') {
      terminalRouter.unregister(cellData.termId);
      await window.api.terminal.close(cellData.termId);
      cellData.term.dispose();
    } else if (cellData.type === 'editor') {
      if (cellData.saveTimeout) clearTimeout(cellData.saveTimeout);
      if (cellData.keyHandler) document.removeEventListener('keydown', cellData.keyHandler);
    }
    // pdf: no extra cleanup needed

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
  getRowLayout(count) {
    switch (count) {
      case 1: return [1];
      case 2: return [2];
      case 3: return [3];
      case 4: return [2, 2];
      case 5: return [3, 2];
      case 6: return [3, 3];
      case 7: return [4, 3];
      case 8: return [4, 4];
      default: return [count];
    }
  }

  updateGridLayout() {
    const grid = this.container.querySelector('.multi-terminal-grid');
    const count = this.cells.length;

    // Update counter
    const countEl = this.container.querySelector('.terminal-count');
    if (countEl) {
      countEl.textContent = count > 0 ? `${count}/${MAX_TERMINALS}` : '';
    }

    if (count === 0) return;

    // Detach all cells from DOM (keep references)
    this.cells.forEach(c => {
      if (c.cellEl.parentNode) c.cellEl.parentNode.removeChild(c.cellEl);
    });

    // Remove old rows and dividers
    grid.querySelectorAll('.workbench-row, .workbench-divider-h').forEach(el => el.remove());

    const rowLayout = this.getRowLayout(count);
    const rows = [];
    let cellIndex = 0;

    rowLayout.forEach((cellsInRow) => {
      const row = document.createElement('div');
      row.className = 'workbench-row';

      for (let i = 0; i < cellsInRow; i++) {
        const cell = this.cells[cellIndex];
        cell.cellEl.style.flex = '1';
        cell.cellEl.style.minWidth = '0';
        row.appendChild(cell.cellEl);
        cellIndex++;

        // Vertical divider between cells in same row
        if (i < cellsInRow - 1) {
          const nextCell = this.cells[cellIndex];
          const divider = document.createElement('div');
          divider.className = 'workbench-divider-v';
          this._setupResizeDrag(divider, cell.cellEl, nextCell.cellEl, 'vertical');
          row.appendChild(divider);
        }
      }

      rows.push(row);
    });

    // Append rows with horizontal dividers between them
    rows.forEach((row, i) => {
      grid.appendChild(row);
      if (i < rows.length - 1) {
        const divider = document.createElement('div');
        divider.className = 'workbench-divider-h';
        this._setupResizeDrag(divider, row, rows[i + 1], 'horizontal');
        grid.appendChild(divider);
      }
    });

    // Refit all terminals
    requestAnimationFrame(() => {
      this.cells.forEach(cell => {
        if (cell.type !== 'terminal') return;
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

  _setupResizeDrag(divider, elBefore, elAfter, direction) {
    let startPos, startBefore, startAfter;

    const onMouseMove = (e) => {
      const delta = direction === 'vertical'
        ? e.clientX - startPos
        : e.clientY - startPos;

      const newBefore = Math.max(80, startBefore + delta);
      const newAfter = Math.max(80, startAfter - delta);

      elBefore.style.flex = 'none';
      elAfter.style.flex = 'none';

      if (direction === 'vertical') {
        elBefore.style.width = `${newBefore}px`;
        elAfter.style.width = `${newAfter}px`;
      } else {
        elBefore.style.height = `${newBefore}px`;
        elAfter.style.height = `${newAfter}px`;
      }

      // Refit terminals in affected cells
      requestAnimationFrame(() => {
        this.cells.forEach(cell => {
          if (cell.type !== 'terminal') return;
          try { cell.fitAddon.fit(); } catch (e) { /* ignore */ }
        });
      });
    };

    const onMouseUp = () => {
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      // Final refit with resize notification
      requestAnimationFrame(() => {
        this.cells.forEach(cell => {
          if (cell.type !== 'terminal') return;
          try {
            cell.fitAddon.fit();
            const dims = cell.fitAddon.proposeDimensions();
            if (dims && dims.cols > 0 && dims.rows > 0) {
              window.api.terminal.resize(cell.termId, dims.cols, dims.rows);
            }
          } catch (e) { /* ignore */ }
        });
      });
    };

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      divider.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';

      startPos = direction === 'vertical' ? e.clientX : e.clientY;
      const rectBefore = elBefore.getBoundingClientRect();
      const rectAfter = elAfter.getBoundingClientRect();
      startBefore = direction === 'vertical' ? rectBefore.width : rectBefore.height;
      startAfter = direction === 'vertical' ? rectAfter.width : rectAfter.height;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
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
        if (cell.type !== 'terminal') return;
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

  // --- Settings change listener ---
  setupSettingsListener() {
    this._onSettingsChanged = () => {
      const settings = getTerminalSettings();
      const opts = buildTerminalOptions(settings);
      this.cells.forEach(cell => {
        if (cell.type !== 'terminal') return;
        cell.term.options.theme = opts.theme;
        cell.term.options.fontFamily = opts.fontFamily;
        cell.term.options.fontSize = opts.fontSize;
        cell.term.options.lineHeight = opts.lineHeight;
        cell.term.options.cursorStyle = opts.cursorStyle;
        cell.term.options.cursorBlink = opts.cursorBlink;
        try { cell.fitAddon.fit(); } catch (e) { /* ignore */ }
      });
    };
    store.on('terminal-settings-changed', this._onSettingsChanged);
  }

  // --- Cleanup ---
  destroy() {
    if (this._onSettingsChanged) store.off('terminal-settings-changed', this._onSettingsChanged);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.cells.forEach(cell => {
      if (cell.type === 'terminal') {
        terminalRouter.unregister(cell.termId);
        window.api.terminal.close(cell.termId);
        cell.term.dispose();
      } else if (cell.type === 'editor') {
        if (cell.saveTimeout) clearTimeout(cell.saveTimeout);
        if (cell.keyHandler) document.removeEventListener('keydown', cell.keyHandler);
      }
    });
    this.cells = [];
  }

  // --- Editor Cell ---
  async addEditorCell(filePath, projectId, options = {}) {
    // Prevent duplicate editor for same file
    const existing = this.cells.find(c => c.type === 'editor' && c.filePath === filePath);
    if (existing) {
      const fileName = filePath.split('/').pop();
      Toast.showCenter(`📝 ${fileName} is already open`);
      return;
    }

    if (this.cells.length >= MAX_TERMINALS) {
      Toast.show(`Maximum ${MAX_TERMINALS} cells allowed`, 'warning');
      return;
    }

    const fileName = filePath.split('/').pop();
    const isMarkdown = fileName.toLowerCase().endsWith('.md');
    const isRemote = !!options.remote;
    const title = `${isRemote ? '🌐' : '📝'} ${fileName}`;

    const grid = this.container.querySelector('.multi-terminal-grid');
    const emptyState = grid.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const cellEl = document.createElement('div');
    cellEl.className = 'terminal-cell';
    cellEl.innerHTML = `
      <div class="cell-titlebar" draggable="true">
        <div class="cell-title">
          <span class="truncate">${title}</span>
          <span class="cell-modified-badge" style="display:none;color:#eab308;font-size:0.625rem;">Modified</span>
        </div>
        <button class="cell-close" title="Close">✕</button>
      </div>
      <div class="cell-content-container">
        <div class="docs-editor-toolbar" style="padding:0.25rem 0.5rem;">
          ${isMarkdown ? '<button class="docs-toolbar-btn btn-toggle-preview" style="font-size:0.6875rem;">Preview</button>' : ''}
          <button class="docs-toolbar-btn btn-save" style="font-size:0.6875rem;">Save</button>
        </div>
        <textarea class="docs-textarea cell-editor-textarea" placeholder="Loading..." style="font-size:0.75rem;padding:0.5rem;"></textarea>
        ${isMarkdown ? '<div class="docs-preview markdown-body cell-editor-preview" style="display:none;padding:0.5rem;font-size:1rem;overflow-y:auto;"></div>' : ''}
      </div>
    `;

    const cellData = { type: 'editor', cellEl, title, filePath, projectId, remote: isRemote };

    // Load file content
    try {
      const result = isRemote
        ? await window.api.remote.readFile(projectId, filePath)
        : await window.api.files.read(filePath);
      if (result.error) throw new Error(result.error);
      const textarea = cellEl.querySelector('.cell-editor-textarea');
      textarea.value = result.content;
      cellData.originalContent = result.content;
    } catch (e) {
      const textarea = cellEl.querySelector('.cell-editor-textarea');
      textarea.value = `Error loading file: ${e.message}`;
    }

    // Modified badge tracking
    const textarea = cellEl.querySelector('.cell-editor-textarea');
    const modBadge = cellEl.querySelector('.cell-modified-badge');

    const checkModified = () => {
      const isModified = textarea.value !== cellData.originalContent;
      modBadge.style.display = isModified ? '' : 'none';
    };

    // Auto-save with debounce
    textarea.addEventListener('input', () => {
      checkModified();
      if (cellData.saveTimeout) clearTimeout(cellData.saveTimeout);
      cellData.saveTimeout = setTimeout(() => this._saveEditorCell(cellData), 3000);
    });

    // Save button
    cellEl.querySelector('.btn-save').addEventListener('click', () => {
      this._saveEditorCell(cellData);
    });

    // Cmd+S handler
    const keyHandler = (e) => {
      if (e.metaKey && e.key === 's' && document.activeElement === textarea) {
        e.preventDefault();
        this._saveEditorCell(cellData);
      }
    };
    document.addEventListener('keydown', keyHandler);
    cellData.keyHandler = keyHandler;

    // Markdown preview toggle
    if (isMarkdown) {
      const previewBtn = cellEl.querySelector('.btn-toggle-preview');
      const preview = cellEl.querySelector('.cell-editor-preview');
      let showingPreview = true;

      // Default to preview mode
      preview.innerHTML = window.marked.parse(textarea.value);
      preview.style.display = '';
      textarea.style.display = 'none';
      previewBtn.textContent = 'Edit';
      previewBtn.classList.add('active');

      previewBtn.addEventListener('click', () => {
        showingPreview = !showingPreview;
        if (showingPreview) {
          preview.innerHTML = window.marked.parse(textarea.value);
          preview.style.display = '';
          textarea.style.display = 'none';
          previewBtn.textContent = 'Edit';
          previewBtn.classList.add('active');
        } else {
          preview.style.display = 'none';
          textarea.style.display = '';
          previewBtn.textContent = 'Preview';
          previewBtn.classList.remove('active');
        }
      });
    }

    // Close button
    cellEl.querySelector('.cell-close').addEventListener('click', () => {
      this.removeCell(cellData);
    });

    this.cells.push(cellData);
    const cellIndex = this.cells.length - 1;
    this.setupCellDrag(cellEl, cellIndex);
    grid.appendChild(cellEl);
    this.updateGridLayout();
  }

  async _saveEditorCell(cellData) {
    if (cellData.saveTimeout) clearTimeout(cellData.saveTimeout);
    const textarea = cellData.cellEl.querySelector('.cell-editor-textarea');
    if (!textarea) return;

    try {
      const result = cellData.remote
        ? await window.api.remote.writeFile(cellData.projectId, cellData.filePath, textarea.value)
        : await window.api.files.write(cellData.filePath, textarea.value);
      if (result && result.error) throw new Error(result.error);
      cellData.originalContent = textarea.value;
      const modBadge = cellData.cellEl.querySelector('.cell-modified-badge');
      if (modBadge) modBadge.style.display = 'none';
      Toast.show('File saved', 'success', 1500);
    } catch (e) {
      Toast.show(`Save failed: ${e.message}`, 'error');
    }
  }

  // --- PDF Cell ---
  async addPdfCell(filePath, projectId, options = {}) {
    const existing = this.cells.find(c => c.type === 'pdf' && c.filePath === filePath);
    if (existing) {
      const fileName = filePath.split('/').pop();
      Toast.showCenter(`📕 ${fileName} is already open`);
      return;
    }

    if (this.cells.length >= MAX_TERMINALS) {
      Toast.show(`Maximum ${MAX_TERMINALS} cells allowed`, 'warning');
      return;
    }

    const fileName = filePath.split('/').pop();
    const title = `📕 ${fileName}`;

    const grid = this.container.querySelector('.multi-terminal-grid');
    const emptyState = grid.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const cellEl = document.createElement('div');
    cellEl.className = 'terminal-cell';
    cellEl.innerHTML = `
      <div class="cell-titlebar" draggable="true">
        <div class="cell-title">
          <span class="truncate">${title}</span>
          <span class="cell-page-info" style="font-size:0.625rem;color:var(--color-text-secondary);margin-left:auto;"></span>
        </div>
        <button class="cell-close" title="Close">✕</button>
      </div>
      <div class="cell-content-container" style="overflow-y:auto;align-items:center;padding:4px;gap:4px;">
        <div style="color:var(--color-text-secondary);font-size:0.75rem;padding:1rem;text-align:center;">Loading PDF...</div>
      </div>
    `;

    const cellData = { type: 'pdf', cellEl, title, filePath };

    // Close button
    cellEl.querySelector('.cell-close').addEventListener('click', () => {
      this.removeCell(cellData);
    });

    this.cells.push(cellData);
    const cellIndex = this.cells.length - 1;
    this.setupCellDrag(cellEl, cellIndex);
    grid.appendChild(cellEl);
    this.updateGridLayout();

    // Load PDF
    try {
      const isRemote = !!options.remote;
      const result = isRemote
        ? await window.api.remote.readBinary(projectId, filePath)
        : await window.api.files.readBinary(filePath);
      if (result.error) throw new Error(result.error);

      const raw = atob(result.data);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const contentEl = cellEl.querySelector('.cell-content-container');
      contentEl.innerHTML = '';

      const pageInfo = cellEl.querySelector('.cell-page-info');
      if (pageInfo) pageInfo.textContent = `${pdf.numPages} pages`;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.maxWidth = '100%';
        canvas.style.borderRadius = '2px';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        contentEl.appendChild(canvas);
      }
    } catch (e) {
      const contentEl = cellEl.querySelector('.cell-content-container');
      contentEl.innerHTML = `<div style="color:#f87171;font-size:0.75rem;padding:1rem;">Failed to load PDF: ${e.message}</div>`;
    }
  }
}
