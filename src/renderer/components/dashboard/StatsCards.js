// StatsCards - Dashboard statistics cards
import { formatDuration } from '../../utils/format.js';

export class StatsCards {
  constructor() {
    this.container = null;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'grid grid-cols-4 gap-4 mb-6';
    el.innerHTML = `
      <div class="stats-card">
        <div class="stats-icon bg-indigo-500/15"><span>📁</span></div>
        <div>
          <div class="text-2xl font-bold text-slate-100 stat-total">-</div>
          <div class="text-sm text-slate-400">Total Projects</div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-icon bg-green-500/15"><span>🚀</span></div>
        <div>
          <div class="text-2xl font-bold text-slate-100 stat-active">-</div>
          <div class="text-sm text-slate-400">Active Projects</div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-icon bg-orange-500/15"><span>📝</span></div>
        <div>
          <div class="text-2xl font-bold text-slate-100 stat-todos">-</div>
          <div class="text-sm text-slate-400">Pending Todos</div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-icon bg-cyan-500/15"><span>⏱</span></div>
        <div>
          <div class="text-2xl font-bold text-slate-100 stat-time">-</div>
          <div class="text-sm text-slate-400">Today's Work</div>
        </div>
      </div>
    `;

    this.container = el;
    this.loadStats();
    return el;
  }

  async loadStats() {
    try {
      const stats = await window.api.stats.dashboard();
      if (!this.container) return;

      this.container.querySelector('.stat-total').textContent = stats.totalProjects ?? 0;
      this.container.querySelector('.stat-active').textContent = stats.activeProjects ?? 0;
      this.container.querySelector('.stat-todos').textContent = stats.pendingTodos ?? 0;
      this.container.querySelector('.stat-time').textContent = formatDuration(stats.totalTimeMinutes ?? 0);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }
}
