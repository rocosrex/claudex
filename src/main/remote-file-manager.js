'use strict';

const { Client } = require('ssh2');
const { safeStorage } = require('electron');
const db = require('./database');
const path = require('path');

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.DS_Store', 'dist', 'build', '.next',
  '__pycache__', '.venv', '.env', '.cache', '.turbo', 'coverage',
  '.nyc_output', '.idea', '.vscode',
]);

const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Connection pool: Map<projectId, { client, sftp, lastUsed, timer }>
const pool = new Map();

function resolveSSHConfig(projectId) {
  const project = db.getProject(projectId);
  console.log('[remote-file-manager] resolveSSHConfig for', projectId, '→', project ? `${project.ssh_username}@${project.ssh_host}:${project.ssh_port}` : 'NOT FOUND');
  if (!project || !project.ssh_host) {
    throw new Error('Project not found or SSH not configured');
  }

  const config = {
    host: project.ssh_host,
    port: project.ssh_port || 22,
    username: project.ssh_username,
  };

  if (project.ssh_auth_type === 'password' && project.ssh_password_encrypted) {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = Buffer.from(project.ssh_password_encrypted, 'base64');
      config.password = safeStorage.decryptString(buf);
    }
  } else if (project.ssh_key_path) {
    const fs = require('fs');
    config.privateKey = fs.readFileSync(project.ssh_key_path);
    // If key has passphrase stored
    if (project.ssh_password_encrypted && safeStorage.isEncryptionAvailable()) {
      const buf = Buffer.from(project.ssh_password_encrypted, 'base64');
      config.passphrase = safeStorage.decryptString(buf);
    }
  }

  config.remotePath = project.ssh_remote_path || '';

  return config;
}

function connectSSH(config) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    client.on('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end();
          reject(err);
        } else {
          resolve({ client, sftp });
        }
      });
    });
    client.on('error', (err) => {
      reject(err);
    });
    client.connect(config);
  });
}

function resetIdleTimer(projectId) {
  const entry = pool.get(projectId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => disconnect(projectId), IDLE_TIMEOUT);
  entry.lastUsed = Date.now();
}

async function getConnection(projectId, retry = true) {
  const existing = pool.get(projectId);
  if (existing && existing.sftp) {
    resetIdleTimer(projectId);
    return existing;
  }

  const config = resolveSSHConfig(projectId);
  try {
    const { client, sftp } = await connectSSH(config);
    const entry = { client, sftp, lastUsed: Date.now(), timer: null };
    pool.set(projectId, entry);

    client.on('end', () => {
      const e = pool.get(projectId);
      if (e && e.client === client) pool.delete(projectId);
    });
    client.on('error', () => {
      const e = pool.get(projectId);
      if (e && e.client === client) pool.delete(projectId);
    });

    resetIdleTimer(projectId);
    return entry;
  } catch (err) {
    // One retry on connection failure
    if (retry) {
      pool.delete(projectId);
      return getConnection(projectId, false);
    }
    throw err;
  }
}

async function getHomeDir(projectId) {
  const { sftp } = await getConnection(projectId);
  return new Promise((resolve, reject) => {
    sftp.realpath('.', (err, absPath) => {
      if (err) reject(err);
      else resolve(absPath);
    });
  });
}

function sftpReaddir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) reject(err);
      else resolve(list);
    });
  });
}

function sftpStat(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err, stats) => {
      if (err) reject(err);
      else resolve(stats);
    });
  });
}

async function listRemoteFiles(projectId, remotePath) {
  console.log('[remote-file-manager] listRemoteFiles:', projectId, remotePath);
  const { sftp } = await getConnection(projectId);
  console.log('[remote-file-manager] SFTP connection established');

  // Single-level listing (no recursion) — children loaded on demand
  let items;
  try {
    items = await sftpReaddir(sftp, remotePath);
    console.log(`[remote-file-manager] readdir "${remotePath}": ${items.length} items`);
  } catch (e) {
    console.error(`[remote-file-manager] readdir failed for "${remotePath}":`, e.message);
    return [];
  }

  // Sort: directories first, then alphabetical
  items.sort((a, b) => {
    const aDir = (a.attrs.mode & 0o40000) !== 0;
    const bDir = (b.attrs.mode & 0o40000) !== 0;
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.filename.localeCompare(b.filename);
  });

  const entries = [];
  for (const item of items) {
    if (item.filename === '.' || item.filename === '..') continue;
    if (EXCLUDED_DIRS.has(item.filename)) continue;

    const absPath = path.posix.join(remotePath, item.filename);
    const isDir = (item.attrs.mode & 0o40000) !== 0;

    entries.push({
      name: item.filename,
      relativePath: absPath,
      absolutePath: absPath,
      isDirectory: isDir,
      children: [], // always empty — loaded on demand via sidebar
    });
  }
  return entries;
}

async function readRemoteFile(projectId, remotePath) {
  const { sftp } = await getConnection(projectId);
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = sftp.createReadStream(remotePath, { encoding: 'utf8' });
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve({ content: chunks.join('') }));
    stream.on('error', (err) => reject(err));
  });
}

async function readRemoteBinary(projectId, remotePath) {
  const { sftp } = await getConnection(projectId);
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = sftp.createReadStream(remotePath);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => {
      const buf = Buffer.concat(chunks);
      resolve({ data: buf.toString('base64') });
    });
    stream.on('error', (err) => reject(err));
  });
}

async function writeRemoteFile(projectId, remotePath, content) {
  const { sftp } = await getConnection(projectId);
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath);
    stream.on('close', () => resolve({ success: true }));
    stream.on('error', (err) => reject(err));
    stream.end(content, 'utf8');
  });
}

function disconnect(projectId) {
  const entry = pool.get(projectId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  try { entry.client.end(); } catch (e) { /* ignore */ }
  pool.delete(projectId);
}

function disconnectAll() {
  for (const [projectId] of pool) {
    disconnect(projectId);
  }
}

// --- Direct config methods (for use before project is saved) ---

function buildConnectConfig(sshConfig) {
  const fs = require('fs');
  const config = {
    host: sshConfig.host,
    port: sshConfig.port || 22,
    username: sshConfig.username,
    readyTimeout: 10000,
  };

  if (sshConfig.authType === 'password' && sshConfig.password) {
    config.password = sshConfig.password;
  } else if (sshConfig.keyPath) {
    try {
      config.privateKey = fs.readFileSync(sshConfig.keyPath);
    } catch (e) {
      throw new Error(`Cannot read SSH key: ${sshConfig.keyPath}`);
    }
    if (sshConfig.password) {
      config.passphrase = sshConfig.password;
    }
  }

  return config;
}

async function testConnection(sshConfig) {
  const config = buildConnectConfig(sshConfig);
  const { client, sftp } = await connectSSH(config);
  // Get home directory as bonus info
  const homeDir = await new Promise((resolve, reject) => {
    sftp.realpath('.', (err, absPath) => {
      if (err) resolve('~');
      else resolve(absPath);
    });
  });
  client.end();
  return { success: true, homeDir };
}

async function browseRemoteDirs(sshConfig, remotePath) {
  const config = buildConnectConfig(sshConfig);
  const { client, sftp } = await connectSSH(config);

  try {
    // Resolve path
    let browsePath = remotePath;
    if (!browsePath || browsePath === '~') {
      browsePath = await new Promise((resolve, reject) => {
        sftp.realpath('.', (err, absPath) => {
          if (err) resolve('/');
          else resolve(absPath);
        });
      });
    }

    const items = await sftpReaddir(sftp, browsePath);
    const dirs = [];

    for (const item of items) {
      if (item.filename === '.' || item.filename === '..') continue;
      const isDir = (item.attrs.mode & 0o40000) !== 0;
      if (isDir) {
        dirs.push({
          name: item.filename,
          path: path.posix.join(browsePath, item.filename),
        });
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    return { currentPath: browsePath, dirs };
  } finally {
    client.end();
  }
}

async function writeBinaryRemoteFile(projectId, remotePath, base64Data) {
  const { sftp } = await getConnection(projectId);
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(base64Data, 'base64');
    const stream = sftp.createWriteStream(remotePath);
    stream.on('close', () => resolve({ success: true }));
    stream.on('error', (err) => reject(err));
    stream.end(buffer);
  });
}

module.exports = {
  getHomeDir,
  listRemoteFiles,
  readRemoteFile,
  readRemoteBinary,
  writeRemoteFile,
  writeBinaryRemoteFile,
  disconnect,
  disconnectAll,
  testConnection,
  browseRemoteDirs,
};
