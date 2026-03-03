'use strict';

const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const TMP_DIR = path.join(os.tmpdir(), 'claudex-stt');

// Ensure temp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function findWhisperBinary() {
  // brew install whisper-cpp installs as "whisper-cli"
  const names = ['whisper-cli', 'whisper-cpp'];
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin'];
  for (const name of names) {
    for (const dir of dirs) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  // Try PATH
  for (const name of names) {
    try {
      const result = execSync(`which ${name}`, { encoding: 'utf-8' }).trim();
      if (result) return result;
    } catch (e) { /* not found */ }
  }
  return null;
}

function getModelSearchDirs() {
  const homeDir = os.homedir();
  return [
    '/opt/homebrew/share/whisper-cpp',
    '/usr/local/share/whisper-cpp',
    '/opt/homebrew/share/whisper-cpp/models',
    '/usr/local/share/whisper-cpp/models',
    path.join(homeDir, '.cache', 'whisper-cpp'),
    path.join(homeDir, '.local', 'share', 'whisper-cpp'),
  ];
}

function findModelPath(modelName = 'small') {
  // Also match partial names like "for-tests-ggml-tiny" → "for-tests-ggml-tiny"
  const fileNames = [`ggml-${modelName}.bin`, `for-tests-ggml-${modelName}.bin`];
  for (const dir of getModelSearchDirs()) {
    for (const fn of fileNames) {
      const p = path.join(dir, fn);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function listAvailableModels() {
  const models = [];
  const searchDirs = getModelSearchDirs();
  const seen = new Set();
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const match = f.match(/^(?:for-tests-)?ggml-(.+)\.bin$/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        models.push({
          name: match[1],
          path: fullPath,
          sizeMB: Math.round(stat.size / 1024 / 1024),
        });
      }
    }
  }
  return models;
}

function checkWhisperInstalled() {
  const binary = findWhisperBinary();
  const models = listAvailableModels();
  return {
    installed: !!binary,
    binaryPath: binary,
    models,
    hasModel: models.length > 0,
  };
}

function transcribeAudio(wavBuffer, options = {}) {
  return new Promise((resolve, reject) => {
    const binary = findWhisperBinary();
    if (!binary) {
      return reject(new Error('whisper-cpp not found. Install with: brew install whisper-cpp'));
    }

    const modelName = options.model || 'small';
    const modelPath = findModelPath(modelName);
    if (!modelPath) {
      return reject(new Error(`Model "${modelName}" not found. Download with: whisper-cpp --download-model ${modelName}`));
    }

    // Write WAV buffer to temp file
    const tmpFile = path.join(TMP_DIR, `stt-${uuidv4()}.wav`);
    fs.writeFileSync(tmpFile, Buffer.from(wavBuffer));

    const args = [
      '-m', modelPath,
      '-f', tmpFile,
      '-l', options.language || 'ko',
      '--no-timestamps',
      '-t', String(options.threads || 4),
    ];

    const startTime = Date.now();

    execFile(binary, args, { timeout: 60000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }

      if (error) {
        return reject(new Error(`whisper-cpp error: ${error.message}\n${stderr}`));
      }

      const elapsed = Date.now() - startTime;
      // Parse output - whisper-cpp outputs text lines, strip leading/trailing whitespace
      const text = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join(' ')
        .trim();

      resolve({
        text,
        model: modelName,
        language: options.language || 'ko',
        elapsedMs: elapsed,
      });
    });
  });
}

// Clean up old temp files on startup
function cleanupTempFiles() {
  try {
    if (!fs.existsSync(TMP_DIR)) return;
    const files = fs.readdirSync(TMP_DIR);
    const now = Date.now();
    for (const f of files) {
      const fullPath = path.join(TMP_DIR, f);
      const stat = fs.statSync(fullPath);
      // Remove files older than 1 hour
      if (now - stat.mtimeMs > 3600000) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (e) { /* ignore */ }
}

cleanupTempFiles();

module.exports = {
  checkWhisperInstalled,
  transcribeAudio,
  listAvailableModels,
};
