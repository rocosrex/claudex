import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolutePath), `${relativePath} must exist`);
  return fs.readFileSync(absolutePath, 'utf8');
}

const files = [
  'src/main/main.js',
  'src/renderer/app.js',
  'src/renderer/components/project/ProjectDetail.js',
  'src/renderer/components/terminal/TerminalPanel.js',
  'src/renderer/components/terminal/MultiTerminalView.js',
  'src/renderer/utils/stt-service.js',
];

for (const file of files) {
  const source = read(file);
  assert.ok(source.length > 0, `${file} must not be empty`);
}

console.log('terminal crash recovery verification harness is ready');
