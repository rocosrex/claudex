// STTSetupGuideModal - First-run setup guide for whisper-cpp installation
import { Modal } from '../common/Modal.js';
import { Toast } from '../common/Toast.js';

export class STTSetupGuideModal {
  constructor() {
    this.modal = null;
    this.status = null;
    this.content = null;
    this._progressHandler = null;
  }

  async open() {
    this.status = await window.api.stt.checkInstalled();

    this.content = document.createElement('div');
    this.content.innerHTML = this._buildContent(this.status);

    this.modal = new Modal({
      title: '🎙️ STT Setup Guide',
      content: this.content,
      confirmText: 'Close',
      showCancel: false,
      onConfirm: () => {
        this._removeProgressListener();
        this.modal.close();
      },
    });
    this.modal.open();

    this._setupProgressListener();
    requestAnimationFrame(() => this._setupEvents());
  }

  _setupProgressListener() {
    this._progressHandler = (data) => {
      const { step, status, message } = data;
      const logEl = this.content.querySelector(`.stt-setup-log[data-step="${step}"]`);
      if (logEl) {
        logEl.textContent = message;
        logEl.style.display = '';
      }
      if (status === 'done' || status === 'error') {
        this._refreshStatus();
      }
    };
    window.api.stt.onInstallProgress(this._progressHandler);
  }

  _removeProgressListener() {
    // ipcRenderer.on listeners persist, but we null the ref to avoid stale updates
    this._progressHandler = null;
  }

  async _refreshStatus() {
    this.status = await window.api.stt.checkInstalled();
    this.content.innerHTML = this._buildContent(this.status);
    this._setupEvents();

    if (this.status.installed && this.status.hasModel) {
      Toast.show('STT setup complete! Double-tap PgDn to start.', 'success');
    }
  }

  _buildContent(status) {
    const installedIcon = status.installed ? '🟢' : '🔴';
    const modelIcon = status.hasModel ? '🟢' : '🔴';
    const allDone = status.installed && status.hasModel;

    return `
      <div class="stt-setup-guide">
        <p class="text-sm text-slate-400 mb-4">
          whisper-cpp is required to use Speech-to-Text (STT).
        </p>

        <!-- Step 1: Install whisper-cpp -->
        <div class="stt-setup-step ${status.installed ? 'stt-setup-step--done' : ''}">
          <div class="stt-setup-step-header">
            <span class="stt-setup-status-dot">${installedIcon}</span>
            <span class="text-sm font-medium text-slate-200">Step 1: Install whisper-cpp</span>
          </div>
          ${!status.installed ? `
            <div class="stt-setup-step-body">
              <div class="stt-setup-code-block">
                <code>brew install whisper-cpp</code>
                <button class="stt-setup-copy-btn" data-cmd="brew install whisper-cpp" title="Copy">📋</button>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <button class="stt-setup-run-btn btn-primary text-xs px-3 py-1.5" data-action="install">
                  ▶ Auto Install
                </button>
                <span class="text-xs text-slate-500">Installs via Homebrew</span>
              </div>
              <div class="stt-setup-log" data-step="install" style="display:none;"></div>
            </div>
          ` : `
            <div class="stt-setup-step-body">
              <p class="text-xs text-green-400">whisper-cpp is installed.</p>
            </div>
          `}
        </div>

        <!-- Step 2: Download model -->
        <div class="stt-setup-step ${status.hasModel ? 'stt-setup-step--done' : ''}">
          <div class="stt-setup-step-header">
            <span class="stt-setup-status-dot">${modelIcon}</span>
            <span class="text-sm font-medium text-slate-200">Step 2: Download Model</span>
          </div>
          ${!status.hasModel ? `
            <div class="stt-setup-step-body">
              <div class="stt-setup-code-block">
                <code>whisper-cpp --download-model small</code>
                <button class="stt-setup-copy-btn" data-cmd="whisper-cpp --download-model small" title="Copy">📋</button>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <button class="stt-setup-run-btn btn-primary text-xs px-3 py-1.5" data-action="model"
                  ${!status.installed ? 'disabled title="Install whisper-cpp first"' : ''}>
                  ▶ Auto Download
                </button>
                <span class="text-xs text-slate-500">Requires ~500MB disk space</span>
              </div>
              <div class="stt-setup-log" data-step="model" style="display:none;"></div>
            </div>
          ` : `
            <div class="stt-setup-step-body">
              <p class="text-xs text-green-400">Model is ready${status.models ? ` (${status.models.map(m => m.name).join(', ')})` : ''}.</p>
            </div>
          `}
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3 mt-4">
          <button class="stt-setup-recheck-btn btn-secondary text-sm px-3 py-1.5">
            🔄 Recheck
          </button>
          ${allDone ? `
            <span class="text-sm text-green-400">✅ All set! Double-tap PgDn to start STT.</span>
          ` : ''}
        </div>
      </div>
    `;
  }

  _setupEvents() {
    const content = this.content;

    // Copy buttons
    content.querySelectorAll('.stt-setup-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        navigator.clipboard.writeText(cmd).then(() => {
          Toast.show('Command copied to clipboard', 'success');
          btn.textContent = '✅';
          setTimeout(() => { btn.textContent = '📋'; }, 1500);
        });
      });
    });

    // Run buttons (auto install / auto download)
    content.querySelectorAll('.stt-setup-run-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        btn.disabled = true;
        btn.innerHTML = '<span class="stt-spinner" style="width:12px;height:12px;"></span> Running...';

        const logEl = content.querySelector(`.stt-setup-log[data-step="${action === 'install' ? 'install' : 'model'}"]`);
        if (logEl) {
          logEl.textContent = 'Starting...';
          logEl.style.display = '';
        }

        try {
          if (action === 'install') {
            await window.api.stt.installWhisper();
          } else {
            await window.api.stt.downloadModel('small');
          }
        } catch (e) {
          Toast.show(e.message || 'Execution failed', 'error');
          btn.disabled = false;
          btn.textContent = action === 'install' ? '▶ Auto Install' : '▶ Auto Download';
        }
      });
    });

    // Recheck button
    const recheckBtn = content.querySelector('.stt-setup-recheck-btn');
    if (recheckBtn) {
      recheckBtn.addEventListener('click', async () => {
        recheckBtn.disabled = true;
        recheckBtn.textContent = 'Checking...';
        await this._refreshStatus();
      });
    }
  }
}
