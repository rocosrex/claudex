'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const terminalManager = require('./terminal-manager');
const externalTerminal = require('./external-terminal');
const remoteFileManager = require('./remote-file-manager');
const sttManager = require('./stt-manager');

let mainWindow = null;

// --- Window State ---

const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(windowStatePath)) {
      return JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { width: 1400, height: 900 };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const isMaximized = mainWindow.isMaximized();
  try {
    fs.writeFileSync(windowStatePath, JSON.stringify({ ...bounds, isMaximized }));
  } catch (e) { /* ignore */ }
}

// --- Database Init ---

function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'claudex.db');
  db.initDatabase(dbPath);
}

// --- Window ---

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  // Set app icon (for development mode Dock icon)
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath);
  }

  mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));

  // if (process.env.NODE_ENV === 'development') {
  //   mainWindow.webContents.openDevTools();
  // }

  mainWindow.on('close', () => {
    saveWindowState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- IPC: Projects ---

ipcMain.handle('projects:list', () => {
  return db.listProjects();
});

ipcMain.handle('projects:create', (_, data) => {
  return db.createProject(data);
});

ipcMain.handle('projects:update', (_, id, data) => {
  return db.updateProject(id, data);
});

ipcMain.handle('projects:delete', (_, id) => {
  return db.deleteProject(id);
});

ipcMain.handle('projects:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// --- IPC: Todos ---

ipcMain.handle('todos:list', (_, projectId) => {
  return db.listTodos(projectId);
});

ipcMain.handle('todos:create', (_, projectId, data) => {
  return db.createTodo(projectId, data);
});

ipcMain.handle('todos:update', (_, id, data) => {
  return db.updateTodo(id, data);
});

ipcMain.handle('todos:delete', (_, id) => {
  return db.deleteTodo(id);
});

// --- IPC: Notes ---

ipcMain.handle('notes:list', (_, projectId) => {
  return db.listNotes(projectId);
});

ipcMain.handle('notes:create', (_, projectId, data) => {
  return db.createNote(projectId, data);
});

ipcMain.handle('notes:update', (_, id, data) => {
  return db.updateNote(id, data);
});

ipcMain.handle('notes:delete', (_, id) => {
  return db.deleteNote(id);
});

// --- IPC: Time Logs ---

ipcMain.handle('timelogs:list', (_, projectId) => {
  return db.listTimeLogs(projectId);
});

ipcMain.handle('timelogs:start', (_, projectId, desc) => {
  return db.startTimeLog(projectId, desc);
});

ipcMain.handle('timelogs:stop', (_, id) => {
  return db.stopTimeLog(id);
});

// --- IPC: Activity ---

ipcMain.handle('activity:list', (_, projectId, limit) => {
  return db.listActivity(projectId, limit);
});

// --- IPC: Stats ---

ipcMain.handle('stats:dashboard', () => {
  return db.getDashboardStats();
});

// --- IPC: Attachments ---

ipcMain.handle('attachments:list', (_, todoId) => {
  return db.listAttachments(todoId);
});

ipcMain.handle('attachments:add', (_, todoId, filePath, fileName) => {
  return db.addAttachment(todoId, filePath, fileName);
});

ipcMain.handle('attachments:remove', (_, id) => {
  return db.removeAttachment(id);
});

ipcMain.handle('attachments:selectFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return result.filePaths;
});

ipcMain.handle('attachments:readFile', async (_, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];

    if (imageExts.includes(ext)) {
      const data = fs.readFileSync(filePath);
      const mimeMap = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
        '.bmp': 'image/bmp', '.ico': 'image/x-icon',
      };
      const mime = mimeMap[ext] || 'application/octet-stream';
      return { type: 'image', data: `data:${mime};base64,${data.toString('base64')}` };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return { type: 'text', data: content, ext };
  } catch (e) {
    return { type: 'error', data: e.message };
  }
});

ipcMain.handle('attachments:openInFinder', (_, filePath) => {
  shell.showItemInFolder(filePath);
});

// --- IPC: Shell ---

ipcMain.handle('shell:revealInFinder', (_, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
    return { success: true };
  }
  return { error: 'Path does not exist' };
});

// --- IPC: Files ---

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.DS_Store', 'dist', 'build', '.next',
  '__pycache__', '.venv', '.env', '.cache', '.turbo', 'coverage',
  '.nyc_output', '.idea', '.vscode',
]);

function walkProjectFiles(dir, baseDir) {
  const entries = [];
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return entries;
  }
  items.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const item of items) {
    if (EXCLUDED_DIRS.has(item.name)) continue;
    const abs = path.join(dir, item.name);
    const rel = path.relative(baseDir, abs);
    if (item.isDirectory()) {
      const children = walkProjectFiles(abs, baseDir);
      entries.push({ name: item.name, relativePath: rel, absolutePath: abs, isDirectory: true, children });
    } else {
      entries.push({ name: item.name, relativePath: rel, absolutePath: abs, isDirectory: false, children: [] });
    }
  }
  return entries;
}

function isPathSafe(filePath, projectPath) {
  const resolved = path.resolve(filePath);
  const projectRoot = path.resolve(projectPath);
  return resolved.startsWith(projectRoot);
}

ipcMain.handle('files:list', (_, projectPath) => {
  if (!projectPath || !fs.existsSync(projectPath)) return [];
  return walkProjectFiles(projectPath, projectPath);
});

ipcMain.handle('files:read', (_, filePath) => {
  try {
    const resolved = path.resolve(filePath);
    return { content: fs.readFileSync(resolved, 'utf-8') };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('files:readBinary', (_, filePath) => {
  try {
    const resolved = path.resolve(filePath);
    const data = fs.readFileSync(resolved);
    return { data: data.toString('base64') };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('files:write', (_, filePath, content) => {
  try {
    const resolved = path.resolve(filePath);
    fs.writeFileSync(resolved, content, 'utf-8');
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('files:create', (_, dirPath, fileName) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const filePath = path.join(dirPath, fileName);
    if (fs.existsSync(filePath)) {
      return { error: 'File already exists' };
    }
    fs.writeFileSync(filePath, '', 'utf-8');
    return { success: true, filePath };
  } catch (e) {
    return { error: e.message };
  }
});

// --- IPC: Terminal ---

ipcMain.handle('terminal:create', (_, projectId, projectPath) => {
  try {
    return terminalManager.createTerminal(projectId, projectPath);
  } catch (e) {
    console.error('terminal:create error:', e);
    return { error: e.message };
  }
});

ipcMain.on('terminal:input', (_, termId, data) => {
  try {
    terminalManager.writeToTerminal(termId, data);
  } catch (e) {
    // terminal may have been closed
  }
});

ipcMain.on('terminal:resize', (_, termId, cols, rows) => {
  terminalManager.resizeTerminal(termId, cols, rows);
});

ipcMain.handle('terminal:close', (_, termId) => {
  terminalManager.closeTerminal(termId);
});

ipcMain.handle('terminal:runClaude', (_, termId) => {
  terminalManager.runClaudeInTerminal(termId);
});

ipcMain.handle('terminal:openExternal', (_, projectPath, runClaude) => {
  return externalTerminal.openInTerminalApp(projectPath, runClaude);
});

ipcMain.handle('terminal:createSSH', (_, projectId, sshConfig) => {
  try {
    return terminalManager.createSSHTerminal(projectId, sshConfig);
  } catch (e) {
    console.error('terminal:createSSH error:', e);
    return { error: e.message };
  }
});

// --- IPC: Security ---

ipcMain.handle('security:encryptPassword', (_, plaintext) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { error: 'Encryption not available' };
  }
  const encrypted = safeStorage.encryptString(plaintext);
  return encrypted.toString('base64');
});

ipcMain.handle('security:decryptPassword', (_, base64) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { error: 'Encryption not available' };
  }
  const buffer = Buffer.from(base64, 'base64');
  return safeStorage.decryptString(buffer);
});

ipcMain.handle('security:selectKeyFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'SSH 키 파일 선택',
    properties: ['openFile'],
    defaultPath: require('path').join(require('os').homedir(), '.ssh'),
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// --- IPC: Remote Files (SFTP) ---

ipcMain.handle('remote:listFiles', async (_, projectId, remotePath) => {
  try {
    return await remoteFileManager.listRemoteFiles(projectId, remotePath);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('remote:readFile', async (_, projectId, remotePath) => {
  try {
    return await remoteFileManager.readRemoteFile(projectId, remotePath);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('remote:readBinary', async (_, projectId, remotePath) => {
  try {
    return await remoteFileManager.readRemoteBinary(projectId, remotePath);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('remote:writeFile', async (_, projectId, remotePath, content) => {
  try {
    return await remoteFileManager.writeRemoteFile(projectId, remotePath, content);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('remote:homeDir', async (_, projectId) => {
  try {
    return await remoteFileManager.getHomeDir(projectId);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('remote:disconnect', async (_, projectId) => {
  try {
    remoteFileManager.disconnect(projectId);
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

// --- IPC: SSH Test & Browse (direct config, no projectId needed) ---

ipcMain.handle('remote:testConnection', async (_, sshConfig) => {
  try {
    return await remoteFileManager.testConnection(sshConfig);
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('remote:browseDirs', async (_, sshConfig, remotePath) => {
  try {
    return await remoteFileManager.browseRemoteDirs(sshConfig, remotePath);
  } catch (e) {
    return { error: e.message };
  }
});

// --- IPC: STT (Speech-to-Text) ---

ipcMain.handle('stt:checkInstalled', () => {
  return sttManager.checkWhisperInstalled();
});

ipcMain.handle('stt:transcribe', async (_, wavBuffer, options) => {
  return await sttManager.transcribeAudio(wavBuffer, options);
});

// --- Terminal Callbacks ---

terminalManager.setDataCallback((termId, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:data', termId, data);
  }
});

terminalManager.setExitCallback((termId) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:exit', termId);
  }
});

// --- App Lifecycle ---

// --- Auto Updater ---

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', {
        status: 'available',
        version: info.version,
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', {
        status: 'downloading',
        percent: Math.round(progress.percent),
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', {
        status: 'downloaded',
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
  });

  autoUpdater.checkForUpdatesAndNotify();
}

ipcMain.handle('updater:check', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall();
});

// --- App Lifecycle ---

app.whenReady().then(() => {
  initDB();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  terminalManager.closeAll();
  remoteFileManager.disconnectAll();
});
