// App - SPA router & app initialization
import { store } from './store/store.js';
import { Sidebar } from './components/common/Sidebar.js';
import { DashboardView } from './components/dashboard/DashboardView.js';
import { ProjectDetail } from './components/project/ProjectDetail.js';
import { ProjectForm } from './components/project/ProjectForm.js';
import { BottomTerminalPanel } from './components/terminal/BottomTerminalPanel.js';
import { Toast } from './components/common/Toast.js';
import { sttService } from './utils/stt-service.js';

class App {
  constructor() {
    this.container = document.getElementById('app');
    this.sidebar = new Sidebar();
    this.mainContent = null;
    this.bottomPanel = null;
    this.multiTerminalView = null; // cached instance
    this.currentViewInstance = null;
    this.currentDocsEditor = null;
    this.currentSTT = null;
    this._navigationToken = 0;
    this.init();
  }

  async init() {
    this.renderLayout();
    this.setupRouting();
    this.setupUpdater();
    await this.loadData();
    this.navigate('dashboard');
    this.startDiagHeartbeat();
  }

  startDiagHeartbeat() {
    const sendHeartbeat = window.api?.diag?.heartbeat;
    if (typeof sendHeartbeat !== 'function') return;

    const tick = () => {
      try {
        const state = store.getState ? store.getState() : {};
        const workbenchCells = this.multiTerminalView?.cells?.length ?? 0;
        const mem = (typeof performance !== 'undefined' && performance.memory) || {};
        const toMB = (b) => (typeof b === 'number' ? +(b / 1048576).toFixed(1) : null);
        sendHeartbeat({
          route: state.currentView || null,
          workbenchCells,
          bottomPanelVisible: !!this.bottomPanel?.visible,
          jsHeapUsedMB: toMB(mem.usedJSHeapSize),
          jsHeapTotalMB: toMB(mem.totalJSHeapSize),
          jsHeapLimitMB: toMB(mem.jsHeapSizeLimit),
        });
      } catch (_) {
        // heartbeat must never crash the renderer
      }
    };

    tick();
    setInterval(tick, 10_000);
  }

  renderLayout() {
    this.container.innerHTML = '';
    const layout = document.createElement('div');
    layout.className = 'flex h-screen';

    // Sidebar
    this.sidebar.onNavigate = (view, params) => this.navigate(view, params);
    const sidebarEl = this.sidebar.render();
    const savedWidth = localStorage.getItem('sidebar-width');
    if (savedWidth) {
      sidebarEl.style.width = `${savedWidth}px`;
      sidebarEl.style.minWidth = `${savedWidth}px`;
      document.documentElement.style.setProperty('--sidebar-width', `${savedWidth}px`);
    }
    layout.appendChild(sidebarEl);

    // Sidebar resize divider
    const divider = document.createElement('div');
    divider.className = 'sidebar-resize-divider';
    layout.appendChild(divider);
    this.setupSidebarResize(divider, sidebarEl);

    // Main content wrapper (titlebar + content)
    const mainWrapper = document.createElement('div');
    mainWrapper.className = 'flex-1 flex flex-col overflow-hidden';

    // Titlebar drag area for main content
    const titlebar = document.createElement('div');
    titlebar.className = 'titlebar-drag h-10 flex-shrink-0 bg-slate-900';
    mainWrapper.appendChild(titlebar);

    // Main content area
    const main = document.createElement('main');
    main.id = 'main-content';
    main.className = 'flex-1 overflow-hidden bg-slate-900';
    mainWrapper.appendChild(main);

    layout.appendChild(mainWrapper);

    this.container.appendChild(layout);
    this.mainContent = main;

    // Bottom terminal panel (persistent across navigation)
    this.bottomPanel = new BottomTerminalPanel();
    mainWrapper.appendChild(this.bottomPanel.render());
  }

  setupSidebarResize(divider, sidebarEl) {
    let startX, startWidth;

    const onMouseMove = (e) => {
      const newWidth = Math.max(180, Math.min(480, startWidth + (e.clientX - startX)));
      sidebarEl.style.width = `${newWidth}px`;
      sidebarEl.style.minWidth = `${newWidth}px`;
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    };

    const onMouseUp = () => {
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem('sidebar-width', sidebarEl.getBoundingClientRect().width);
    };

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = sidebarEl.getBoundingClientRect().width;
      divider.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  setupRouting() {
    // Listen for navigation events from store
    store.on('navigate', ({ view, params }) => this.navigate(view, params));

    // Listen for bottom panel toggle
    store.on('toggle-bottom-panel', () => {
      if (this.bottomPanel) this.bottomPanel.toggle();
    });

    // Cmd+` keyboard shortcut for bottom panel
    document.addEventListener('keydown', (e) => {
      if (e.metaKey && e.key === '`') {
        e.preventDefault();
        if (this.bottomPanel) this.bottomPanel.toggle();
      }
    });

    // PgDn double-tap → STT toggle (fallback for non-xterm contexts)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'PageDown') {
        const { currentView } = store.getState();
        if (currentView === 'terminal' || this.bottomPanel?.visible) {
          if (sttService.handlePgDnKey()) {
            e.preventDefault();
          }
        }
      }
    });

    // Listen for project form open
    store.on('open-project-form', ({ mode, project }) => {
      const form = new ProjectForm({
        mode,
        project,
        onSaved: () => {
          // Refresh current view
          const { currentView } = store.getState();
          this.navigate(currentView, store.getState());
        },
      });
      form.open();
    });
  }

  setupUpdater() {
    if (!window.api?.updater) return;

    let lastPercent = 0;

    window.api.updater.onStatus((data) => {
      switch (data.status) {
        case 'available':
          Toast.show(`🔄 New version v${data.version} downloading...`, 'info', 5000);
          break;
        case 'downloading':
          if (data.percent - lastPercent >= 25) {
            lastPercent = data.percent;
            Toast.show(`⬇️ Downloading update... ${data.percent}%`, 'info', 3000);
          }
          break;
        case 'downloaded': {
          let countdown = 3;
          const toast = Toast.show(`✅ v${data.version} ready! Restarting in ${countdown}s...`, 'success', 0);
          toast.style.cursor = 'pointer';
          toast.addEventListener('click', () => window.api.updater.install());
          const timer = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
              clearInterval(timer);
              window.api.updater.install();
            } else {
              toast.textContent = `✅ v${data.version} ready! Restarting in ${countdown}s...`;
            }
          }, 1000);
          break;
        }
      }
    });
  }

  async loadData() {
    try {
      const projects = await window.api.projects.list();
      store.setState({ projects });
    } catch (e) {
      console.error('Failed to load initial data:', e);
    }
  }

  destroyCurrentView() {
    try {
      this.currentViewInstance?.destroy?.();
    } catch (e) {
      console.warn('Failed to destroy current view:', e);
    }
    this.currentViewInstance = null;
    this.currentDocsEditor = null;
    this.currentSTT = null;
  }

  isCurrentNavigation(token, view) {
    return token === this._navigationToken && store.getState().currentView === view;
  }

  async openRemoteFileInWorkbench(view, params) {
    const workbench = await this.navigate('terminal');
    const navigationToken = this._navigationToken;
    if (!workbench || !this.isCurrentNavigation(navigationToken, 'terminal')) return;

    if (view === 'docs-editor') {
      workbench.addEditorCell(params.filePath, params.projectId, { remote: true });
    } else {
      workbench.addPdfCell(params.filePath, params.projectId, { remote: true });
    }
  }

  async navigate(view, params = {}) {
    // Remote files: always open in Workbench editor cells
    if (params.remote && (view === 'docs-editor' || view === 'pdf-viewer') && params.filePath) {
      return this.openRemoteFileInWorkbench(view, params);
    }

    // Intercept file opens when MultiTerminalView is active
    if (this.multiTerminalView && this.multiTerminalView.container &&
        this.multiTerminalView.container.style.display !== 'none') {
      if (view === 'docs-editor' && params.filePath) {
        this.multiTerminalView.addEditorCell(params.filePath, params.projectId, { remote: params.remote });
        return;
      }
      if (view === 'pdf-viewer' && params.filePath) {
        this.multiTerminalView.addPdfCell(params.filePath, params.projectId, { remote: params.remote });
        return;
      }
    }

    store.setState({ currentView: view, ...params });
    const navigationToken = ++this._navigationToken;
    this.destroyCurrentView();

    // Hide cached multi-terminal view (don't destroy)
    if (this.multiTerminalView && this.multiTerminalView.container) {
      this.multiTerminalView.container.style.display = 'none';
    }

    // Clear non-terminal content
    Array.from(this.mainContent.children).forEach(child => {
      if (this.multiTerminalView && child === this.multiTerminalView.container) return;
      child.remove();
    });

    switch (view) {
      case 'dashboard': {
        const dashboard = new DashboardView();
        dashboard.onNavigate = (v, p) => this.navigate(v, p);
        this.currentViewInstance = dashboard;
        this.mainContent.appendChild(dashboard.render());
        break;
      }
      case 'project-detail': {
        const detail = new ProjectDetail(params.projectId || store.getState().selectedProjectId);
        detail.onNavigate = (v, p) => this.navigate(v, p);
        this.currentViewInstance = detail;
        this.mainContent.appendChild(detail.render());
        break;
      }
      case 'kanban': {
        this.loadKanban(navigationToken);
        break;
      }
      case 'terminal': {
        this.currentViewInstance = null; // Workbench is intentionally persistent
        return this.loadMultiTerminal(navigationToken);
      }
      case 'stt': {
        this.loadSTT(navigationToken);
        break;
      }
      case 'docs-editor': {
        this.loadDocsEditor(params, navigationToken);
        break;
      }
      case 'pdf-viewer': {
        this.loadPdfViewer(params, navigationToken);
        break;
      }
      default: {
        const dashboard = new DashboardView();
        dashboard.onNavigate = (v, p) => this.navigate(v, p);
        this.currentViewInstance = dashboard;
        this.mainContent.appendChild(dashboard.render());
      }
    }
  }

  async loadMultiTerminal(navigationToken = this._navigationToken) {
    try {
      if (!this.isCurrentNavigation(navigationToken, 'terminal')) return null;
      // Reuse cached instance — don't destroy terminals on navigation
      if (this.multiTerminalView && this.multiTerminalView.container) {
        this.multiTerminalView.container.style.display = '';
        if (!this.multiTerminalView.container.parentNode) {
          this.mainContent.appendChild(this.multiTerminalView.container);
        }
        // Refit all terminals after re-show
        this.multiTerminalView.updateGridLayout();
        return this.multiTerminalView;
      }

      const { MultiTerminalView } = await import('./components/terminal/MultiTerminalView.js');
      if (!this.isCurrentNavigation(navigationToken, 'terminal')) return null;
      this.multiTerminalView = new MultiTerminalView();
      this.mainContent.appendChild(this.multiTerminalView.render());
      return this.multiTerminalView;
    } catch (e) {
      if (!this.isCurrentNavigation(navigationToken, 'terminal')) return null;
      this.mainContent.innerHTML = `
        <div class="empty-state h-full">
          <div class="empty-state-icon">🖥</div>
          <p class="text-slate-400">Failed to load multi terminal</p>
          <p class="text-sm text-slate-500 mt-1">${e.message || ''}</p>
        </div>
      `;
      return null;
    }
  }

  async loadDocsEditor(params, navigationToken = this._navigationToken) {
    try {
      const { DocsEditorView } = await import('./components/docs/DocsEditorView.js');
      if (!this.isCurrentNavigation(navigationToken, 'docs-editor')) return;
      const editor = new DocsEditorView({
        projectId: params.projectId,
        filePath: params.filePath,
        projectPath: params.projectPath,
      });
      editor.onClose = () => this.navigate('project-detail', { projectId: params.projectId });
      this.currentDocsEditor = editor;
      this.currentViewInstance = editor;
      this.mainContent.appendChild(editor.render());
    } catch (e) {
      if (!this.isCurrentNavigation(navigationToken, 'docs-editor')) return;
      this.mainContent.innerHTML = `
        <div class="empty-state h-full">
          <div class="empty-state-icon">📄</div>
          <p class="text-slate-400">Failed to load docs editor</p>
          <p class="text-sm text-slate-500 mt-1">${e.message || ''}</p>
        </div>
      `;
    }
  }

  async loadPdfViewer(params, navigationToken = this._navigationToken) {
    try {
      const fileName = params.filePath.split('/').pop();
      const result = params.remote
        ? await window.api.remote.readBinary(params.projectId, params.filePath)
        : await window.api.files.readBinary(params.filePath);
      if (!this.isCurrentNavigation(navigationToken, 'pdf-viewer')) return;
      if (result.error) throw new Error(result.error);

      const wrapper = document.createElement('div');
      wrapper.className = 'flex flex-col h-full overflow-hidden';
      wrapper.innerHTML = `
        <div class="docs-editor-toolbar">
          <span class="docs-editor-filename">📕 ${fileName}</span>
          <button class="docs-toolbar-btn btn-pdf-close">✕ Close</button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 bg-slate-900" style="display:flex;flex-direction:column;align-items:center;gap:8px;"></div>
      `;

      wrapper.querySelector('.btn-pdf-close').addEventListener('click', () => {
        if (params.projectId) this.navigate('project-detail', { projectId: params.projectId });
        else this.navigate('dashboard');
      });

      const pdfView = {
        destroy: () => wrapper.remove(),
      };
      this.currentViewInstance = pdfView;
      this.mainContent.appendChild(wrapper);

      const container = wrapper.querySelector('.flex-1');
      const raw = atob(result.data);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      if (!this.isCurrentNavigation(navigationToken, 'pdf-viewer')) {
        pdfView.destroy();
        return;
      }
      for (let i = 1; i <= pdf.numPages; i++) {
        if (!this.isCurrentNavigation(navigationToken, 'pdf-viewer')) {
          pdfView.destroy();
          return;
        }
        const page = await pdf.getPage(i);
        if (!this.isCurrentNavigation(navigationToken, 'pdf-viewer')) {
          pdfView.destroy();
          return;
        }
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.maxWidth = '100%';
        canvas.style.borderRadius = '4px';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if (!this.isCurrentNavigation(navigationToken, 'pdf-viewer')) {
          pdfView.destroy();
          return;
        }
        container.appendChild(canvas);
      }
    } catch (e) {
      if (!this.isCurrentNavigation(navigationToken, 'pdf-viewer')) return;
      this.mainContent.innerHTML = `
        <div class="empty-state h-full">
          <div class="empty-state-icon">📕</div>
          <p class="text-slate-400">Failed to load PDF viewer</p>
          <p class="text-sm text-slate-500 mt-1">${e.message || ''}</p>
        </div>
      `;
    }
  }

  async loadSTT(navigationToken = this._navigationToken) {
    try {
      const { STTRecorder } = await import('./components/stt/STTRecorder.js');
      if (!this.isCurrentNavigation(navigationToken, 'stt')) return;
      this.currentSTT = new STTRecorder();
      this.currentViewInstance = this.currentSTT;
      this.mainContent.appendChild(this.currentSTT.render());
    } catch (e) {
      if (!this.isCurrentNavigation(navigationToken, 'stt')) return;
      this.mainContent.innerHTML = `
        <div class="empty-state h-full">
          <div class="empty-state-icon">🎙️</div>
          <p class="text-slate-400">Failed to load STT</p>
          <p class="text-sm text-slate-500 mt-1">${e.message || ''}</p>
        </div>
      `;
    }
  }

  async loadKanban(navigationToken = this._navigationToken) {
    try {
      const { KanbanBoard } = await import('./components/kanban/KanbanBoard.js');
      if (!this.isCurrentNavigation(navigationToken, 'kanban')) return;
      const kanban = new KanbanBoard();
      kanban.onNavigate = (v, p) => this.navigate(v, p);
      this.currentViewInstance = kanban;
      this.mainContent.appendChild(kanban.render());
    } catch (e) {
      if (!this.isCurrentNavigation(navigationToken, 'kanban')) return;
      this.mainContent.innerHTML = `
        <div class="empty-state h-full">
          <div class="empty-state-icon">📋</div>
          <p class="text-slate-400">Failed to load Kanban Board</p>
          <p class="text-sm text-slate-500 mt-1">${e.message || ''}</p>
        </div>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
