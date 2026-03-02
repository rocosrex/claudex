'use strict';

let pty;
try {
  pty = require('node-pty');
  console.log('[terminal-manager] node-pty loaded successfully');
} catch (e) {
  console.error('[terminal-manager] node-pty FAILED to load:', e.message, e.stack);
  pty = null;
}

const terminals = new Map();
let onDataCallback = null;
let onExitCallback = null;

function createTerminal(projectId, projectPath) {
  if (!pty) {
    throw new Error('node-pty is not available. Please run: npm rebuild node-pty');
  }

  const termId = `term_${projectId}_${Date.now()}`;
  const shell = process.env.SHELL || '/bin/zsh';

  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: projectPath || process.env.HOME,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  term.onData((data) => {
    if (onDataCallback) {
      onDataCallback(termId, data);
    }
  });

  term.onExit(() => {
    terminals.delete(termId);
    if (onExitCallback) {
      onExitCallback(termId);
    }
  });

  terminals.set(termId, { term, projectId, projectPath });
  return { termId };
}

function writeToTerminal(termId, data) {
  const entry = terminals.get(termId);
  if (!entry) throw new Error(`Terminal ${termId} not found`);
  entry.term.write(data);
}

function resizeTerminal(termId, cols, rows) {
  const entry = terminals.get(termId);
  if (!entry) return;
  if (cols > 0 && rows > 0) {
    entry.term.resize(cols, rows);
  }
}

function closeTerminal(termId) {
  const entry = terminals.get(termId);
  if (!entry) return;
  entry.term.kill();
  terminals.delete(termId);
}

function createSSHTerminal(projectId, sshConfig) {
  if (!pty) {
    throw new Error('node-pty is not available. Please run: npm rebuild node-pty');
  }

  const termId = `term_ssh_${projectId}_${Date.now()}`;
  const { host, port, username, authType, password, keyPath, startupCommand } = sshConfig;

  if (!host || !username) {
    throw new Error('SSH host and username are required');
  }

  // Build ssh command args
  const sshArgs = [];
  if (authType === 'key' && keyPath) {
    sshArgs.push('-i', keyPath);
  }
  if (port && port !== 22) {
    sshArgs.push('-p', String(port));
  }
  // Disable strict host key checking for convenience (user can override via ~/.ssh/config)
  sshArgs.push('-o', 'StrictHostKeyChecking=accept-new');
  sshArgs.push(`${username}@${host}`);

  const term = pty.spawn('ssh', sshArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  // Auto-type password on any password/passphrase prompt (key passphrase, password auth, sudo, etc.)
  if (password) {
    let passwordSent = false;
    term.onData((data) => {
      if (!passwordSent) {
        const lower = data.toLowerCase();
        if (lower.includes('password') || lower.includes('passphrase')) {
          passwordSent = true;
          setTimeout(() => {
            term.write(password + '\r');
          }, 100);
        }
      }
      if (onDataCallback) {
        onDataCallback(termId, data);
      }
    });
  } else {
    term.onData((data) => {
      if (onDataCallback) {
        onDataCallback(termId, data);
      }
    });
  }

  term.onExit(() => {
    terminals.delete(termId);
    if (onExitCallback) {
      onExitCallback(termId);
    }
  });

  terminals.set(termId, { term, projectId, sshConfig });
  return { termId };
}

function runClaudeInTerminal(termId) {
  const entry = terminals.get(termId);
  if (!entry) throw new Error(`Terminal ${termId} not found`);
  entry.term.write('claude\r');
}

function setDataCallback(callback) {
  onDataCallback = callback;
}

function setExitCallback(callback) {
  onExitCallback = callback;
}

function closeAll() {
  for (const [termId, entry] of terminals) {
    try {
      entry.term.kill();
    } catch (e) {
      // ignore cleanup errors
    }
  }
  terminals.clear();
}

module.exports = {
  createTerminal,
  createSSHTerminal,
  writeToTerminal,
  resizeTerminal,
  closeTerminal,
  runClaudeInTerminal,
  setDataCallback,
  setExitCallback,
  closeAll,
};
