// STT Service - Global singleton for terminal voice input
// Uses VAD (Voice Activity Detection) for continuous hands-free dictation
import { STTSetupGuideModal } from '../components/stt/STTSetupGuideModal.js';

class STTService {
  constructor() {
    this.state = 'idle'; // idle | listening | recording | transcribing
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.vadInterval = null;
    this.silenceStart = null;

    // Callbacks
    this._onTranscribed = null;
    this._onStateChange = null;

    // Config
    this.silenceThreshold = 0.035; // RMS threshold — high enough to ignore distant voices
    this.silenceDuration = 1500;   // ms of silence before stopping
    this.minRecordingMs = 500;     // ignore recordings shorter than this (background noise)
    this.minTextLength = 2;        // discard transcriptions shorter than this (noise artifacts)
    this.selectedModel = 'small';
    this.selectedLanguage = 'ko';

    // Speaker verification
    this.speakerVerificationEnabled = false;
    this.speakerVerificationThreshold = 0.55;

    // PgDn double-tap tracking
    this._lastPgDnTime = 0;
    this._recordingStartTime = 0;
  }

  get isActive() {
    return this.state !== 'idle';
  }

  onTranscribed(callback) {
    this._onTranscribed = callback;
  }

  onStateChange(callback) {
    this._onStateChange = callback;
  }

  _setState(newState) {
    this.state = newState;
    if (this._onStateChange) this._onStateChange(newState);
  }

  setSpeakerVerification(enabled) {
    this.speakerVerificationEnabled = enabled;
  }

  setSpeakerThreshold(threshold) {
    this.speakerVerificationThreshold = threshold;
  }

  /**
   * Call from any keydown handler (xterm, document, etc.)
   * Returns true if double-tap detected (toggled STT) — caller should suppress the key.
   */
  handlePgDnKey() {
    const now = Date.now();
    if (now - this._lastPgDnTime < 300) {
      this._lastPgDnTime = 0;
      this.toggle();
      return true; // double-tap consumed
    }
    this._lastPgDnTime = now;
    return false; // single tap, let it through
  }

  async toggle() {
    if (this.isActive) {
      this.stop();
    } else {
      await this.start();
    }
  }

  async start() {
    if (this.isActive) return;

    // Check whisper installation
    try {
      const status = await window.api.stt.checkInstalled();
      if (!status.installed || !status.hasModel) {
        // Show setup guide modal instead of silently failing
        const guideModal = new STTSetupGuideModal();
        guideModal.open();
        return;
      }
      // Use 'small' if available, otherwise fall back to first available model
      if (status.models.length > 0) {
        const hasSmall = status.models.some(m => m.name === 'small');
        if (!hasSmall) {
          this.selectedModel = status.models[0].name;
        }
      }
    } catch (e) {
      console.error('STT check failed:', e);
      return;
    }

    // Request microphone
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.error('Microphone access denied:', e);
      return;
    }

    // Setup audio analysis for VAD
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);

    this._setState('listening');
    this._startVAD();
  }

  stop() {
    this._stopVAD();
    this._stopRecording(false); // discard any in-progress recording

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }

    this._setState('idle');
  }

  _startVAD() {
    const dataArray = new Float32Array(this.analyser.fftSize);

    this.vadInterval = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(dataArray);

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);

      if (this.state === 'listening') {
        // Waiting for voice
        if (rms > this.silenceThreshold) {
          this._startRecording();
        }
      } else if (this.state === 'recording') {
        if (rms > this.silenceThreshold) {
          // Still speaking, reset silence timer
          this.silenceStart = null;
        } else {
          // Silence detected
          if (!this.silenceStart) {
            this.silenceStart = Date.now();
          } else if (Date.now() - this.silenceStart >= this.silenceDuration) {
            // Silence exceeded threshold, stop recording
            this._stopRecording(true);
          }
        }
      }
    }, 50); // Check every 50ms
  }

  _stopVAD() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    this.silenceStart = null;
  }

  _startRecording() {
    if (this.state !== 'listening' || !this.stream) return;

    this.audioChunks = [];
    this.silenceStart = null;

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      if (this._shouldProcess) {
        this._processRecording();
      }
      this._shouldProcess = false;
    };

    this.mediaRecorder.start();
    this._recordingStartTime = Date.now();
    this._setState('recording');
  }

  _stopRecording(process = false) {
    // Filter: ignore too-short recordings (likely background noise)
    if (process && (Date.now() - this._recordingStartTime) < this.minRecordingMs) {
      process = false;
    }

    this._shouldProcess = process;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.silenceStart = null;
  }

  async _processRecording() {
    if (this.audioChunks.length === 0) {
      this._setState('listening');
      return;
    }

    this._setState('transcribing');

    try {
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const wavBuffer = await this._convertToWav(blob);
      const wavArray = Array.from(new Uint8Array(wavBuffer));

      // Speaker verification gate
      if (this.speakerVerificationEnabled) {
        try {
          const svResult = await window.api.speaker.verify(wavArray, this.speakerVerificationThreshold);
          if (svResult.error) {
            console.warn('Speaker verification error:', svResult.error);
          } else if (!svResult.verified) {
            console.log(`Speaker rejected: score=${svResult.score}, threshold=${svResult.threshold}`);
            this._setState('sv-rejected');
            setTimeout(() => {
              if (this.state === 'sv-rejected' && this.stream) {
                this._setState('listening');
              }
            }, 1500);
            return;
          }
        } catch (e) {
          console.warn('Speaker verification failed, proceeding:', e);
        }
      }

      const result = await window.api.stt.transcribe(
        wavArray,
        { model: this.selectedModel, language: this.selectedLanguage }
      );

      const text = (result.text || '').trim();
      // Filter: discard very short transcriptions (noise artifacts like "어", "음")
      if (text.length >= this.minTextLength && this._onTranscribed) {
        this._onTranscribed(text);
      }
    } catch (e) {
      console.error('STT transcription failed:', e);
    }

    // Return to listening if still active
    if (this.state === 'transcribing' && this.stream) {
      this._setState('listening');
    }
  }

  async _convertToWav(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 16000);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Resample to 16kHz mono
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
}

// Global singleton
export const sttService = new STTService();
