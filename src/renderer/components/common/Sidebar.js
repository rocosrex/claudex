// Sidebar - Left navigation panel
import { store } from '../../store/store.js';

export class Sidebar {
  constructor() {
    this.container = null;
    this.onNavigate = null; // set by App
  }

  render() {
    const el = document.createElement('aside');
    el.className = 'sidebar';
    el.innerHTML = `
      <div class="titlebar-drag pt-10 px-4 pb-2">
        <div class="flex items-center gap-2 titlebar-no-drag">
          <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">C</div>
          <h1 class="text-lg font-semibold text-slate-100">Claudex</h1>
        </div>
      </div>

      <div class="px-3 py-2">
        <input type="text" class="sidebar-search input text-sm" placeholder="Search..." />
      </div>

      <nav class="px-3 py-1 flex flex-col gap-0.5">
        <div class="sidebar-nav-item active" data-view="dashboard">
          <span>📊</span><span>Dashboard</span>
        </div>
        <div class="sidebar-nav-item" data-view="kanban">
          <span>📋</span><span>Kanban Board</span>
        </div>
        <div class="sidebar-nav-item" data-view="terminal">
          <span>🖥</span><span>Terminal</span>
        </div>
      </nav>

      <div class="px-3 py-2 mt-2">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-slate-500 uppercase tracking-wide">Projects</span>
          <span class="sidebar-project-count text-xs text-slate-500"></span>
        </div>
        <div class="sidebar-projects flex flex-col gap-0.5 overflow-y-auto" style="max-height: calc(100vh - 320px);"></div>
      </div>

      <div class="mt-auto px-3 py-3 border-t border-slate-700 flex flex-col gap-2">
        <button class="btn-toggle-bottom-panel w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all text-sm font-medium"
                title="하단 터미널 (⌘+\`)">
          <span>⌨️</span><span>Bottom Terminal</span>
        </button>
        <button class="btn-new-project w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 transition-all text-sm font-medium">
          <span>+</span><span>New Project</span>
        </button>
      </div>
    `;

    this.container = el;
    this.setupEvents();
    this.listenToStore();
    this.loadProjects();

    return el;
  }

  setupEvents() {
    // Navigation items
    this.container.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (this.onNavigate) this.onNavigate(view);
        this.setActiveNav(view);
      });
    });

    // New project button
    this.container.querySelector('.btn-new-project').addEventListener('click', () => {
      store.emit('open-project-form', { mode: 'create' });
    });

    // Bottom terminal panel toggle
    this.container.querySelector('.btn-toggle-bottom-panel').addEventListener('click', () => {
      store.emit('toggle-bottom-panel');
    });

    // Search
    this.container.querySelector('.sidebar-search').addEventListener('input', (e) => {
      store.setState({ searchQuery: e.target.value });
    });
  }

  listenToStore() {
    store.on('change:projects', () => this.renderProjects());
    store.on('change:selectedProjectId', () => this.renderProjects());
    store.on('change:currentView', (view) => this.setActiveNav(view));
  }

  async loadProjects() {
    try {
      const projects = await window.api.projects.list();
      store.setState({ projects });
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }

  renderProjects() {
    const listEl = this.container.querySelector('.sidebar-projects');
    const countEl = this.container.querySelector('.sidebar-project-count');
    const { projects, selectedProjectId, searchQuery } = store.getState();

    let filtered = projects;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = projects.filter(p =>
        p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
      );
    }

    const activeProjects = filtered.filter(p => p.status !== 'archived');
    countEl.textContent = `${activeProjects.length}`;

    listEl.innerHTML = '';
    activeProjects.forEach(p => {
      const item = document.createElement('div');
      item.className = `sidebar-project-item ${p.id === selectedProjectId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="project-dot" style="background: ${p.color || '#6366f1'}"></span>
        <span class="truncate flex-1">${p.icon || ''} ${p.name}</span>
        <span class="badge badge-${p.status} text-[10px]">${this.statusLabel(p.status)}</span>
      `;
      item.addEventListener('click', () => {
        if (this.onNavigate) this.onNavigate('project-detail', { projectId: p.id });
      });
      listEl.appendChild(item);
    });
  }

  setActiveNav(view) {
    this.container.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
  }

  statusLabel(status) {
    const labels = { active: 'Active', paused: 'Paused', completed: 'Done', archived: 'Archived' };
    return labels[status] || status;
  }
}
