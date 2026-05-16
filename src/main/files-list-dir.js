'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isExcluded } = require('./path-filters');

function listDir(dirPath) {
  if (!dirPath) return [];
  let items;
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const item of items) {
    if (isExcluded(item.name)) continue;
    out.push({
      name: item.name,
      absolutePath: path.join(dirPath, item.name),
      isDirectory: item.isDirectory(),
    });
  }

  out.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return out;
}

module.exports = { listDir };
