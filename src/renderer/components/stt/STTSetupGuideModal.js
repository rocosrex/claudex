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
      title: '🎙️ STT 설정 가이드',
      content: this.content,
      confirmText: '닫기',
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
      Toast.show('STT 설정 완료! PgDn 더블탭으로 시작하세요.', 'success');
    }
  }

  _buildContent(status) {
    const installedIcon = status.installed ? '🟢' : '🔴';
    const modelIcon = status.hasModel ? '🟢' : '🔴';
    const allDone = status.installed && status.hasModel;

    return `
      <div class="stt-setup-guide">
        <p class="text-sm text-slate-400 mb-4">
          음성 입력(STT)을 사용하려면 whisper-cpp가 필요합니다.
        </p>

        <!-- Step 1: Install whisper-cpp -->
        <div class="stt-setup-step ${status.installed ? 'stt-setup-step--done' : ''}">
          <div class="stt-setup-step-header">
            <span class="stt-setup-status-dot">${installedIcon}</span>
            <span class="text-sm font-medium text-slate-200">1단계: whisper-cpp 설치</span>
          </div>
          ${!status.installed ? `
            <div class="stt-setup-step-body">
              <div class="stt-setup-code-block">
                <code>brew install whisper-cpp</code>
                <button class="stt-setup-copy-btn" data-cmd="brew install whisper-cpp" title="복사">📋</button>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <button class="stt-setup-run-btn btn-primary text-xs px-3 py-1.5" data-action="install">
                  ▶ 자동 설치
                </button>
                <span class="text-xs text-slate-500">Homebrew를 사용하여 설치합니다</span>
              </div>
              <div class="stt-setup-log" data-step="install" style="display:none;"></div>
            </div>
          ` : `
            <div class="stt-setup-step-body">
              <p class="text-xs text-green-400">whisper-cpp가 설치되어 있습니다.</p>
            </div>
          `}
        </div>

        <!-- Step 2: Download model -->
        <div class="stt-setup-step ${status.hasModel ? 'stt-setup-step--done' : ''}">
          <div class="stt-setup-step-header">
            <span class="stt-setup-status-dot">${modelIcon}</span>
            <span class="text-sm font-medium text-slate-200">2단계: 모델 다운로드</span>
          </div>
          ${!status.hasModel ? `
            <div class="stt-setup-step-body">
              <div class="stt-setup-code-block">
                <code>whisper-cpp --download-model small</code>
                <button class="stt-setup-copy-btn" data-cmd="whisper-cpp --download-model small" title="복사">📋</button>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <button class="stt-setup-run-btn btn-primary text-xs px-3 py-1.5" data-action="model"
                  ${!status.installed ? 'disabled title="whisper-cpp를 먼저 설치하세요"' : ''}>
                  ▶ 자동 다운로드
                </button>
                <span class="text-xs text-slate-500">약 500MB 디스크 공간 필요</span>
              </div>
              <div class="stt-setup-log" data-step="model" style="display:none;"></div>
            </div>
          ` : `
            <div class="stt-setup-step-body">
              <p class="text-xs text-green-400">모델이 준비되어 있습니다${status.models ? ` (${status.models.map(m => m.name).join(', ')})` : ''}.</p>
            </div>
          `}
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3 mt-4">
          <button class="stt-setup-recheck-btn btn-secondary text-sm px-3 py-1.5">
            🔄 다시 확인
          </button>
          ${allDone ? `
            <span class="text-sm text-green-400">✅ 모든 설정이 완료되었습니다! PgDn 더블탭으로 STT를 시작하세요.</span>
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
          Toast.show('명령어가 복사되었습니다', 'success');
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
        btn.innerHTML = '<span class="stt-spinner" style="width:12px;height:12px;"></span> 실행 중...';

        const logEl = content.querySelector(`.stt-setup-log[data-step="${action === 'install' ? 'install' : 'model'}"]`);
        if (logEl) {
          logEl.textContent = '시작 중...';
          logEl.style.display = '';
        }

        try {
          if (action === 'install') {
            await window.api.stt.installWhisper();
          } else {
            await window.api.stt.downloadModel('small');
          }
        } catch (e) {
          Toast.show(e.message || '실행 실패', 'error');
          btn.disabled = false;
          btn.textContent = action === 'install' ? '▶ 자동 설치' : '▶ 자동 다운로드';
        }
      });
    });

    // Recheck button
    const recheckBtn = content.querySelector('.stt-setup-recheck-btn');
    if (recheckBtn) {
      recheckBtn.addEventListener('click', async () => {
        recheckBtn.disabled = true;
        recheckBtn.textContent = '확인 중...';
        await this._refreshStatus();
      });
    }
  }
}
