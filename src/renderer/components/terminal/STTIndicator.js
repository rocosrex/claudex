// STTIndicator - Floating pill indicator for STT state in terminal views

export class STTIndicator {
  constructor() {
    this.container = null;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'stt-indicator';
    el.style.display = 'none';
    el.innerHTML = `
      <span class="stt-indicator-icon"></span>
      <span class="stt-indicator-text"></span>
    `;
    this.container = el;
    return el;
  }

  update(state) {
    if (!this.container) return;

    if (state === 'idle') {
      this.container.style.display = 'none';
      this.container.className = 'stt-indicator';
      return;
    }

    this.container.style.display = 'flex';
    const icon = this.container.querySelector('.stt-indicator-icon');
    const text = this.container.querySelector('.stt-indicator-text');

    switch (state) {
      case 'listening':
        this.container.className = 'stt-indicator stt-indicator-listening';
        icon.textContent = '\uD83C\uDF99';
        text.textContent = '\uC74C\uC131 \uB300\uAE30';
        break;
      case 'recording':
        this.container.className = 'stt-indicator stt-indicator-recording';
        icon.textContent = '\uD83D\uDD34';
        text.textContent = '\uB179\uC74C \uC911';
        break;
      case 'transcribing':
        this.container.className = 'stt-indicator stt-indicator-transcribing';
        icon.textContent = '\u23F3';
        text.textContent = '\uBCC0\uD658 \uC911...';
        break;
      case 'sv-rejected':
        this.container.className = 'stt-indicator stt-indicator-rejected';
        icon.textContent = '\uD83D\uDEAB';
        text.textContent = '\uB2E4\uB978 \uD654\uC790';
        break;
    }
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.remove();
    }
    this.container = null;
  }
}
