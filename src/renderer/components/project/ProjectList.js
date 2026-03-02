// ProjectList - Project list used in sidebar and dashboard
import { store } from '../../store/store.js';

export class ProjectList {
  constructor({ onSelect } = {}) {
    this.onSelect = onSelect;
    this.container = null;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'project-list flex flex-col gap-1';
    this.container = el;
    this.update();

    store.on('change:projects', () => this.update());
    store.on('change:searchQuery', () => this.update());

    return el;
  }

  update() {
    if (!this.container) return;
    const { projects, searchQuery } = store.getState();

    let filtered = projects;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = projects.filter(p =>
        p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
      );
    }

    this.container.innerHTML = '';

    if (filtered.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state py-4">
          <p class="text-sm text-slate-500">프로젝트가 없습니다</p>
        </div>
      `;
      return;
    }

    filtered.forEach(p => {
      const item = document.createElement('div');
      item.className = 'flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-all';
      item.innerHTML = `
        <span class="project-dot" style="background: ${p.color || '#6366f1'}"></span>
        <span class="flex-1 text-sm text-slate-300 truncate">${p.icon || ''} ${p.name}</span>
        <span class="badge badge-${p.status} text-[10px]">${this.statusLabel(p.status)}</span>
      `;
      item.addEventListener('click', () => {
        if (this.onSelect) this.onSelect(p);
      });
      this.container.appendChild(item);
    });
  }

  statusLabel(status) {
    const labels = { active: '활성', paused: '일시정지', completed: '완료', archived: '보관' };
    return labels[status] || status;
  }
}
