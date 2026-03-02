// DashboardView - Main dashboard screen
import { store } from '../../store/store.js';
import { StatsCards } from './StatsCards.js';
import { formatRelativeTime, formatDate } from '../../utils/format.js';
import { Toast } from '../common/Toast.js';

export class DashboardView {
  constructor() {
    this.container = null;
    this.onNavigate = null; // set by App
  }

  render() {
    const el = document.createElement('div');
    el.className = 'p-6 overflow-y-auto h-full';

    // Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-6';
    header.innerHTML = `
      <div>
        <h1 class="text-2xl font-bold text-slate-100">대시보드</h1>
        <p class="text-sm text-slate-400 mt-1">${formatDate(new Date().toISOString())}</p>
      </div>
    `;
    el.appendChild(header);

    // Stats cards
    const statsCards = new StatsCards();
    el.appendChild(statsCards.render());

    // Projects grid section
    const projectSection = document.createElement('div');
    projectSection.className = 'mb-6';
    projectSection.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-slate-200">활성 프로젝트</h2>
      </div>
      <div class="project-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    `;
    el.appendChild(projectSection);

    // Recent activity section
    const activitySection = document.createElement('div');
    activitySection.innerHTML = `
      <h2 class="text-lg font-semibold text-slate-200 mb-4">최근 활동</h2>
      <div class="activity-list card-static p-4"></div>
    `;
    el.appendChild(activitySection);

    this.container = el;
    this.loadProjects();
    this.loadActivity();

    return el;
  }

  async loadProjects() {
    try {
      const projects = await window.api.projects.list();
      store.setState({ projects });
      const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'in_progress');
      this.renderProjectGrid(activeProjects.length > 0 ? activeProjects : projects.slice(0, 6));
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }

  renderProjectGrid(projects) {
    const grid = this.container.querySelector('.project-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (projects.length === 0) {
      grid.innerHTML = `
        <div class="empty-state col-span-full">
          <div class="empty-state-icon">📁</div>
          <p class="text-slate-400 mb-2">프로젝트가 없습니다</p>
          <p class="text-sm text-slate-500">새 프로젝트를 만들어 시작하세요</p>
        </div>
      `;
      return;
    }

    projects.forEach(p => {
      const card = document.createElement('div');
      card.className = 'card p-4 cursor-pointer';

      card.innerHTML = `
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style="background: ${p.color || '#6366f1'}20;">
            ${p.icon || '📁'}
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-slate-100 truncate">${p.name}</h3>
            <span class="badge badge-${p.status}">${this.statusLabel(p.status)}</span>
          </div>
        </div>
        ${p.description ? `<div class="text-sm text-slate-400 mb-3 truncate-2 markdown-body">${window.marked.parse(p.description)}</div>` : ''}
        <div class="mb-2 todo-progress-area" data-project-id="${p.id}">
          <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>진행률</span>
            <span class="todo-ratio-text">로딩...</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width: 0%"></div>
          </div>
        </div>
        <div class="flex items-center justify-between mt-3">
          <span class="text-xs text-slate-500">${formatRelativeTime(p.updated_at)}</span>
          <button class="btn-claude-run text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">
            ▶ Claude Code
          </button>
        </div>
      `;

      // Card click -> project detail
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-claude-run')) return;
        if (this.onNavigate) this.onNavigate('project-detail', { projectId: p.id });
      });

      // Claude Code button
      card.querySelector('.btn-claude-run').addEventListener('click', (e) => {
        e.stopPropagation();
        if (p.path) {
          window.api.terminal.openExternal(p.path, true);
          Toast.show(`${p.name}에서 Claude Code를 실행합니다`, 'info');
        } else {
          Toast.show('프로젝트 경로가 설정되지 않았습니다', 'warning');
        }
      });

      grid.appendChild(card);
    });

    // Load todo progress for each project
    this.loadTodoProgress();
  }

  async loadTodoProgress() {
    const areas = this.container.querySelectorAll('.todo-progress-area');
    for (const area of areas) {
      const projectId = area.dataset.projectId;
      try {
        const todos = await window.api.todos.list(projectId);
        const total = todos.length;
        const completed = todos.filter(t => t.completed).length;
        const ratio = total > 0 ? Math.round((completed / total) * 100) : 0;
        area.querySelector('.todo-ratio-text').textContent = `${completed}/${total} 완료`;
        area.querySelector('.progress-bar-fill').style.width = `${ratio}%`;
      } catch (e) {
        area.querySelector('.todo-ratio-text').textContent = '0/0 완료';
      }
    }
  }

  async loadActivity() {
    try {
      const activities = await window.api.activity.list(null, 10);
      this.renderActivity(activities);
    } catch (e) {
      console.error('Failed to load activity:', e);
    }
  }

  renderActivity(activities) {
    const list = this.container.querySelector('.activity-list');
    if (!list) return;

    if (!activities || activities.length === 0) {
      list.innerHTML = `
        <div class="empty-state py-6">
          <p class="text-slate-500 text-sm">활동 기록이 없습니다</p>
        </div>
      `;
      return;
    }

    list.innerHTML = '';
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
      list.appendChild(item);
    });
  }

  statusLabel(status) {
    const labels = { active: '활성', paused: '일시정지', completed: '완료', archived: '보관' };
    return labels[status] || status;
  }
}
