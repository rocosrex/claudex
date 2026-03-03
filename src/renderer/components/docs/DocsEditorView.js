// DocsEditorView - File editor + terminal split view
import { Toast } from '../common/Toast.js';
import { TerminalPanel } from '../terminal/TerminalPanel.js';

export class DocsEditorView {
  constructor({ projectId, filePath, projectPath }) {
    this.projectId = projectId;
    this.filePath = filePath;
    this.projectPath = projectPath;
    this.fileName = filePath.split('/').pop();
    this.isMarkdown = this.fileName.endsWith('.md');
    this.container = null;
    this.textarea = null;
    this.previewEl = null;
    this.terminalPanel = null;
    this.originalContent = '';
    this.modified = false;
    this.previewMode = this.isMarkdown;
    this.saveTimeout = null;
    this.leftWidth = 50; // percentage
    this.onClose = null; // set by caller
  }

  render() {
    const el = document.createElement('div');
    el.className = 'docs-editor-view';

    const previewBtn = this.isMarkdown
      ? `<button class="docs-toolbar-btn btn-preview${this.previewMode ? ' active' : ''}" title="Preview (⌘+Shift+P)">${this.previewMode ? '✏️ Edit' : '👁 Preview'}</button>`
      : '';

    el.innerHTML = `
      <div class="docs-editor-left" style="width: ${this.leftWidth}%;">
        <div class="docs-editor-toolbar">
          <span class="docs-editor-filename" title="${this.filePath}">📄 ${this.fileName}</span>
          <span class="docs-modified-badge" style="display:none;">● Modified</span>
          ${previewBtn}
          <button class="docs-toolbar-btn btn-save" title="Save (⌘+S)">💾 Save</button>
          <button class="docs-toolbar-btn btn-close" title="Close">✕ Close</button>
        </div>
        <textarea class="docs-textarea" placeholder="Edit file content..."${this.previewMode ? ' style="display:none;"' : ''}></textarea>
        <div class="docs-preview markdown-body" style="display:${this.previewMode ? 'block' : 'none'};"></div>
      </div>
      <div class="docs-split-divider"></div>
      <div class="docs-editor-right" style="width: ${100 - this.leftWidth}%;"></div>
    `;

    this.container = el;
    this.textarea = el.querySelector('.docs-textarea');
    this.previewEl = el.querySelector('.docs-preview');

    this.setupTerminal(el.querySelector('.docs-editor-right'));
    this.setupEvents();
    this.loadContent();

    return el;
  }

  setupTerminal(rightPane) {
    this.terminalPanel = new TerminalPanel(this.projectId, this.projectPath, { mode: 'embedded' });
    rightPane.appendChild(this.terminalPanel.render());
  }

  async loadContent() {
    try {
      const result = await window.api.files.read(this.filePath);
      if (result.error) {
        Toast.show(`Failed to read file: ${result.error}`, 'error');
        return;
      }
      this.originalContent = result.content;
      this.textarea.value = result.content;
      this.setModified(false);
      if (this.previewMode) this.renderPreview();
    } catch (e) {
      Toast.show(`Failed to read file: ${e.message}`, 'error');
    }
  }

  setupEvents() {
    // Text input → debounce auto-save
    this.textarea.addEventListener('input', () => {
      this.setModified(this.textarea.value !== this.originalContent);
      this.scheduleAutoSave();
    });

    // Save button
    this.container.querySelector('.btn-save').addEventListener('click', () => this.save());

    // Preview toggle (markdown only)
    const previewBtn = this.container.querySelector('.btn-preview');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => this.togglePreview());
    }

    // Close button
    this.container.querySelector('.btn-close').addEventListener('click', () => {
      if (this.onClose) this.onClose();
    });

    // Keyboard shortcuts
    this.keyHandler = (e) => {
      if (e.metaKey && e.key === 's') {
        e.preventDefault();
        this.save();
      }
      if (this.isMarkdown && e.metaKey && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        this.togglePreview();
      }
    };
    document.addEventListener('keydown', this.keyHandler);

    // Split divider drag
    this.setupDividerDrag();
  }

  setupDividerDrag() {
    const divider = this.container.querySelector('.docs-split-divider');
    let startX, startLeftWidth;

    const onMouseMove = (e) => {
      const containerRect = this.container.getBoundingClientRect();
      const dx = e.clientX - startX;
      const pxWidth = (startLeftWidth / 100) * containerRect.width + dx;
      const newPercent = Math.max(20, Math.min(80, (pxWidth / containerRect.width) * 100));
      this.leftWidth = newPercent;

      const leftPane = this.container.querySelector('.docs-editor-left');
      const rightPane = this.container.querySelector('.docs-editor-right');
      leftPane.style.width = `${newPercent}%`;
      rightPane.style.width = `${100 - newPercent}%`;
    };

    const onMouseUp = () => {
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      // Refit terminal after resize
      if (this.terminalPanel && this.terminalPanel.fitAddon) {
        try { this.terminalPanel.fitAddon.fit(); } catch (e) { /* ignore */ }
      }
    };

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startLeftWidth = this.leftWidth;
      divider.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  setModified(isModified) {
    this.modified = isModified;
    const badge = this.container.querySelector('.docs-modified-badge');
    badge.style.display = isModified ? 'inline' : 'none';
  }

  scheduleAutoSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      if (this.modified) this.save();
    }, 3000);
  }

  async save() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    const content = this.previewMode ? this.originalContent : this.textarea.value;
    try {
      const result = await window.api.files.write(this.filePath, this.textarea.value);
      if (result.error) {
        Toast.show(`Save failed: ${result.error}`, 'error');
        return;
      }
      this.originalContent = this.textarea.value;
      this.setModified(false);
      Toast.show('Saved', 'success');
    } catch (e) {
      Toast.show(`Save failed: ${e.message}`, 'error');
    }
  }

  togglePreview() {
    this.previewMode = !this.previewMode;
    const previewBtn = this.container.querySelector('.btn-preview');

    if (this.previewMode) {
      this.textarea.style.display = 'none';
      this.previewEl.style.display = '';
      previewBtn.classList.add('active');
      previewBtn.textContent = '✏️ Edit';
      this.renderPreview();
    } else {
      this.textarea.style.display = '';
      this.previewEl.style.display = 'none';
      previewBtn.classList.remove('active');
      previewBtn.textContent = '👁 Preview';
    }
  }

  renderPreview() {
    const content = this.textarea.value;
    if (typeof marked !== 'undefined' && marked.parse) {
      this.previewEl.innerHTML = marked.parse(content);
    } else {
      // Fallback: basic rendering
      this.previewEl.innerHTML = content
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }
  }

  destroy() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    if (this.terminalPanel) this.terminalPanel.destroy();
  }
}
