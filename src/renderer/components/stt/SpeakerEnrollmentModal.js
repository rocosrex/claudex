// SpeakerEnrollmentModal - Voice enrollment UI for speaker verification
import { Modal } from '../common/Modal.js';
import { Toast } from '../common/Toast.js';

export class SpeakerEnrollmentModal {
  constructor() {
    this.modal = null;
    this.stream = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioContext = null;
    this.analyser = null;
    this.animationFrame = null;
    this.isRecording = false;
    this.recordStart = 0;
    this.timerInterval = null;
    this.minDuration = 5;  // seconds
    this.maxDuration = 15; // seconds
  }

  async open() {
    // Check enrollment status
    const status = await window.api.speaker.isEnrolled();
    const modelStatus = await window.api.speaker.checkModel();

    const content = document.createElement('div');
    content.innerHTML = this._buildContent(status, modelStatus);

    this.modal = new Modal({
      title: '🔐 화자 등록 (Speaker Enrollment)',
      content,
      confirmText: '닫기',
      showCancel: false,
      onConfirm: () => {
        this._cleanup();
        this.modal.close();
      },
    });
    this.modal.open();

    // Setup events after DOM is rendered
    requestAnimationFrame(() => this._setupEvents(content, status, modelStatus));
  }

  _buildContent(status, modelStatus) {
    if (!modelStatus.installed) {
      return `
        <div class="text-center py-4">
          <div class="text-3xl mb-3">⚠️</div>
          <p class="text-slate-300 mb-2">Speaker 모델이 설치되지 않았습니다</p>
          <p class="text-xs text-slate-500 mb-3">
            ${!modelStatus.sherpaAvailable ? 'sherpa-onnx 패키지를 설치하세요: <code>npm install && npm run rebuild</code>' : ''}
            ${!modelStatus.modelExists ? '모델 파일을 models/speaker/ 에 배치하세요' : ''}
          </p>
          <p class="text-xs text-slate-600">3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx (~30MB)</p>
        </div>
      `;
    }

    return `
      <div class="sv-enrollment-content">
        <!-- Status -->
        <div class="flex items-center gap-2 mb-4 p-3 rounded-lg" style="background:rgba(30,41,59,0.5);">
          <span class="sv-status-dot" style="width:8px;height:8px;border-radius:50%;background:${status.enrolled ? '#22c55e' : '#64748b'};flex-shrink:0;"></span>
          <span class="sv-status-text text-sm text-slate-300">
            ${status.enrolled ? `등록됨 (${new Date(status.enrolledAt).toLocaleDateString('ko')})` : '미등록 — 아래에서 음성을 등록하세요'}
          </span>
          ${status.enrolled ? '<button class="sv-delete-btn text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 ml-auto">삭제</button>' : ''}
        </div>

        <!-- Recorder -->
        <div class="text-center">
          <p class="text-xs text-slate-500 mb-3">5~15초 동안 자연스럽게 말해주세요 (아무 내용이나 OK)</p>
          <canvas class="sv-waveform mx-auto mb-3" width="360" height="60" style="border-radius:8px;background:#1e293b;max-width:100%;"></canvas>

          <div class="flex items-center justify-center gap-4 mb-3">
            <button class="sv-record-btn w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all"
                    style="background:rgba(99,102,241,0.15); color:#6366f1; border:2px solid rgba(99,102,241,0.3);">
              ⏺
            </button>
          </div>

          <div class="sv-record-status text-sm text-slate-500">버튼을 눌러 녹음 시작</div>
          <div class="sv-record-timer text-xs text-slate-600 mt-1" style="display:none;">0:00</div>

          <!-- Progress bar for min duration -->
          <div class="sv-progress-bar mt-3" style="display:none;">
            <div style="height:3px;background:rgba(99,102,241,0.2);border-radius:2px;overflow:hidden;">
              <div class="sv-progress-fill" style="height:100%;background:#6366f1;border-radius:2px;width:0%;transition:width 0.2s ease;"></div>
            </div>
            <div class="text-xs text-slate-600 mt-1 sv-progress-text"></div>
          </div>
        </div>

        <!-- Enrolling indicator -->
        <div class="sv-enrolling text-center mt-4" style="display:none;">
          <div class="flex items-center justify-center gap-2">
            <div class="stt-spinner"></div>
            <span class="text-sm text-slate-300">Embedding 추출 중...</span>
          </div>
        </div>
      </div>
    `;
  }

  _setupEvents(content, status, modelStatus) {
    if (!modelStatus.installed) return;

    const recordBtn = content.querySelector('.sv-record-btn');
    if (recordBtn) {
      recordBtn.addEventListener('click', () => {
        if (this.isRecording) {
          this._stopRecording();
        } else {
          this._startRecording(content);
        }
      });
    }

    const deleteBtn = content.querySelector('.sv-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        await window.api.speaker.deleteEnrollment();
        Toast.show('화자 등록 삭제됨', 'info');
        this._cleanup();
        this.modal.close();
        // Re-open to refresh
        this.open();
      });
    }
  }

  async _startRecording(content) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      Toast.show('마이크 접근이 거부되었습니다', 'error');
      return;
    }

    this.audioChunks = [];
    this.isRecording = true;
    this.recordStart = Date.now();

    // Audio context for waveform
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
    this._drawWaveform(content.querySelector('.sv-waveform'));

    // MediaRecorder
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => this._processEnrollment(content);
    this.mediaRecorder.start();

    // UI updates
    const btn = content.querySelector('.sv-record-btn');
    btn.textContent = '⏹';
    btn.style.background = 'rgba(239,68,68,0.3)';
    btn.style.borderColor = '#ef4444';
    btn.style.color = '#ef4444';

    content.querySelector('.sv-record-status').textContent = '녹음 중... 5초 이상 말해주세요';
    const timerEl = content.querySelector('.sv-record-timer');
    timerEl.style.display = '';

    const progressBar = content.querySelector('.sv-progress-bar');
    progressBar.style.display = '';

    this.timerInterval = setInterval(() => {
      const secs = Math.floor((Date.now() - this.recordStart) / 1000);
      timerEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

      // Progress towards min duration
      const progress = Math.min(100, (secs / this.minDuration) * 100);
      content.querySelector('.sv-progress-fill').style.width = `${progress}%`;
      content.querySelector('.sv-progress-text').textContent =
        secs < this.minDuration ? `최소 ${this.minDuration - secs}초 더 필요` : '충분합니다. 버튼을 눌러 완료하세요';

      // Auto-stop at max duration
      if (secs >= this.maxDuration) {
        this._stopRecording();
      }
    }, 200);
  }

  _stopRecording() {
    if (!this.isRecording) return;

    const elapsed = (Date.now() - this.recordStart) / 1000;
    if (elapsed < this.minDuration) {
      Toast.show(`최소 ${this.minDuration}초 이상 녹음해주세요`, 'warning');
      return;
    }

    this.isRecording = false;
    clearInterval(this.timerInterval);

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  async _processEnrollment(content) {
    if (this.audioChunks.length === 0) return;

    content.querySelector('.sv-record-status').textContent = '처리 중...';
    const enrollingEl = content.querySelector('.sv-enrolling');
    if (enrollingEl) enrollingEl.style.display = '';

    try {
      // Convert to WAV
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const wavBuffer = await this._convertToWav(blob);
      const wavArray = Array.from(new Uint8Array(wavBuffer));

      // Enroll
      const result = await window.api.speaker.enroll(wavArray);
      if (result.error) {
        Toast.show(`등록 실패: ${result.error}`, 'error');
        content.querySelector('.sv-record-status').textContent = '등록 실패. 다시 시도하세요.';
      } else {
        Toast.show(`화자 등록 완료 (${result.extractionMs}ms)`, 'success');
        this._cleanup();
        this.modal.close();
      }
    } catch (e) {
      Toast.show(`등록 실패: ${e.message}`, 'error');
      content.querySelector('.sv-record-status').textContent = '등록 실패. 다시 시도하세요.';
    } finally {
      if (enrollingEl) enrollingEl.style.display = 'none';
    }
  }

  async _convertToWav(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 16000);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * 16000), 16000);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    const resampled = await offlineCtx.startRendering();

    return this._encodeWav(resampled);
  }

  _encodeWav(audioBuffer) {
    const numChannels = 1;
    const sampleRate = audioBuffer.sampleRate;
    const samples = audioBuffer.getChannelData(0);
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = samples.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    return buffer;
  }

  _drawWaveform(canvas) {
    if (!this.analyser || !this.isRecording || !canvas) return;
    const ctx = canvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.isRecording) return;
      this.animationFrame = requestAnimationFrame(draw);
      this.analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#6366f1';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  }

  _cleanup() {
    this.isRecording = false;
    clearInterval(this.timerInterval);
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
