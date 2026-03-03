// TerminalSettingsModal - Theme and font settings for terminal
import { store } from '../../store/store.js';
import { THEMES, getTerminalSettings, saveTerminalSettings } from './terminal-themes.js';

export class TerminalSettingsModal {
  constructor() {
    this.overlay = null;
    this.settings = getTerminalSettings();
  }

  open() {
    if (this.overlay) return;

    this.settings = getTerminalSettings();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="min-width:480px;max-width:560px;">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-slate-100">Terminal Settings</h2>
          <button class="modal-close-btn text-slate-400 hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>
        <div class="modal-body mb-6">
          <!-- Theme -->
          <div class="mb-4">
            <label class="block text-sm text-slate-400 mb-1">Theme</label>
            <div class="flex items-center gap-3">
              <select class="input text-sm setting-theme" style="flex:1;">
                ${Object.keys(THEMES).map(name =>
                  `<option value="${name}" ${name === this.settings.theme ? 'selected' : ''}>${name}</option>`
                ).join('')}
              </select>
              <div class="theme-preview-swatches flex gap-1"></div>
            </div>
          </div>

          <!-- Font Family -->
          <div class="mb-4">
            <label class="block text-sm text-slate-400 mb-1">Font</label>
            <select class="input text-sm setting-font-family">
              ${[
                ['"SF Mono", "Fira Code", "JetBrains Mono", Menlo, monospace', 'SF Mono'],
                ['"Fira Code", "SF Mono", Menlo, monospace', 'Fira Code'],
                ['"JetBrains Mono", "SF Mono", Menlo, monospace', 'JetBrains Mono'],
                ['Menlo, Monaco, "Courier New", monospace', 'Menlo'],
                ['"Cascadia Code", "SF Mono", Menlo, monospace', 'Cascadia Code'],
                ['"Source Code Pro", "SF Mono", Menlo, monospace', 'Source Code Pro'],
              ].map(([value, label]) =>
                `<option value="${value}" ${value === this.settings.fontFamily ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          </div>

          <!-- Font Size & Line Height -->
          <div class="flex gap-3 mb-4">
            <div class="flex-1">
              <label class="block text-sm text-slate-400 mb-1">Font Size</label>
              <input type="number" class="input text-sm setting-font-size" min="8" max="28" step="1" value="${this.settings.fontSize}" />
            </div>
            <div class="flex-1">
              <label class="block text-sm text-slate-400 mb-1">Line Height</label>
              <input type="number" class="input text-sm setting-line-height" min="1.0" max="2.5" step="0.1" value="${this.settings.lineHeight}" />
            </div>
          </div>

          <!-- Cursor -->
          <div class="flex gap-3 mb-4">
            <div class="flex-1">
              <label class="block text-sm text-slate-400 mb-1">Cursor Style</label>
              <select class="input text-sm setting-cursor-style">
                ${['bar', 'block', 'underline'].map(s =>
                  `<option value="${s}" ${s === this.settings.cursorStyle ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="flex-1 flex items-end pb-1">
              <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" class="setting-cursor-blink" ${this.settings.cursorBlink ? 'checked' : ''} />
                Cursor Blink
              </label>
            </div>
          </div>

          <!-- Custom Colors -->
          <div class="mb-2">
            <label class="block text-sm text-slate-400 mb-2">Custom Color Overrides</label>
            <div class="flex gap-4">
              ${['background', 'foreground', 'cursor'].map(key => {
                const theme = THEMES[this.settings.theme] || THEMES['Clear Dark'];
                const custom = this.settings.customColors || {};
                const value = custom[key] || theme[key];
                return `
                  <div class="flex flex-col items-center gap-1">
                    <label class="text-xs text-slate-500">${key.charAt(0).toUpperCase() + key.slice(1)}</label>
                    <div class="custom-color-wrapper" style="position:relative;">
                      <div class="custom-color-swatch" data-color-key="${key}"
                           style="width:32px;height:32px;border-radius:6px;border:2px solid var(--color-border);cursor:pointer;background:${value};"
                           title="Click to change"></div>
                      <input type="color" class="custom-color-input" data-color-key="${key}" value="${value}"
                             style="position:absolute;top:0;left:0;width:32px;height:32px;opacity:0;cursor:pointer;" />
                    </div>
                  </div>
                `;
              }).join('')}
              <div class="flex items-end pb-1 ml-2">
                <button class="btn-reset-colors text-xs text-slate-500 hover:text-slate-300" style="border:none;background:none;cursor:pointer;">
                  Reset
                </button>
              </div>
            </div>
          </div>

          <!-- Preview -->
          <div class="mt-4">
            <label class="block text-sm text-slate-400 mb-1">Preview</label>
            <div class="theme-preview-box" style="border-radius:8px;padding:12px 16px;font-size:13px;line-height:1.5;border:1px solid var(--color-border);overflow:hidden;">
              <div class="preview-line"><span class="preview-prompt" style="font-weight:600;">$</span> <span>echo "Hello, Terminal!"</span></div>
              <div class="preview-line" style="opacity:0.7;">Hello, Terminal!</div>
              <div class="preview-line"><span class="preview-prompt" style="font-weight:600;">$</span> <span class="preview-cursor">_</span></div>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <button class="modal-cancel-btn btn-secondary">Cancel</button>
          <button class="modal-save-btn btn-primary">Save</button>
        </div>
      </div>
    `;

    this.overlay = overlay;
    this.setupEvents();
    this.updatePreview();

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  setupEvents() {
    const ov = this.overlay;

    // Close
    ov.querySelector('.modal-close-btn').addEventListener('click', () => this.close());
    ov.querySelector('.modal-cancel-btn').addEventListener('click', () => this.close());

    // Click outside
    let mouseDownTarget = null;
    ov.addEventListener('mousedown', (e) => { mouseDownTarget = e.target; });
    ov.addEventListener('mouseup', (e) => {
      if (e.target === ov && mouseDownTarget === ov) this.close();
      mouseDownTarget = null;
    });

    // Escape
    this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._escHandler);

    // Theme change
    ov.querySelector('.setting-theme').addEventListener('change', (e) => {
      this.settings.theme = e.target.value;
      this.settings.customColors = null;
      this.updateColorInputs();
      this.updatePreview();
    });

    // Font family
    ov.querySelector('.setting-font-family').addEventListener('change', (e) => {
      this.settings.fontFamily = e.target.value;
      this.updatePreview();
    });

    // Font size
    ov.querySelector('.setting-font-size').addEventListener('input', (e) => {
      this.settings.fontSize = parseInt(e.target.value) || 13;
      this.updatePreview();
    });

    // Line height
    ov.querySelector('.setting-line-height').addEventListener('input', (e) => {
      this.settings.lineHeight = parseFloat(e.target.value) || 1.4;
      this.updatePreview();
    });

    // Cursor style
    ov.querySelector('.setting-cursor-style').addEventListener('change', (e) => {
      this.settings.cursorStyle = e.target.value;
    });

    // Cursor blink
    ov.querySelector('.setting-cursor-blink').addEventListener('change', (e) => {
      this.settings.cursorBlink = e.target.checked;
    });

    // Custom color inputs
    ov.querySelectorAll('.custom-color-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const key = e.target.dataset.colorKey;
        if (!this.settings.customColors) this.settings.customColors = {};
        this.settings.customColors[key] = e.target.value;
        // Update swatch
        const swatch = ov.querySelector(`.custom-color-swatch[data-color-key="${key}"]`);
        if (swatch) swatch.style.background = e.target.value;
        this.updatePreview();
      });
    });

    // Reset custom colors
    ov.querySelector('.btn-reset-colors').addEventListener('click', () => {
      this.settings.customColors = null;
      this.updateColorInputs();
      this.updatePreview();
    });

    // Save
    ov.querySelector('.modal-save-btn').addEventListener('click', () => {
      saveTerminalSettings(this.settings);
      store.emit('terminal-settings-changed', this.settings);
      this.close();
    });
  }

  updateColorInputs() {
    const theme = THEMES[this.settings.theme] || THEMES['Clear Dark'];
    const custom = this.settings.customColors || {};

    this.overlay.querySelectorAll('.custom-color-input').forEach(input => {
      const key = input.dataset.colorKey;
      const value = custom[key] || theme[key];
      input.value = value;
      const swatch = this.overlay.querySelector(`.custom-color-swatch[data-color-key="${key}"]`);
      if (swatch) swatch.style.background = value;
    });
  }

  updatePreview() {
    const theme = THEMES[this.settings.theme] || THEMES['Clear Dark'];
    const custom = this.settings.customColors || {};
    const bg = custom.background || theme.background;
    const fg = custom.foreground || theme.foreground;
    const cursorColor = custom.cursor || theme.cursor;

    const box = this.overlay.querySelector('.theme-preview-box');
    if (!box) return;
    box.style.background = bg;
    box.style.color = fg;
    box.style.fontFamily = this.settings.fontFamily;
    box.style.fontSize = `${this.settings.fontSize}px`;
    box.style.lineHeight = String(this.settings.lineHeight);

    const promptEls = box.querySelectorAll('.preview-prompt');
    promptEls.forEach(el => el.style.color = theme.green || fg);

    const cursorEl = box.querySelector('.preview-cursor');
    if (cursorEl) cursorEl.style.color = cursorColor;

    // Update swatches bar
    const swatches = this.overlay.querySelector('.theme-preview-swatches');
    if (swatches) {
      swatches.innerHTML = [bg, fg, theme.red, theme.green, theme.blue, theme.yellow].map(c =>
        `<div style="width:16px;height:16px;border-radius:3px;background:${c};border:1px solid rgba(255,255,255,0.15);"></div>`
      ).join('');
    }
  }

  close() {
    if (!this.overlay) return;
    this.overlay.classList.remove('visible');
    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.overlay = null;
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
      }
    }, 200);
  }
}
