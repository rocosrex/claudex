'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const terminalManager = require('./terminal-manager');
const externalTerminal = require('./external-terminal');

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

  mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

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

app.whenReady().then(() => {
  initDB();
  createWindow();

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
});
