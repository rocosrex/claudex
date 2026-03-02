// NoteEditor - Note editor modal with auto-save
import { Modal } from '../common/Modal.js';
import { Toast } from '../common/Toast.js';

const NOTE_TYPE_OPTIONS = [
  { value: 'idea', label: '\uD83D\uDCA1 \uC544\uC774\uB514\uC5B4' },
  { value: 'memo', label: '\uD83D\uDCDD \uBA54\uBAA8' },
  { value: 'reference', label: '\uD83D\uDCDA \uCC38\uACE0' },
  { value: 'bug', label: '\uD83D\uDC1B \uBC84\uADF8' },
  { value: 'feature', label: '\u2728 \uAE30\uB2A5' },
];

export class NoteEditor {
  constructor({ projectId, note, onSaved, onDeleted }) {
    this.projectId = projectId;
    this.note = note; // null for new note
    this.onSaved = onSaved;
    this.onDeleted = onDeleted;
    this.modal = null;
    this._autoSaveTimer = null;
    this._dirty = false;
  }

  open() {
    const isNew = !this.note;
    const n = this.note || { title: '', content: '', type: 'memo', tags: '[]', pinned: 0 };

    const form = document.createElement('div');
    form.className = 'flex flex-col gap-4';

    const tags = this.parseTags(n.tags);

    form.innerHTML = `
      <div>
        <input type="text" class="note-title input" placeholder="\uB178\uD2B8 \uC81C\uBAA9" value="${this.escAttr(n.title || '')}" />
      </div>
      <div class="flex gap-2">
        <select class="note-type input" style="width: auto; flex: 1;">
          ${NOTE_TYPE_OPTIONS.map(opt =>
            `<option value="${opt.value}" ${opt.value === (n.type || 'memo') ? 'selected' : ''}>${opt.label}</option>`
          ).join('')}
        </select>
        <label class="flex items-center gap-1.5 text-sm text-slate-400 cursor-pointer select-none">
          <input type="checkbox" class="note-pinned" ${n.pinned ? 'checked' : ''} />
          \uD83D\uDCCC \uACE0\uC815
        </label>
      </div>
      <div>
        <textarea class="note-content input" style="min-height: 200px; font-family: 'SF Mono', Menlo, monospace; font-size: 0.8125rem;" placeholder="\uB0B4\uC6A9\uC744 \uC785\uB825\uD558\uC138\uC694...">${n.content || ''}</textarea>
      </div>
      <div>
        <label class="text-xs text-slate-500 block mb-1">\uD0DC\uADF8 (\uC27C\uD45C\uB85C \uAD6C\uBD84)</label>
        <input type="text" class="note-tags input" placeholder="tag1, tag2, tag3" value="${tags.join(', ')}" />
      </div>
      ${!isNew ? `
        <div class="flex justify-end">
          <button class="note-delete-btn btn-danger text-sm">\uC0AD\uC81C</button>
        </div>
      ` : ''}
    `;

    // Auto-save: debounce on input
    const setupAutoSave = () => {
      const inputs = form.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        input.addEventListener('input', () => {
          this._dirty = true;
          clearTimeout(this._autoSaveTimer);
          this._autoSaveTimer = setTimeout(() => {
            if (this._dirty && !isNew) this.save(form);
          }, 2000);
        });
      });
    };

    this.modal = new Modal({
      title: isNew ? '\uC0C8 \uB178\uD2B8' : '\uB178\uD2B8 \uD3B8\uC9D1',
      content: form,
      confirmText: '\uC800\uC7A5',
      onConfirm: () => this.save(form),
    });

    // Delete handler
    if (!isNew) {
      const deleteBtn = form.querySelector('.note-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.deleteNote());
      }
    }

    this.modal.open();
    setupAutoSave();
  }

  async save(form) {
    const title = form.querySelector('.note-title').value.trim();
    const content = form.querySelector('.note-content').value;
    const type = form.querySelector('.note-type').value;
    const pinned = form.querySelector('.note-pinned').checked ? 1 : 0;
    const tagsStr = form.querySelector('.note-tags').value;
    const tags = JSON.stringify(
      tagsStr.split(',').map(t => t.trim()).filter(Boolean)
    );

    if (!title) {
      Toast.show('\uC81C\uBAA9\uC744 \uC785\uB825\uD558\uC138\uC694', 'warning');
      return;
    }

    try {
      if (this.note) {
        await window.api.notes.update(this.note.id, { title, content, type, tags, pinned });
      } else {
        await window.api.notes.create(this.projectId, { title, content, type, tags, pinned });
      }
      this._dirty = false;
      clearTimeout(this._autoSaveTimer);
      this.onSaved?.();
      this.modal.close();
      Toast.show('\uB178\uD2B8\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4', 'success');
    } catch (e) {
      console.error('Failed to save note:', e);
      Toast.show('\uB178\uD2B8 \uC800\uC7A5 \uC2E4\uD328', 'error');
    }
  }

  async deleteNote() {
    if (!this.note) return;
    try {
      await window.api.notes.delete(this.note.id);
      this.onDeleted?.();
      this.modal.close();
      Toast.show('\uB178\uD2B8\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4', 'info');
    } catch (e) {
      console.error('Failed to delete note:', e);
      Toast.show('\uB178\uD2B8 \uC0AD\uC81C \uC2E4\uD328', 'error');
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

  escAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
