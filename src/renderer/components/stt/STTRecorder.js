// STTRecorder - Whisper.cpp Speech-to-Text recorder component
import { Toast } from '../common/Toast.js';

export class STTRecorder {
  constructor() {
    this.container = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.audioContext = null;
    this.analyser = null;
    this.animationFrame = null;
    this.stream = null;
    this.whisperStatus = null;
    this.selectedModel = 'small';
    this.selectedLanguage = 'ko';
    this.results = [];
  }

  render() {
    const el = document.createElement('div');
    el.className = 'stt-view h-full overflow-y-auto p-6';
    el.innerHTML = `
      <div class="max-w-3xl mx-auto">
        <div class="flex items-center gap-3 mb-6">
          <span class="text-3xl">🎙️</span>
          <div>
            <h2 class="text-xl font-semibold text-slate-100">Speech to Text</h2>
            <p class="text-sm text-slate-400">whisper.cpp 로컬 음성 인식 (PoC)</p>
          </div>
        </div>

        <!-- Status Card -->
        <div class="stt-status-card card p-4 mb-6">
          <div class="flex items-center gap-2 mb-2">
            <span class="stt-status-dot"></span>
            <span class="stt-status-text text-sm text-slate-400">상태 확인 중...</span>
          </div>
          <div class="stt-status-detail text-xs text-slate-500"></div>
        </div>

        <!-- Settings -->
        <div class="card p-4 mb-6">
          <h3 class="text-sm font-medium text-slate-300 mb-3">설정</h3>
          <div class="flex gap-4">
            <div class="flex-1">
              <label class="block text-xs text-slate-500 mb-1">모델</label>
              <select class="stt-model-select input text-sm w-full">
                <option value="small">small (기본, ~500MB)</option>
              </select>
            </div>
            <div class="flex-1">
              <label class="block text-xs text-slate-500 mb-1">언어</label>
              <select class="stt-lang-select input text-sm w-full">
                <option value="ko">한국어</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="zh">中文</option>
                <option value="auto">자동 감지</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Recorder -->
        <div class="card p-6 mb-6 text-center">
          <canvas class="stt-waveform mx-auto mb-4" width="400" height="80" style="border-radius:8px;background:#1e293b;max-width:100%;"></canvas>

          <div class="flex items-center justify-center gap-4 mb-4">
            <button class="stt-record-btn w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all"
                    style="background:rgba(239,68,68,0.15); color:#ef4444; border:2px solid rgba(239,68,68,0.3);"
                    title="녹음 시작 / 중지">
              ⏺
            </button>
          </div>

          <div class="stt-record-status text-sm text-slate-500">마이크 버튼을 눌러 녹음을 시작하세요</div>
          <div class="stt-record-timer text-xs text-slate-600 mt-1" style="display:none;">0:00</div>
        </div>

        <!-- Transcribing indicator -->
        <div class="stt-transcribing card p-4 mb-6 text-center" style="display:none;">
          <div class="flex items-center justify-center gap-2">
            <div class="stt-spinner"></div>
            <span class="text-sm text-slate-300">변환 중...</span>
          </div>
        </div>

        <!-- Results -->
        <div class="stt-results"></div>
      </div>
    `;

    this.container = el;
    this.setupEvents();
    this.checkStatus();
    return el;
  }

  setupEvents() {
    // Record button
    this.container.querySelector('.stt-record-btn').addEventListener('click', () => {
      if (this.isRecording) {
        this.stopRecording();
      } else {
        this.startRecording();
      }
    });

    // Model select
    this.container.querySelector('.stt-model-select').addEventListener('change', (e) => {
      this.selectedModel = e.target.value;
    });

    // Language select
    this.container.querySelector('.stt-lang-select').addEventListener('change', (e) => {
      this.selectedLanguage = e.target.value;
    });
  }

  async checkStatus() {
    const statusDot = this.container.querySelector('.stt-status-dot');
    const statusText = this.container.querySelector('.stt-status-text');
    const statusDetail = this.container.querySelector('.stt-status-detail');

    try {
      const status = await window.api.stt.checkInstalled();
      this.whisperStatus = status;

      if (status.installed && status.hasModel) {
        statusDot.style.background = '#22c55e';
        statusText.textContent = 'whisper-cpp 준비 완료';
        statusDetail.textContent = `Binary: ${status.binaryPath}`;

        // Populate model select
        if (status.models.length > 0) {
          const select = this.container.querySelector('.stt-model-select');
          select.innerHTML = '';
          status.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = `${m.name} (${m.sizeMB}MB)`;
            select.appendChild(opt);
          });
          this.selectedModel = status.models[0].name;
        }
      } else if (status.installed && !status.hasModel) {
        statusDot.style.background = '#f59e0b';
        statusText.textContent = '모델을 다운로드하세요';
        statusDetail.innerHTML = '<code style="background:#1e293b;padding:2px 6px;border-radius:4px;">whisper-cpp --download-model small</code>';
      } else {
        statusDot.style.background = '#ef4444';
        statusText.textContent = 'whisper-cpp가 설치되지 않았습니다';
        statusDetail.innerHTML = '<code style="background:#1e293b;padding:2px 6px;border-radius:4px;">brew install whisper-cpp</code>';
      }
    } catch (e) {
      statusDot.style.background = '#ef4444';
      statusText.textContent = '상태 확인 실패';
      statusDetail.textContent = e.message;
    }
  }

  async startRecording() {
    if (!this.whisperStatus?.installed || !this.whisperStatus?.hasModel) {
      Toast.show('whisper-cpp가 설치되지 않았거나 모델이 없습니다', 'error');
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      Toast.show('마이크 접근이 거부되었습니다', 'error');
      return;
    }

    this.audioChunks = [];
    this.isRecording = true;

    // Setup audio context for waveform visualization
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
    this.drawWaveform();

    // Use MediaRecorder
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => this.processRecording();
    this.mediaRecorder.start();

    // Update UI
    const btn = this.container.querySelector('.stt-record-btn');
    btn.textContent = '⏹';
    btn.style.background = 'rgba(239,68,68,0.3)';
    btn.style.borderColor = '#ef4444';
    btn.classList.add('stt-recording-pulse');

    this.container.querySelector('.stt-record-status').textContent = '녹음 중... 버튼을 눌러 중지';
    const timerEl = this.container.querySelector('.stt-record-timer');
    timerEl.style.display = '';
    this.recordStart = Date.now();
    this.timerInterval = setInterval(() => {
      const secs = Math.floor((Date.now() - this.recordStart) / 1000);
      timerEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }, 200);
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;

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
    clearInterval(this.timerInterval);

    // Reset UI
    const btn = this.container.querySelector('.stt-record-btn');
    btn.textContent = '⏺';
    btn.style.background = 'rgba(239,68,68,0.15)';
    btn.style.borderColor = 'rgba(239,68,68,0.3)';
    btn.classList.remove('stt-recording-pulse');
    this.container.querySelector('.stt-record-timer').style.display = 'none';
  }

  async processRecording() {
    if (this.audioChunks.length === 0) return;

    this.container.querySelector('.stt-record-status').textContent = 'WAV 변환 중...';
    this.container.querySelector('.stt-transcribing').style.display = '';

    try {
      // Convert webm to WAV
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const wavBuffer = await this.convertToWav(blob);

      this.container.querySelector('.stt-record-status').textContent = 'whisper-cpp 변환 중...';

      // Send to main process
      const result = await window.api.stt.transcribe(
        Array.from(new Uint8Array(wavBuffer)),
        { model: this.selectedModel, language: this.selectedLanguage }
      );

      this.addResult(result);
      this.container.querySelector('.stt-record-status').textContent = '마이크 버튼을 눌러 녹음을 시작하세요';
    } catch (e) {
      Toast.show(`변환 실패: ${e.message}`, 'error');
      this.container.querySelector('.stt-record-status').textContent = '변환 실패. 다시 시도하세요.';
    } finally {
      this.container.querySelector('.stt-transcribing').style.display = 'none';
    }
  }

  async convertToWav(blob) {
    // Decode audio blob to AudioBuffer, then encode as WAV
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 16000);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Resample to 16kHz mono (whisper-cpp requirement)
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * 16000), 16000);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    const resampled = await offlineCtx.startRendering();

    // Encode as WAV
    return this.encodeWav(resampled);
  }

  encodeWav(audioBuffer) {
    const numChannels = 1;
    const sampleRate = audioBuffer.sampleRate;
    const samples = audioBuffer.getChannelData(0);
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = samples.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return buffer;
  }

  addResult(result) {
    this.results.unshift(result);
    this.renderResults();
  }

  renderResults() {
    const container = this.container.querySelector('.stt-results');
    container.innerHTML = '';

    if (this.results.length === 0) return;

    const header = document.createElement('h3');
    header.className = 'text-sm font-medium text-slate-400 mb-3';
    header.textContent = `변환 결과 (${this.results.length})`;
    container.appendChild(header);

    this.results.forEach((r, idx) => {
      const card = document.createElement('div');
      card.className = 'card p-4 mb-3';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <p class="text-slate-200 flex-1" style="white-space:pre-wrap;word-break:break-word;">${this.escapeHtml(r.text) || '<span class="text-slate-500">(인식된 텍스트 없음)</span>'}</p>
          <button class="stt-copy-btn text-xs text-slate-500 hover:text-slate-300 flex-shrink-0" data-idx="${idx}" title="복사">📋</button>
        </div>
        <div class="flex gap-3 mt-2 text-xs text-slate-500">
          <span>모델: ${r.model}</span>
          <span>언어: ${r.language}</span>
          <span>소요: ${(r.elapsedMs / 1000).toFixed(1)}s</span>
        </div>
      `;
      card.querySelector('.stt-copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(r.text).then(() => Toast.show('복사됨', 'info', 1500));
      });
      container.appendChild(card);
    });
  }

  drawWaveform() {
    if (!this.analyser || !this.isRecording) return;
    const canvas = this.container.querySelector('.stt-waveform');
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
      ctx.strokeStyle = '#ef4444';
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

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  destroy() {
    this.stopRecording();
  }
}
