// TodoList - Project todo checklist
import { Toast } from '../common/Toast.js';
import { formatDate } from '../../utils/format.js';
import { FilePreviewModal } from './FilePreviewModal.js';

const PRIORITY_MAP = {
  urgent: { label: '\uAE34\uAE09', cls: 'priority-urgent' },
  high: { label: '\uB192\uC74C', cls: 'priority-high' },
  medium: { label: '\uBCF4\uD1B5', cls: 'priority-medium' },
  low: { label: '\uB0AE\uC74C', cls: 'priority-low' },
};

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

export class TodoList {
  constructor(projectId) {
    this.projectId = projectId;
    this.todos = [];
    this.attachmentsCache = {}; // todoId -> attachments[]
    this.filter = 'all'; // all, incomplete, completed, urgent, high, medium, low
    this.container = null;
    this.filePreviewModal = new FilePreviewModal();
  }

  render() {
    const el = document.createElement('div');
    el.className = 'flex flex-col gap-4';

    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h2 class="text-base font-semibold text-slate-200">\uD560 \uC77C</h2>
          <span class="todo-progress text-sm text-slate-500"></span>
        </div>
        <select class="todo-filter input" style="width: auto; min-width: 100px;">
          <option value="all">\uC804\uCCB4</option>
          <option value="incomplete">\uBBF8\uC644\uB8CC</option>
          <option value="completed">\uC644\uB8CC</option>
          <option value="urgent">\uAE34\uAE09</option>
          <option value="high">\uB192\uC74C</option>
          <option value="medium">\uBCF4\uD1B5</option>
          <option value="low">\uB0AE\uC74C</option>
        </select>
      </div>

      <div class="flex gap-2">
        <input type="text" class="todo-input input flex-1" placeholder="\uC0C8 \uD560 \uC77C \uCD94\uAC00..." />
        <select class="todo-priority-select input" style="width: auto;">
          <option value="medium">\uBCF4\uD1B5</option>
          <option value="low">\uB0AE\uC74C</option>
          <option value="high">\uB192\uC74C</option>
          <option value="urgent">\uAE34\uAE09</option>
        </select>
        <button class="todo-add-btn btn-primary">\uCD94\uAC00</button>
      </div>

      <div class="todo-list space-y-1"></div>
    `;

    this.container = el;

    // Filter change
    el.querySelector('.todo-filter').addEventListener('change', (e) => {
      this.filter = e.target.value;
      this.renderList();
    });

    // Add todo
    const addTodo = () => {
      const input = el.querySelector('.todo-input');
      const title = input.value.trim();
      if (!title) return;
      const priority = el.querySelector('.todo-priority-select').value;
      this.addTodo(title, priority);
      input.value = '';
    };

    el.querySelector('.todo-add-btn').addEventListener('click', addTodo);
    el.querySelector('.todo-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTodo();
    });

    this.loadTodos();
    return el;
  }

  async loadTodos() {
    try {
      this.todos = await window.api.todos.list(this.projectId);
      await this.loadAllAttachments();
      this.renderList();
    } catch (e) {
      console.error('Failed to load todos:', e);
      Toast.show('\uD560 \uC77C \uBAA9\uB85D \uB85C\uB4DC \uC2E4\uD328', 'error');
    }
  }

  async loadAllAttachments() {
    const promises = this.todos.map(async (todo) => {
      try {
        this.attachmentsCache[todo.id] = await window.api.attachments.list(todo.id);
      } catch (e) {
        this.attachmentsCache[todo.id] = [];
      }
    });
    await Promise.all(promises);
  }

  async loadAttachments(todoId) {
    try {
      this.attachmentsCache[todoId] = await window.api.attachments.list(todoId);
    } catch (e) {
      this.attachmentsCache[todoId] = [];
    }
  }

  renderList() {
    const listEl = this.container.querySelector('.todo-list');
    listEl.innerHTML = '';

    let filtered = [...this.todos];

    // Apply filter
    switch (this.filter) {
      case 'incomplete': filtered = filtered.filter(t => !t.completed); break;
      case 'completed': filtered = filtered.filter(t => t.completed); break;
      case 'urgent': case 'high': case 'medium': case 'low':
        filtered = filtered.filter(t => t.priority === this.filter); break;
    }

    // Sort: incomplete first, then by priority, then by sort_order
    filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const pa = PRIORITY_ORDER[a.priority] ?? 2;
      const pb = PRIORITY_ORDER[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    // Progress
    const total = this.todos.length;
    const done = this.todos.filter(t => t.completed).length;
    this.container.querySelector('.todo-progress').textContent =
      total > 0 ? `${done}/${total} \uC644\uB8CC` : '';

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state py-8">
          <div class="empty-state-icon">\u2705</div>
          <p class="text-slate-500 text-sm">\uD560 \uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</p>
        </div>
      `;
      return;
    }

    filtered.forEach(todo => listEl.appendChild(this.createTodoItem(todo)));
  }

  createTodoItem(todo) {
    const wrapper = document.createElement('div');

    const item = document.createElement('div');
    item.className = `todo-item ${todo.completed ? 'completed' : ''}`;

    const pri = PRIORITY_MAP[todo.priority] || PRIORITY_MAP.medium;

    item.innerHTML = `
      <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} />
      <span class="badge ${pri.cls}" style="font-size: 0.6875rem;">${pri.label}</span>
      <span class="todo-title flex-1 text-sm ${todo.completed ? 'text-slate-500' : 'text-slate-200'}">${todo.title}</span>
      ${todo.due_date ? `<span class="text-xs text-slate-500">${formatDate(todo.due_date)}</span>` : ''}
      <button class="todo-delete-btn text-slate-600 hover:text-red-400 text-sm transition-default" title="\uC0AD\uC81C">\uD83D\uDDD1</button>
    `;

    // Toggle completed
    item.querySelector('.todo-checkbox').addEventListener('change', (e) => {
      this.toggleTodo(todo.id, e.target.checked);
    });

    // Delete
    item.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteTodo(todo.id);
    });

    // Inline edit on double-click
    const titleEl = item.querySelector('.todo-title');
    titleEl.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input text-sm';
      input.style.cssText = 'padding: 0.125rem 0.375rem; flex: 1;';
      input.value = todo.title;

      const save = async () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== todo.title) {
          await this.updateTodo(todo.id, { title: newTitle });
        } else {
          this.renderList();
        }
      };

      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = todo.title; input.blur(); }
      });

      titleEl.replaceWith(input);
      input.focus();
      input.select();
    });

    wrapper.appendChild(item);

    // Attachments area
    const attachments = this.attachmentsCache[todo.id] || [];
    const attachArea = document.createElement('div');
    attachArea.className = 'todo-attachments';

    attachments.forEach(att => {
      const chip = document.createElement('span');
      chip.className = 'attachment-item';
      chip.innerHTML = `
        <span class="attachment-name" title="${this.escapeHtml(att.file_path)}">📎 ${this.escapeHtml(att.file_name)}</span>
        <span class="attachment-remove" title="삭제">&times;</span>
      `;

      chip.querySelector('.attachment-name').addEventListener('click', (e) => {
        e.stopPropagation();
        this.filePreviewModal.show(att.file_path, att.file_name);
      });

      chip.querySelector('.attachment-remove').addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.removeAttachment(att.id, todo.id);
      });

      attachArea.appendChild(chip);
    });

    // Add attach button
    const addBtn = document.createElement('button');
    addBtn.className = 'attachment-add-btn';
    addBtn.textContent = '+ Attach';
    addBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.attachFiles(todo.id);
    });
    attachArea.appendChild(addBtn);

    wrapper.appendChild(attachArea);
    return wrapper;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async addTodo(title, priority) {
    try {
      await window.api.todos.create(this.projectId, {
        title,
        priority,
        sort_order: this.todos.length,
      });
      await this.loadTodos();
      Toast.show('\uD560 \uC77C\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4', 'success');
    } catch (e) {
      console.error('Failed to add todo:', e);
      Toast.show('\uD560 \uC77C \uCD94\uAC00 \uC2E4\uD328', 'error');
    }
  }

  async toggleTodo(id, completed) {
    try {
      await window.api.todos.update(id, { completed: completed ? 1 : 0 });
      const todo = this.todos.find(t => t.id === id);
      if (todo) todo.completed = completed ? 1 : 0;
      this.renderList();
    } catch (e) {
      console.error('Failed to toggle todo:', e);
      Toast.show('\uD560 \uC77C \uC0C1\uD0DC \uBCC0\uACBD \uC2E4\uD328', 'error');
    }
  }

  async updateTodo(id, data) {
    try {
      await window.api.todos.update(id, data);
      await this.loadTodos();
    } catch (e) {
      console.error('Failed to update todo:', e);
      Toast.show('\uD560 \uC77C \uC218\uC815 \uC2E4\uD328', 'error');
    }
  }

  async deleteTodo(id) {
    try {
      await window.api.todos.delete(id);
      this.todos = this.todos.filter(t => t.id !== id);
      delete this.attachmentsCache[id];
      this.renderList();
      Toast.show('\uD560 \uC77C\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4', 'info');
    } catch (e) {
      console.error('Failed to delete todo:', e);
      Toast.show('\uD560 \uC77C \uC0AD\uC81C \uC2E4\uD328', 'error');
    }
  }

  async attachFiles(todoId) {
    try {
      const filePaths = await window.api.attachments.selectFile();
      if (!filePaths || filePaths.length === 0) return;

      for (const fp of filePaths) {
        const fileName = fp.split('/').pop();
        await window.api.attachments.add(todoId, fp, fileName);
      }

      await this.loadAttachments(todoId);
      this.renderList();
      Toast.show('\uD30C\uC77C\uC744 \uCCA8\uBD80\uD588\uC2B5\uB2C8\uB2E4', 'success');
    } catch (e) {
      console.error('Failed to attach files:', e);
      Toast.show('\uD30C\uC77C \uCCA8\uBD80 \uC2E4\uD328', 'error');
    }
  }

  async removeAttachment(attachmentId, todoId) {
    try {
      await window.api.attachments.remove(attachmentId);
      await this.loadAttachments(todoId);
      this.renderList();
    } catch (e) {
      console.error('Failed to remove attachment:', e);
      Toast.show('\uCCA8\uBD80\uD30C\uC77C \uC0AD\uC81C \uC2E4\uD328', 'error');
    }
  }
}
