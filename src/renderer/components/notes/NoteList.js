// NoteList - Project notes list with type filter and grid layout
import { Toast } from '../common/Toast.js';
import { formatRelativeTime, truncate } from '../../utils/format.js';

const NOTE_TYPES = [
  { id: 'all', label: '\uC804\uCCB4', icon: '' },
  { id: 'idea', label: '\uC544\uC774\uB514\uC5B4', icon: '\uD83D\uDCA1' },
  { id: 'memo', label: '\uBA54\uBAA8', icon: '\uD83D\uDCDD' },
  { id: 'reference', label: '\uCC38\uACE0', icon: '\uD83D\uDCDA' },
  { id: 'bug', label: '\uBC84\uADF8', icon: '\uD83D\uDC1B' },
  { id: 'feature', label: '\uAE30\uB2A5', icon: '\u2728' },
];

export class NoteList {
  constructor(projectId) {
    this.projectId = projectId;
    this.notes = [];
    this.filterType = 'all';
    this.container = null;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'flex flex-col gap-4';

    // Header
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-slate-200">\uC544\uC774\uB514\uC5B4 & \uBA54\uBAA8</h2>
        <button class="note-add-btn btn-primary text-sm">+ \uC0C8 \uB178\uD2B8</button>
      </div>
      <div class="tab-nav note-type-tabs"></div>
      <div class="note-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem;"></div>
    `;

    this.container = el;

    // Type filter tabs
    const tabNav = el.querySelector('.note-type-tabs');
    NOTE_TYPES.forEach(type => {
      const btn = document.createElement('button');
      btn.className = `tab-btn ${type.id === 'all' ? 'active' : ''}`;
      btn.textContent = type.icon ? `${type.icon} ${type.label}` : type.label;
      btn.addEventListener('click', () => {
        tabNav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterType = type.id;
        this.renderGrid();
      });
      tabNav.appendChild(btn);
    });

    // New note button
    el.querySelector('.note-add-btn').addEventListener('click', () => this.openEditor(null));

    this.loadNotes();
    return el;
  }

  async loadNotes() {
    try {
      this.notes = await window.api.notes.list(this.projectId);
      this.renderGrid();
    } catch (e) {
      console.error('Failed to load notes:', e);
      Toast.show('\uB178\uD2B8 \uBAA9\uB85D \uB85C\uB4DC \uC2E4\uD328', 'error');
    }
  }

  renderGrid() {
    const grid = this.container.querySelector('.note-grid');
    grid.innerHTML = '';

    let filtered = [...this.notes];
    if (this.filterType !== 'all') {
      filtered = filtered.filter(n => n.type === this.filterType);
    }

    // Pinned first, then by updated_at desc
    filtered.sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned - a.pinned;
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state py-8" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">\uD83D\uDCDD</div>
          <p class="text-slate-500 text-sm">\uB178\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4</p>
        </div>
      `;
      return;
    }

    filtered.forEach(note => grid.appendChild(this.createCard(note)));
  }

  createCard(note) {
    const card = document.createElement('div');
    const typeClass = `note-type-${note.type || 'memo'}`;
    card.className = `note-card ${typeClass}`;

    const typeInfo = NOTE_TYPES.find(t => t.id === note.type) || NOTE_TYPES[2]; // default memo
    const tags = this.parseTags(note.tags);
    const contentPreview = truncate(note.content || '', 80);

    card.innerHTML = `
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-1.5">
          <span class="text-sm">${typeInfo.icon}</span>
          <span class="text-sm font-medium text-slate-200 truncate" style="max-width: 180px;">${note.title || '\uC81C\uBAA9 \uC5C6\uC74C'}</span>
        </div>
        ${note.pinned ? '<span class="text-xs" title="\uACE0\uC815\uB428">\uD83D\uDCCC</span>' : ''}
      </div>
      ${contentPreview ? `<p class="text-xs text-slate-400 truncate-2 mb-2">${contentPreview}</p>` : ''}
      <div class="flex items-center justify-between">
        <div class="flex flex-wrap gap-1">
          ${tags.map(tag => `<span class="tag-chip">${tag}</span>`).join('')}
        </div>
        <span class="text-xs text-slate-600">${formatRelativeTime(note.updated_at || note.created_at)}</span>
      </div>
    `;

    card.addEventListener('click', () => this.openEditor(note));

    return card;
  }

  async openEditor(note) {
    try {
      const { NoteEditor } = await import('./NoteEditor.js');
      const editor = new NoteEditor({
        projectId: this.projectId,
        note,
        onSaved: () => this.loadNotes(),
        onDeleted: () => this.loadNotes(),
      });
      editor.open();
    } catch (e) {
      console.error('Failed to open note editor:', e);
      Toast.show('\uB178\uD2B8 \uD3B8\uC9D1\uAE30\uB97C \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4', 'error');
    }
  }

  parseTags(tagsField) {
    if (!tagsField) return [];
    try {
      const parsed = JSON.parse(tagsField);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
