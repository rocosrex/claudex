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
    const absolutePath = path.join(dirPath, item.name);
    let isDirectory = item.isDirectory();
    if (!isDirectory && item.isSymbolicLink()) {
      try {
        isDirectory = fs.statSync(absolutePath).isDirectory();
      } catch {
        // broken symlink — leave as file
      }
    }
    out.push({ name: item.name, absolutePath, isDirectory });
  }

  out.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return out;
}

module.exports = { listDir };
