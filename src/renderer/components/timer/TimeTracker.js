// TimeTracker - Project time tracking with timer and history
import { Toast } from '../common/Toast.js';
import { formatDate, formatTime, formatDuration } from '../../utils/format.js';

export class TimeTracker {
  constructor(projectId) {
    this.projectId = projectId;
    this.logs = [];
    this.activeLog = null; // currently running log
    this.timerInterval = null;
    this.container = null;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'flex flex-col gap-6';

    el.innerHTML = `
      <div class="timer-section card-static p-6">
        <div class="flex flex-col items-center gap-4">
          <div class="timer-wrapper">
            <div class="timer-display">00:00:00</div>
          </div>
          <div class="flex items-center gap-2 w-full max-w-md">
            <input type="text" class="timer-desc input flex-1" placeholder="\uC791\uC5C5 \uC124\uBA85..." />
            <button class="timer-start-btn btn-primary">\u25B6 \uC2DC\uC791</button>
            <button class="timer-stop-btn btn-danger" style="display: none;">\u23F9 \uC815\uC9C0</button>
          </div>
        </div>
      </div>

      <div class="today-section">
        <h3 class="text-sm font-semibold text-slate-300 mb-3">\uC624\uB298 \uC694\uC57D</h3>
        <div class="today-summary card-static p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-slate-400">\uC624\uB298 \uCD1D \uC791\uC5C5 \uC2DC\uAC04</span>
            <span class="today-total text-sm font-semibold text-slate-200">0\uBD84</span>
          </div>
          <div class="today-sessions space-y-1"></div>
        </div>
      </div>

      <div class="history-section">
        <h3 class="text-sm font-semibold text-slate-300 mb-3">\uAE30\uB85D</h3>
        <div class="history-list card-static p-4 space-y-2"></div>
      </div>

      <div class="chart-section">
        <h3 class="text-sm font-semibold text-slate-300 mb-3">\uC8FC\uAC04 \uCC28\uD2B8</h3>
        <div class="weekly-chart card-static p-4" style="display: flex; align-items: flex-end; gap: 0.5rem; height: 140px;"></div>
      </div>
    `;

    this.container = el;

    // Start button
    el.querySelector('.timer-start-btn').addEventListener('click', () => this.startTimer());

    // Stop button
    el.querySelector('.timer-stop-btn').addEventListener('click', () => this.stopTimer());

    // Enter key starts timer
    el.querySelector('.timer-desc').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.activeLog) this.startTimer();
    });

    this.loadData();
    return el;
  }

  async loadData() {
    try {
      this.logs = await window.api.timelogs.list(this.projectId);

      // Check for active (unfinished) log to restore timer
      this.activeLog = this.logs.find(l => !l.ended_at) || null;
      if (this.activeLog) {
        this.setRunningUI(true);
        this.container.querySelector('.timer-desc').value = this.activeLog.description || '';
        this.startDisplayTimer();
      }

      this.renderToday();
      this.renderHistory();
      this.renderWeeklyChart();
    } catch (e) {
      console.error('Failed to load time logs:', e);
      Toast.show('\uC2DC\uAC04 \uAE30\uB85D \uB85C\uB4DC \uC2E4\uD328', 'error');
    }
  }

  async startTimer() {
    if (this.activeLog) return;

    const desc = this.container.querySelector('.timer-desc').value.trim() || '\uC791\uC5C5';

    try {
      const log = await window.api.timelogs.start(this.projectId, desc);
      this.activeLog = log;
      this.setRunningUI(true);
      this.startDisplayTimer();
      Toast.show('\uD0C0\uC774\uBA38 \uC2DC\uC791', 'success');
    } catch (e) {
      console.error('Failed to start timer:', e);
      Toast.show('\uD0C0\uC774\uBA38 \uC2DC\uC791 \uC2E4\uD328', 'error');
    }
  }

  async stopTimer() {
    if (!this.activeLog) return;

    try {
      await window.api.timelogs.stop(this.activeLog.id);
      this.stopDisplayTimer();
      this.setRunningUI(false);
      this.activeLog = null;
      Toast.show('\uD0C0\uC774\uBA38 \uC815\uC9C0', 'info');

      // Reload data
      await this.loadData();
    } catch (e) {
      console.error('Failed to stop timer:', e);
      Toast.show('\uD0C0\uC774\uBA38 \uC815\uC9C0 \uC2E4\uD328', 'error');
    }
  }

  setRunningUI(running) {
    const wrapper = this.container.querySelector('.timer-wrapper');
    const startBtn = this.container.querySelector('.timer-start-btn');
    const stopBtn = this.container.querySelector('.timer-stop-btn');

    if (running) {
      wrapper.classList.add('timer-running');
      startBtn.style.display = 'none';
      stopBtn.style.display = '';
    } else {
      wrapper.classList.remove('timer-running');
      startBtn.style.display = '';
      stopBtn.style.display = 'none';
    }
  }

  startDisplayTimer() {
    this.updateTimerDisplay();
    this.timerInterval = setInterval(() => this.updateTimerDisplay(), 1000);
  }

  stopDisplayTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.container.querySelector('.timer-display').textContent = '00:00:00';
  }

  updateTimerDisplay() {
    if (!this.activeLog) return;
    const start = new Date(this.activeLog.started_at).getTime();
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    this.container.querySelector('.timer-display').textContent = `${h}:${m}:${s}`;
  }

  renderToday() {
    const today = new Date().toISOString().slice(0, 10);
    const todayLogs = this.logs.filter(l => {
      if (!l.started_at) return false;
      return l.started_at.slice(0, 10) === today && l.ended_at;
    });

    const totalMinutes = todayLogs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);
    this.container.querySelector('.today-total').textContent = formatDuration(totalMinutes);

    const sessionsEl = this.container.querySelector('.today-sessions');
    sessionsEl.innerHTML = '';

    if (todayLogs.length === 0) {
      sessionsEl.innerHTML = '<p class="text-xs text-slate-600">\uC624\uB298 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</p>';
      return;
    }

    todayLogs.forEach(log => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between text-xs text-slate-400';
      row.innerHTML = `
        <span class="truncate flex-1" style="max-width: 50%;">${log.description || '\uC791\uC5C5'}</span>
        <span>${formatTime(log.started_at)} - ${formatTime(log.ended_at)}</span>
        <span class="text-slate-300 ml-2">${formatDuration(log.duration_minutes)}</span>
      `;
      sessionsEl.appendChild(row);
    });
  }

  renderHistory() {
    const historyEl = this.container.querySelector('.history-list');
    historyEl.innerHTML = '';

    const completedLogs = this.logs
      .filter(l => l.ended_at)
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      .slice(0, 20);

    if (completedLogs.length === 0) {
      historyEl.innerHTML = '<p class="text-xs text-slate-600">\uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</p>';
      return;
    }

    // Group by date
    const groups = {};
    completedLogs.forEach(log => {
      const dateKey = log.started_at.slice(0, 10);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(log);
    });

    Object.entries(groups).forEach(([dateKey, logs]) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'mb-3';

      const dayTotal = logs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);
      groupEl.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-medium text-slate-400">${formatDate(dateKey)}</span>
          <span class="text-xs text-slate-500">\uCD1D ${formatDuration(dayTotal)}</span>
        </div>
      `;

      logs.forEach(log => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between text-xs text-slate-500 py-0.5';
        row.innerHTML = `
          <span class="truncate flex-1" style="max-width: 50%;">${log.description || '\uC791\uC5C5'}</span>
          <span>${formatTime(log.started_at)} - ${formatTime(log.ended_at)}</span>
          <span class="text-slate-400 ml-2">${formatDuration(log.duration_minutes)}</span>
        `;
        groupEl.appendChild(row);
      });

      historyEl.appendChild(groupEl);
    });
  }

  renderWeeklyChart() {
    const chartEl = this.container.querySelector('.weekly-chart');
    chartEl.innerHTML = '';

    const days = [];
    const dayLabels = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayName = dayLabels[d.getDay()];
      const dayLogs = this.logs.filter(l => l.ended_at && l.started_at.slice(0, 10) === key);
      const minutes = dayLogs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);
      days.push({ key, dayName, minutes });
    }

    const maxMin = Math.max(...days.map(d => d.minutes), 1);

    days.forEach(day => {
      const barHeight = day.minutes > 0 ? Math.max((day.minutes / maxMin) * 80, 4) : 2;
      const col = document.createElement('div');
      col.className = 'flex flex-col items-center flex-1';
      col.innerHTML = `
        <div class="chart-bar" style="height: ${barHeight}px; width: 100%;"></div>
        <span class="text-xs text-slate-500 mt-1">${day.dayName}</span>
        ${day.minutes > 0 ? `<span class="text-xs text-slate-600">${day.minutes}m</span>` : ''}
      `;
      chartEl.appendChild(col);
    });
  }

  // Cleanup interval on destroy
  destroy() {
    this.stopDisplayTimer();
  }
}
