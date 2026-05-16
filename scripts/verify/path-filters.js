'use strict';
const assert = require('node:assert/strict');
const { isExcluded, EXCLUDED_NAMES } = require('../../src/main/path-filters');

// Named exclusions
for (const n of ['node_modules', '.git', '.venv', 'dist', 'build', '__pycache__']) {
  assert.equal(isExcluded(n), true, `${n} should be excluded`);
}

// Dotfile / dot-dir family (the bug class)
for (const n of ['.venv-tts', '.venv-prod', '.DS_Store', '.cache', '.idea', '.anything']) {
  assert.equal(isExcluded(n), true, `${n} should be excluded (dotfile rule)`);
}

// Allowed
for (const n of ['src', 'docs', 'remotion', 'output', 'README.md', 'gallery-config.json']) {
  assert.equal(isExcluded(n), false, `${n} should NOT be excluded`);
}

// EXCLUDED_NAMES sanity
assert.ok(EXCLUDED_NAMES instanceof Set);
assert.ok(EXCLUDED_NAMES.has('node_modules'));

console.log('path-filters: OK');
