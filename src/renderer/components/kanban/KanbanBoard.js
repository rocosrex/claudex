// KanbanBoard - Kanban board with 4 stage columns and drag-and-drop
import { store } from '../../store/store.js';
import { Toast } from '../common/Toast.js';
import { makeDraggable, makeDropZone } from '../../utils/drag-drop.js';

const STAGES = [
  { id: 'backlog', label: 'Backlog', icon: '\uD83D\uDCCB', color: '#94a3b8' },
  { id: 'in_progress', label: '\uC9C4\uD589 \uC911', icon: '\uD83D\uDD28', color: '#3b82f6' },
  { id: 'review', label: '\uB9AC\uBDF0', icon: '\uD83D\uDC40', color: '#eab308' },
  { id: 'done', label: '\uC644\uB8CC', icon: '\u2705', color: '#22c55e' },
];

export class KanbanBoard {
  constructor() {
    this.container = null;
    this.projects = [];
    this.todoCounts = {};
    this.filterActive = true; // true = active only, false = all
    this.onNavigate = null;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'flex flex-col h-full';
    el.innerHTML = `
      <div class="flex items-center justify-between px-6 py-4 border-b" style="border-color: var(--color-border);">
        <h1 class="text-lg font-bold text-slate-100">\uCE78\uBC18 \uBCF4\uB4DC</h1>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" class="filter-active-check" checked />
            \uD65C\uC131 \uD504\uB85C\uC81D\uD2B8\uB9CC
          </label>
        </div>
      </div>
      <div class="kanban-board flex-1"></div>
    `;

    this.container = el;

    el.querySelector('.filter-active-check').addEventListener('change', (e) => {
      this.filterActive = e.target.checked;
      this.renderBoard();
    });

    this.loadData();
    return el;
  }

  async loadData() {
    try {
      const projects = await window.api.projects.list();
      store.setState({ projects });
      this.projects = projects;

      // Load todo counts for progress bars
      for (const p of projects) {
        try {
          const todos = await window.api.todos.list(p.id);
          const total = todos.length;
          const completed = todos.filter(t => t.completed).length;
          this.todoCounts[p.id] = { total, completed };
        } catch {
          this.todoCounts[p.id] = { total: 0, completed: 0 };
        }
      }

      this.renderBoard();
    } catch (e) {
      console.error('Kanban load error:', e);
      Toast.show('\uCE78\uBC18 \uBCF4\uB4DC \uB370\uC774\uD130 \uB85C\uB4DC \uC2E4\uD328', 'error');
    }
  }

  renderBoard() {
    const board = this.container.querySelector('.kanban-board');
    board.innerHTML = '';

    let filteredProjects = this.projects;
    if (this.filterActive) {
      filteredProjects = filteredProjects.filter(p => p.status === 'active');
    }

    STAGES.forEach(stage => {
      const stageProjects = filteredProjects.filter(
        p => (p.kanban_stage || 'backlog') === stage.id
      ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      const col = document.createElement('div');
      col.className = 'kanban-column';

      // Header
      col.innerHTML = `
        <div class="kanban-column-header">
          <span style="color: ${stage.color};">${stage.icon} ${stage.label}</span>
          <span class="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">${stageProjects.length}</span>
        </div>
        <div class="kanban-column-body"></div>
      `;

      const body = col.querySelector('.kanban-column-body');

      // Make column a drop zone
      makeDropZone(col, {
        acceptType: 'project',
        onDrop: (data) => this.handleDrop(data, stage.id),
      });

      if (stageProjects.length === 0) {
        body.innerHTML = `
          <div class="text-center py-8 text-sm text-slate-500">
            \uD504\uB85C\uC81D\uD2B8\uB97C \uC5EC\uAE30\uB85C \uB4DC\uB798\uADF8\uD558\uC138\uC694
          </div>
        `;
      } else {
        stageProjects.forEach(project => {
          body.appendChild(this.createCard(project));
        });
      }

      board.appendChild(col);
    });
  }

  createCard(project) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    if (project.color) {
      card.style.borderLeftColor = project.color;
      card.style.borderLeftWidth = '3px';
    }

    const counts = this.todoCounts[project.id] || { total: 0, completed: 0 };
    const pct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;

    card.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <span class="text-base">${project.icon || '\uD83D\uDCC1'}</span>
        <span class="text-sm font-medium text-slate-200 flex-1 truncate">${project.name}</span>
      </div>
      ${counts.total > 0 ? `
        <div class="flex items-center gap-2">
          <div class="progress-bar flex-1">
            <div class="progress-bar-fill" style="width: ${pct}%;"></div>
          </div>
          <span class="text-xs text-slate-500">${counts.completed}/${counts.total}</span>
        </div>
      ` : ''}
    `;

    // Make draggable
    makeDraggable(card, { type: 'project', id: project.id });

    // Click to navigate to project detail
    card.addEventListener('click', (e) => {
      // Don't navigate if user was dragging
      if (card.classList.contains('dragging')) return;
      if (this.onNavigate) {
        this.onNavigate('project-detail', { projectId: project.id });
      }
    });

    return card;
  }

  async handleDrop(data, newStage) {
    const projectId = data.id;
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const currentStage = project.kanban_stage || 'backlog';
    if (currentStage === newStage) return;

    try {
      await window.api.projects.update(projectId, { kanban_stage: newStage });
      project.kanban_stage = newStage;
      this.renderBoard();

      const stageLabel = STAGES.find(s => s.id === newStage)?.label || newStage;
      Toast.show(`"${project.name}" \u2192 ${stageLabel}`, 'success');
    } catch (e) {
      console.error('Kanban update error:', e);
      Toast.show('\uCE78\uBC18 \uC774\uB3D9 \uC2E4\uD328', 'error');
    }
  }
}
