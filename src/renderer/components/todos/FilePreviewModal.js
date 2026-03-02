// FilePreviewModal - File preview in modal
export class FilePreviewModal {
  constructor() {
    this.overlay = null;
  }

  async show(filePath, fileName) {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay file-preview-modal';
    this.overlay = overlay;

    const card = document.createElement('div');
    card.className = 'modal-card';

    // Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-2';
    header.innerHTML = `
      <h3 class="text-sm font-semibold text-slate-200" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapeHtml(fileName)}</h3>
      <button class="preview-close-btn text-slate-500 hover:text-slate-300 text-lg" style="background:none;border:none;cursor:pointer;padding:0 0.25rem;">&times;</button>
    `;

    // Content area (loading)
    const content = document.createElement('div');
    content.className = 'file-preview-content';
    content.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--color-text-secondary);">로딩 중...</div>';

    // Footer
    const footer = document.createElement('div');
    footer.className = 'file-preview-footer';
    footer.innerHTML = `
      <span class="file-preview-path" title="${this.escapeHtml(filePath)}">${this.escapeHtml(filePath)}</span>
      <button class="btn-secondary finder-btn" style="white-space:nowrap;font-size:0.75rem;padding:0.25rem 0.75rem;">Open in Finder</button>
    `;

    card.appendChild(header);
    card.appendChild(content);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // Close handlers
    header.querySelector('.preview-close-btn').addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // Open in Finder
    footer.querySelector('.finder-btn').addEventListener('click', () => {
      window.api.attachments.openInFinder(filePath);
    });

    // Load file content
    try {
      const result = await window.api.attachments.readFile(filePath);
      content.innerHTML = '';

      if (result.type === 'image') {
        const wrapper = document.createElement('div');
        wrapper.className = 'file-preview-image';
        const img = document.createElement('img');
        img.src = result.data;
        img.alt = fileName;
        wrapper.appendChild(img);
        content.appendChild(wrapper);
      } else if (result.type === 'text') {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = result.data;
        pre.appendChild(code);
        content.appendChild(pre);
      } else {
        content.innerHTML = `
          <div style="padding:2rem;text-align:center;">
            <div style="font-size:2rem;margin-bottom:0.75rem;">📄</div>
            <p class="text-slate-400 text-sm">미리보기를 지원하지 않는 파일입니다</p>
            <p class="text-slate-500 text-xs" style="margin-top:0.5rem;">${this.escapeHtml(result.data || '')}</p>
          </div>
        `;
      }
    } catch (e) {
      content.innerHTML = `
        <div style="padding:2rem;text-align:center;">
          <p class="text-red-400 text-sm">파일을 읽을 수 없습니다</p>
          <p class="text-slate-500 text-xs" style="margin-top:0.5rem;">${this.escapeHtml(e.message)}</p>
        </div>
      `;
    }
  }

  close() {
    if (this.overlay) {
      this.overlay.classList.remove('visible');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 200);
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
