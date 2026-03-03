'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');

const ENROLLMENT_FILE = 'speaker-enrollment.json';
const MODEL_DIR = path.join(__dirname, '../../models/speaker');
const MODEL_FILENAME = '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx';
const WORKER_SCRIPT = path.join(__dirname, 'speaker-worker.js');
const TMP_DIR = path.join(os.tmpdir(), 'claudex-sv');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function getEnrollmentPath() {
  return path.join(app.getPath('userData'), ENROLLMENT_FILE);
}

function getModelPath() {
  return path.join(MODEL_DIR, MODEL_FILENAME);
}

// Find system Node.js binary (not Electron)
function findNodeBinary() {
  const { execSync } = require('child_process');
  const candidates = ['/opt/homebrew/bin/node', '/usr/local/bin/node'];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    return execSync('/bin/sh -c "which node"', { encoding: 'utf-8' }).trim();
  } catch (e) {
    return 'node';
  }
}

// Run speaker-worker.js in a separate system Node.js process
// Electron's V8 disallows external buffers in native addons, so we must use system node
function runWorker(wavFile) {
  const modelPath = getModelPath();
  const nodeBin = findNodeBinary();
  const result = execFileSync(nodeBin, [WORKER_SCRIPT, 'extract', modelPath, wavFile], {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    cwd: path.join(__dirname, '../..'),
  });
  return JSON.parse(result.toString('utf-8'));
}

function extractEmbedding(wavBuffer) {
  const tmpFile = path.join(TMP_DIR, `sv-${uuidv4()}.wav`);
  fs.writeFileSync(tmpFile, Buffer.from(wavBuffer));

  try {
    const result = runWorker(tmpFile);
    if (result.error) throw new Error(result.error);
    return result.embedding;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
  }
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error('Embedding dimension mismatch');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function loadEnrollment() {
  const p = getEnrollmentPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function saveEnrollment(data) {
  fs.writeFileSync(getEnrollmentPath(), JSON.stringify(data, null, 2), 'utf-8');
}

// --- Public API ---

function checkModelInstalled() {
  const modelPath = getModelPath();
  const modelExists = fs.existsSync(modelPath);
  let sherpaAvailable = false;
  try {
    require.resolve('sherpa-onnx-node');
    sherpaAvailable = true;
  } catch (e) { /* not installed */ }
  return {
    installed: sherpaAvailable && modelExists,
    modelPath: modelExists ? modelPath : null,
    sherpaAvailable,
    modelExists,
  };
}

function isEnrolled() {
  const enrollment = loadEnrollment();
  return {
    enrolled: !!(enrollment && enrollment.embedding && enrollment.embedding.length > 0),
    enrolledAt: enrollment?.enrolledAt || null,
  };
}

function enroll(wavBuffer) {
  const startTime = Date.now();
  const embedding = extractEmbedding(Buffer.from(wavBuffer));
  const elapsed = Date.now() - startTime;

  const data = {
    embedding,
    dim: embedding.length,
    enrolledAt: new Date().toISOString(),
    extractionMs: elapsed,
  };
  saveEnrollment(data);

  return {
    success: true,
    dim: embedding.length,
    extractionMs: elapsed,
  };
}

function verify(wavBuffer, threshold = 0.55) {
  const enrollment = loadEnrollment();
  if (!enrollment || !enrollment.embedding) {
    return { verified: false, error: 'No enrollment found', score: 0 };
  }

  const startTime = Date.now();
  const embedding = extractEmbedding(Buffer.from(wavBuffer));
  const elapsed = Date.now() - startTime;

  const score = cosineSimilarity(embedding, enrollment.embedding);

  return {
    verified: score >= threshold,
    score: Math.round(score * 1000) / 1000,
    threshold,
    extractionMs: elapsed,
  };
}

function deleteEnrollment() {
  const p = getEnrollmentPath();
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
  return { success: true };
}

module.exports = {
  checkModelInstalled,
  isEnrolled,
  enroll,
  verify,
  deleteEnrollment,
};
