// App - SPA router & app initialization
import { store } from './store/store.js';
import { Sidebar } from './components/common/Sidebar.js';
import { DashboardView } from './components/dashboard/DashboardView.js';
import { ProjectDetail } from './components/project/ProjectDetail.js';
import { ProjectForm } from './components/project/ProjectForm.js';
import { BottomTerminalPanel } from './components/terminal/BottomTerminalPanel.js';

class App {
  constructor() {
    this.container = document.getElementById('app');
    this.sidebar = new Sidebar();
    this.mainContent = null;
    this.bottomPanel = null;
    this.multiTerminalView = null; // cached instance
    this.init();
  }

  async init() {
    this.renderLayout();
    this.setupRouting();
    await this.loadData();
    this.navigate('dashboard');
  }

  renderLayout() {
    this.container.innerHTML = '';
    const layout = document.createElement('div');
    layout.className = 'flex h-screen';

    // Sidebar
    this.sidebar.onNavigate = (view, params) => this.navigate(view, params);
    layout.appendChild(this.sidebar.render());

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

  async loadData() {
    try {
      const projects = await window.api.projects.list();
      store.setState({ projects });
    } catch (e) {
      console.error('Failed to load initial data:', e);
    }
  }

  navigate(view, params = {}) {
    store.setState({ currentView: view, ...params });

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
        this.mainContent.appendChild(dashboard.render());
        break;
      }
      case 'project-detail': {
        const detail = new ProjectDetail(params.projectId || store.getState().selectedProjectId);
        detail.onNavigate = (v, p) => this.navigate(v, p);
        this.mainContent.appendChild(detail.render());
        break;
      }
      case 'kanban': {
        this.loadKanban();
        break;
      }
      case 'terminal': {
        this.loadMultiTerminal();
        break;
      }
      default: {
        const dashboard = new DashboardView();
        dashboard.onNavigate = (v, p) => this.navigate(v, p);
        this.mainContent.appendChild(dashboard.render());
      }
    }
  }

  async loadMultiTerminal() {
    try {
      // Reuse cached instance — don't destroy terminals on navigation
      if (this.multiTerminalView && this.multiTerminalView.container) {
        this.multiTerminalView.container.style.display = '';
        if (!this.multiTerminalView.container.parentNode) {
          this.mainContent.appendChild(this.multiTerminalView.container);
        }
        // Refit all terminals after re-show
        this.multiTerminalView.updateGridLayout();
        return;
      }

      const { MultiTerminalView } = await import('./components/terminal/MultiTerminalView.js');
      this.multiTerminalView = new MultiTerminalView();
      this.mainContent.appendChild(this.multiTerminalView.render());
    } catch (e) {
      this.mainContent.innerHTML = `
        <div class="empty-state h-full">
          <div class="empty-state-icon">🖥</div>
          <p class="text-slate-400">Failed to load multi terminal</p>
          <p class="text-sm text-slate-500 mt-1">${e.message || ''}</p>
        </div>
      `;
    }
  }

  async loadKanban() {
    try {
      const { KanbanBoard } = await import('./components/kanban/KanbanBoard.js');
      const kanban = new KanbanBoard();
      kanban.onNavigate = (v, p) => this.navigate(v, p);
      this.mainContent.appendChild(kanban.render());
    } catch (e) {
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
