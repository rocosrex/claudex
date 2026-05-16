'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

// Bypass Electron — exercise the pure function directly.
const { listDir } = require('../../src/main/files-list-dir');

const ROOT = '/Users/rocos.rex/Projects/unitygame/bloom-forge';

if (!require('node:fs').existsSync(ROOT)) {
  console.log('list-dir-perf: SKIP (bloom-forge not found at expected path)');
  process.exit(0);
}

const t0 = Date.now();
const entries = listDir(ROOT);
const ms = Date.now() - t0;

console.log(`listDir returned ${entries.length} entries in ${ms}ms`);

// Smoke: under 100ms for a 1-level read, even on a 2.3GB project root.
assert.ok(ms < 100, `listDir took ${ms}ms (>100ms budget)`);

// Must not contain .venv-tts (excluded by dotfile rule)
assert.ok(!entries.some(e => e.name === '.venv-tts'),
  '.venv-tts must not appear in listDir output');

// Must contain at least the well-known visible entries.
for (const n of ['scripts', 'docs', 'gallery-config.json']) {
  assert.ok(entries.some(e => e.name === n), `expected to see ${n}`);
}

// Payload size guard: serialized < 50KB
const bytes = Buffer.byteLength(JSON.stringify(entries), 'utf8');
assert.ok(bytes < 50_000, `payload ${bytes}B exceeds 50KB`);
console.log(`payload ${bytes}B — OK`);

// Each entry shape: { name, absolutePath, isDirectory }
for (const e of entries) {
  assert.equal(typeof e.name, 'string');
  assert.equal(typeof e.absolutePath, 'string');
  assert.equal(typeof e.isDirectory, 'boolean');
  assert.equal(e.absolutePath, path.join(ROOT, e.name));
}
console.log('list-dir-perf: OK');
