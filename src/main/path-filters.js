'use strict';

// Heavy / generated directories we never want to enumerate or watch.
// Kept as a Set for O(1) name lookups by the project-tree walker.
const EXCLUDED_NAMES = new Set([
  // Non-dot names only — dot-prefixed dirs are already caught by isExcluded's
  // leading-dot check above. Don't add '.something' entries here.
  'node_modules', 'dist', 'build', 'out',
  '__pycache__', 'coverage',
]);

// Anything starting with '.' is treated as excluded. This catches the
// .venv / .venv-tts / .venv-* family, .git, .DS_Store, IDE folders, etc.
// in a single rule, keeping walker and chokidar consistent.
// `name` must be a single path segment (directory entry name), not a path.
function isExcluded(name) {
  if (!name) return false;
  if (name.charCodeAt(0) === 46) return true; // '.'
  return EXCLUDED_NAMES.has(name);
}

module.exports = { isExcluded, EXCLUDED_NAMES };
