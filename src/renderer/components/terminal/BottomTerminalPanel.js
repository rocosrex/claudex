// BottomTerminalPanel - Slide-up terminal panel available on all screens
import { TerminalPanel } from './TerminalPanel.js';

export class BottomTerminalPanel {
  constructor() {
    this.container = null;
    this.terminalPanel = null;
    this.visible = false;
    this.panelHeight = Math.round(window.innerHeight / 3);
    this.minHeight = 150;
    this.maxHeightRatio = 0.8;
    this.resizing = false;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'bottom-terminal-panel';
    el.style.height = `${this.panelHeight}px`;

    el.innerHTML = `
      <div class="resize-handle"></div>
      <div class="bottom-terminal-content" style="flex:1; overflow:hidden; display:flex; flex-direction:column;"></div>
    `;

    this.container = el;
    this.setupResize();

    // Create embedded terminal panel (no project context — blank terminal)
    this.terminalPanel = new TerminalPanel('__bottom__', '', { mode: 'panel' });
    const content = el.querySelector('.bottom-terminal-content');
    content.appendChild(this.terminalPanel.render());

    return el;
  }

  setupResize() {
    const handle = this.container.querySelector('.resize-handle');
    let startY = 0;
    let startHeight = 0;

    const onMouseMove = (e) => {
      if (!this.resizing) return;
      const delta = startY - e.clientY;
      const maxHeight = Math.round(window.innerHeight * this.maxHeightRatio);
      const newHeight = Math.max(this.minHeight, Math.min(maxHeight, startHeight + delta));
      this.panelHeight = newHeight;
      this.container.style.height = `${newHeight}px`;
      this.updateMainContentHeight();
    };

    const onMouseUp = () => {
      this.resizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.resizing = true;
      startY = e.clientY;
      startHeight = this.panelHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  toggle() {
    this.visible = !this.visible;
    this.container.classList.toggle('visible', this.visible);
    this.updateMainContentHeight();

    if (this.visible) {
      // Fit terminal after animation
      setTimeout(() => {
        if (this.terminalPanel && this.terminalPanel.fitAddon) {
          try {
            this.terminalPanel.fitAddon.fit();
          } catch (e) { /* ignore */ }
        }
      }, 350);
    }
  }

  show() {
    if (!this.visible) this.toggle();
  }

  hide() {
    if (this.visible) this.toggle();
  }

  updateMainContentHeight() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    if (this.visible) {
      mainContent.style.paddingBottom = `${this.panelHeight}px`;
    } else {
      mainContent.style.paddingBottom = '0';
    }
  }

  destroy() {
    if (this.terminalPanel) {
      this.terminalPanel.destroy();
    }
  }
}
