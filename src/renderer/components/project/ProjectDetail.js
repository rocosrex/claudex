// ProjectDetail - Project detail page with tabs
import { store } from '../../store/store.js';
import { formatDate, formatRelativeTime } from '../../utils/format.js';
import { Toast } from '../common/Toast.js';
import { Modal } from '../common/Modal.js';
import { ProjectForm } from './ProjectForm.js';

export class ProjectDetail {
  constructor(projectId) {
    this.projectId = projectId;
    this.project = null;
    this.container = null;
    this.activeTab = 'overview';
    this.onNavigate = null; // set by App
  }

  render() {
    const el = document.createElement('div');
    el.className = 'flex flex-col h-full';
    el.innerHTML = `
      <div class="detail-header p-6 pb-0"></div>
      <div class="tab-nav px-6"></div>
      <div class="tab-content flex-1 overflow-y-auto p-6"></div>
    `;

    this.container = el;
    this.loadProject();
    return el;
  }

  async loadProject() {
    try {
      const projects = store.getState().projects;
      this.project = projects.find(p => p.id === this.projectId);

      if (!this.project) {
        const allProjects = await window.api.projects.list();
        store.setState({ projects: allProjects });
        this.project = allProjects.find(p => p.id === this.projectId);
      }

      if (!this.project) {
        this.container.querySelector('.detail-header').innerHTML = `
          <div class="empty-state"><p class="text-slate-400">Project not found</p></div>
        `;
        return;
      }

      store.setState({ selectedProjectId: this.projectId });
      this.renderHeader();
      this.renderTabs();
      this.showTab(this.activeTab);
    } catch (e) {
      console.error('Failed to load project:', e);
      Toast.show('Failed to load project', 'error');
    }
  }

  renderHeader() {
    const p = this.project;
    const header = this.container.querySelector('.detail-header');
    header.innerHTML = `
      <div class="flex items-center gap-4 mb-4">
        <button class="btn-back text-slate-400 hover:text-slate-200 text-sm">&larr; Back</button>
      </div>
      <div class="flex items-center gap-4 mb-4">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style="background: ${p.color || '#6366f1'}20;">
          ${p.icon || '📁'}
        </div>
        <div class="flex-1">
          <h1 class="text-xl font-bold text-slate-100">${p.name}</h1>
          <div class="flex items-center gap-2 mt-1">
            <span class="badge badge-${p.status}">${this.statusLabel(p.status)}</span>
            ${p.path ? `<span class="text-xs text-slate-500">${p.path}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-edit btn-secondary text-sm">Edit</button>
          <button class="btn-terminal btn-secondary text-sm">Terminal</button>
          <button class="btn-claude btn-primary text-sm">▶ Claude Code</button>
          <button class="btn-delete text-sm px-3 py-1.5 rounded-lg bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-all">Delete</button>
        </div>
      </div>
      ${p.description ? `<div class="markdown-body mb-4 overflow-y-auto pr-2" style="max-height: 480px;">${window.marked.parse(p.description)}</div>` : ''}
    `;

    // Back button
    header.querySelector('.btn-back').addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('dashboard');
    });

    // Edit button
    header.querySelector('.btn-edit').addEventListener('click', () => {
      const form = new ProjectForm({
        mode: 'edit',
        project: this.project,
        onSaved: () => this.loadProject(),
      });
      form.open();
    });

    // Terminal button
    header.querySelector('.btn-terminal').addEventListener('click', () => {
      this.showTab('terminal');
    });

    // Claude Code button
    header.querySelector('.btn-claude').addEventListener('click', () => {
      if (this.project.path) {
        window.api.terminal.openExternal(this.project.path, true);
        Toast.show('Running Claude Code in Terminal.app', 'info');
      } else {
        Toast.show('Project path is not set', 'warning');
      }
    });

    // Delete button
    header.querySelector('.btn-delete').addEventListener('click', () => {
      const modal = new Modal({
        title: 'Delete Project',
        content: `<p class="text-slate-300">Are you sure you want to delete "<strong>${this.project.name}</strong>"?</p><p class="text-sm text-slate-500 mt-2">All todos, notes, and timer records will be permanently deleted. This action cannot be undone.</p>`,
        confirmText: 'Delete',
        onConfirm: async () => {
          try {
            await window.api.projects.delete(this.project.id);
            const projects = await window.api.projects.list();
            store.setState({ projects, selectedProjectId: null });
            modal.close();
            Toast.show('Project deleted', 'info');
            if (this.onNavigate) this.onNavigate('dashboard');
          } catch (e) {
            Toast.show('Failed to delete project', 'error');
          }
        },
      });
      modal.open();
      // Style confirm button red
      const confirmBtn = modal.overlay.querySelector('.modal-confirm-btn');
      if (confirmBtn) {
        confirmBtn.className = 'text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all';
      }
    });
  }

  renderTabs() {
    const tabNav = this.container.querySelector('.tab-nav');
    const tabs = [
      { id: 'overview', label: 'Overview' },
      { id: 'todos', label: 'Todos' },
      { id: 'notes', label: 'Notes' },
      { id: 'timer', label: 'Timer' },
      { id: 'terminal', label: 'Terminal' },
    ];

    tabNav.innerHTML = '';
    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = `tab-btn ${tab.id === this.activeTab ? 'active' : ''}`;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => this.showTab(tab.id));
      tabNav.appendChild(btn);
    });
  }

  showTab(tabId) {
    this.activeTab = tabId;
    const tabNav = this.container.querySelector('.tab-nav');
    tabNav.querySelectorAll('.tab-btn').forEach((btn, i) => {
      const tabs = ['overview', 'todos', 'notes', 'timer', 'terminal'];
      btn.classList.toggle('active', tabs[i] === tabId);
    });

    const content = this.container.querySelector('.tab-content');

    // Cache terminal tab to prevent re-creation
    if (tabId === 'terminal' && this._terminalEl) {
      content.innerHTML = '';
      content.appendChild(this._terminalEl);
      return;
    }

    // Detach from DOM when leaving terminal tab (do not destroy)
    if (this._terminalEl && this._terminalEl.parentNode === content) {
      content.removeChild(this._terminalEl);
    }

    content.innerHTML = '';

    switch (tabId) {
      case 'overview':
        this.renderOverview(content);
        break;
      case 'todos':
        this.renderTabPlaceholder(content, 'todos', 'TodoList');
        break;
      case 'notes':
        this.renderTabPlaceholder(content, 'notes', 'NoteList');
        break;
      case 'timer':
        this.renderTabPlaceholder(content, 'timer', 'TimeTracker');
        break;
      case 'terminal':
        this.renderTerminalTab(content);
        break;
    }
  }

  async renderTerminalTab(container) {
    try {
      const { TerminalPanel } = await import('../terminal/TerminalPanel.js');
      const isSSH = !!this.project.ssh_host;
      this._terminalPanel = new TerminalPanel(this.projectId, this.project.path, { isSSH, project: this.project });
      this._terminalEl = this._terminalPanel.render();
      container.appendChild(this._terminalEl);
    } catch (e) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔧</div>
          <p class="text-slate-400">Failed to load TerminalPanel</p>
          <p class="text-sm text-slate-500 mt-1">${e.message || ''}</p>
        </div>
      `;
    }
  }

  async renderOverview(container) {
    const p = this.project;
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-6">
        <div>
          <h3 class="text-sm font-semibold text-slate-300 mb-3">Project Info</h3>
          <div class="card-static p-4 space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-slate-400">Status</span>
              <span class="badge badge-${p.status}">${this.statusLabel(p.status)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-400">Kanban Stage</span>
              <span class="text-slate-200">${this.kanbanLabel(p.kanban_stage)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-400">Created</span>
              <span class="text-slate-200">${formatDate(p.created_at)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-400">Updated</span>
              <span class="text-slate-200">${formatRelativeTime(p.updated_at)}</span>
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-sm font-semibold text-slate-300 mb-3">Quick Actions</h3>
          <div class="card-static p-4 space-y-2">
            <button class="btn-overview-terminal w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700 text-sm text-slate-300 transition-all">
              <span>🖥</span> Embedded Terminal
            </button>
            <button class="btn-overview-external w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700 text-sm text-slate-300 transition-all">
              <span>🔗</span> Open in Terminal.app
            </button>
            <button class="btn-overview-claude w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700 text-sm text-indigo-400 font-medium transition-all">
              <span>▶</span> Run Claude Code
            </button>
          </div>
        </div>
      </div>

      <div class="mt-6">
        <h3 class="text-sm font-semibold text-slate-300 mb-3">Recent Activity</h3>
        <div class="overview-activity card-static p-4"></div>
      </div>
    `;

    // Quick action buttons
    container.querySelector('.btn-overview-terminal').addEventListener('click', () => {
      this.showTab('terminal');
    });

    container.querySelector('.btn-overview-external').addEventListener('click', () => {
      if (p.path) {
        window.api.terminal.openExternal(p.path, false);
        Toast.show('Opened Terminal.app', 'info');
      } else {
        Toast.show('Project path is not set', 'warning');
      }
    });

    container.querySelector('.btn-overview-claude').addEventListener('click', () => {
      if (p.path) {
        window.api.terminal.openExternal(p.path, true);
        Toast.show('Running Claude Code', 'info');
      } else {
        Toast.show('Project path is not set', 'warning');
      }
    });

    // Load activity
    try {
      const activities = await window.api.activity.list(this.projectId, 5);
      const activityEl = container.querySelector('.overview-activity');
      if (!activities || activities.length === 0) {
        activityEl.innerHTML = `<p class="text-sm text-slate-500">No activity yet</p>`;
      } else {
        activityEl.innerHTML = '';
        activities.forEach(a => {
          const item = document.createElement('div');
          item.className = 'activity-item';
          item.innerHTML = `
            <div class="activity-dot"></div>
            <div class="flex-1">
              <span class="text-slate-300">${a.detail || a.action}</span>
              <span class="text-slate-500 ml-2">${formatRelativeTime(a.created_at)}</span>
            </div>
          `;
          activityEl.appendChild(item);
        });
      }
    } catch (e) {
      console.error('Failed to load activity:', e);
    }
  }

  async renderTabPlaceholder(container, tabId, componentName) {
    // Dynamically load feature components
    try {
      let component;
      switch (tabId) {
        case 'todos': {
          const { TodoList } = await import('../todos/TodoList.js');
          component = new TodoList(this.projectId);
          break;
        }
        case 'notes': {
          const { NoteList } = await import('../notes/NoteList.js');
          component = new NoteList(this.projectId);
          break;
        }
        case 'timer': {
          const { TimeTracker } = await import('../timer/TimeTracker.js');
          component = new TimeTracker(this.projectId);
          break;
        }
        case 'terminal': {
          const { TerminalPanel } = await import('../terminal/TerminalPanel.js');
          component = new TerminalPanel(this.projectId, this.project.path);
          break;
        }
      }
      if (component) {
        container.appendChild(component.render());
      }
    } catch (e) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔧</div>
          <p class="text-slate-400">Failed to load ${componentName}</p>
          <p class="text-sm text-slate-500 mt-1">${e.message || ''}</p>
        </div>
      `;
    }
  }

  statusLabel(status) {
    const labels = { active: 'Active', paused: 'Paused', completed: 'Done', archived: 'Archived' };
    return labels[status] || status;
  }

  kanbanLabel(stage) {
    const labels = { backlog: 'Backlog', in_progress: 'In Progress', review: 'Review', done: 'Done' };
    return labels[stage] || stage || '-';
  }
}
