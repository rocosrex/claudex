// Modal - Reusable modal dialog component

export class Modal {
  constructor({ title, content, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', showCancel = true }) {
    this.title = title;
    this.content = content;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.confirmText = confirmText;
    this.cancelText = cancelText;
    this.showCancel = showCancel;
    this.overlay = null;
  }

  render() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-slate-100">${this.title}</h2>
          <button class="modal-close-btn text-slate-400 hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>
        <div class="modal-body mb-6"></div>
        <div class="flex justify-end gap-2">
          ${this.showCancel ? `<button class="modal-cancel-btn btn-secondary">${this.cancelText}</button>` : ''}
          <button class="modal-confirm-btn btn-primary">${this.confirmText}</button>
        </div>
      </div>
    `;

    const body = overlay.querySelector('.modal-body');
    if (typeof this.content === 'string') {
      body.innerHTML = this.content;
    } else if (this.content instanceof HTMLElement) {
      body.appendChild(this.content);
    }

    // Close button
    overlay.querySelector('.modal-close-btn').addEventListener('click', () => this.close());

    // Cancel button
    const cancelBtn = overlay.querySelector('.modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (this.onCancel) this.onCancel();
        this.close();
      });
    }

    // Confirm button
    overlay.querySelector('.modal-confirm-btn').addEventListener('click', () => {
      if (this.onConfirm) this.onConfirm();
    });

    // Click outside to close (only when mousedown also started on overlay)
    let mouseDownTarget = null;
    overlay.addEventListener('mousedown', (e) => {
      mouseDownTarget = e.target;
    });
    overlay.addEventListener('mouseup', (e) => {
      if (e.target === overlay && mouseDownTarget === overlay) this.close();
      mouseDownTarget = null;
    });

    // Escape to close
    this._escHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._escHandler);

    this.overlay = overlay;
    return overlay;
  }

  open() {
    if (!this.overlay) this.render();
    document.body.appendChild(this.overlay);
    requestAnimationFrame(() => {
      this.overlay.classList.add('visible');
    });
  }

  close() {
    if (!this.overlay) return;
    this.overlay.classList.remove('visible');
    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
      }
    }, 200);
  }
}
