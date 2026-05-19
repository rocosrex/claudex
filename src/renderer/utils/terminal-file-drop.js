// Terminal file drop — drop files/folders from Finder onto a terminal to
// insert their (shell-quoted) absolute paths at the prompt.

function shellQuote(p) {
  if (p === '') return "''";
  // Safe characters need no quoting.
  if (/^[a-zA-Z0-9_./@%+=:,-]+$/.test(p)) return p;
  // POSIX single-quote: wrap and escape embedded single quotes as '\''
  return "'" + p.replace(/'/g, "'\\''") + "'";
}

function isFileDrag(e) {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  // DOMStringList in some browsers; Array in others — both support .contains/.includes
  return Array.from(types).includes('Files');
}

/**
 * Enable file/folder drop on a terminal wrapper element.
 * Dropped paths are shell-quoted and sent as input to the active terminal.
 *
 * @param {HTMLElement} el                 Drop target (terminal wrapper)
 * @param {() => (string|null)} getTermId  Returns the current termId or null
 * @returns {() => void}                   Cleanup function
 */
export function enableTerminalFileDrop(el, getTermId) {
  const onDragOver = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    el.classList.add('terminal-file-drop-over');
  };

  const onDragLeave = (e) => {
    if (!isFileDrag(e)) return;
    if (!el.contains(e.relatedTarget)) {
      el.classList.remove('terminal-file-drop-over');
    }
  };

  const onDrop = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('terminal-file-drop-over');

    const termId = getTermId();
    if (!termId) return;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const getPath = window.api?.files?.getFilePath;
    const parts = [];
    for (const f of files) {
      let p = '';
      try { p = getPath ? getPath(f) : (f.path || ''); } catch (_) { p = ''; }
      if (p) parts.push(shellQuote(p));
    }
    if (parts.length === 0) return;

    // Trailing space matches macOS Terminal.app/iTerm2 behaviour.
    window.api.terminal.input(termId, parts.join(' ') + ' ');
  };

  el.addEventListener('dragover', onDragOver);
  el.addEventListener('dragleave', onDragLeave);
  el.addEventListener('drop', onDrop);

  return () => {
    el.removeEventListener('dragover', onDragOver);
    el.removeEventListener('dragleave', onDragLeave);
    el.removeEventListener('drop', onDrop);
  };
}
