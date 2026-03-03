'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Projects
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (data) => ipcRenderer.invoke('projects:create', data),
    update: (id, data) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id) => ipcRenderer.invoke('projects:delete', id),
    selectFolder: () => ipcRenderer.invoke('projects:selectFolder'),
  },
  // Todos
  todos: {
    list: (projectId) => ipcRenderer.invoke('todos:list', projectId),
    create: (projectId, data) => ipcRenderer.invoke('todos:create', projectId, data),
    update: (id, data) => ipcRenderer.invoke('todos:update', id, data),
    delete: (id) => ipcRenderer.invoke('todos:delete', id),
  },
  // Notes
  notes: {
    list: (projectId) => ipcRenderer.invoke('notes:list', projectId),
    create: (projectId, data) => ipcRenderer.invoke('notes:create', projectId, data),
    update: (id, data) => ipcRenderer.invoke('notes:update', id, data),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
  },
  // Time Logs
  timelogs: {
    list: (projectId) => ipcRenderer.invoke('timelogs:list', projectId),
    start: (projectId, desc) => ipcRenderer.invoke('timelogs:start', projectId, desc),
    stop: (id) => ipcRenderer.invoke('timelogs:stop', id),
  },
  // Activity
  activity: {
    list: (projectId, limit) => ipcRenderer.invoke('activity:list', projectId, limit),
  },
  // Attachments
  attachments: {
    list: (todoId) => ipcRenderer.invoke('attachments:list', todoId),
    add: (todoId, filePath, fileName) => ipcRenderer.invoke('attachments:add', todoId, filePath, fileName),
    remove: (id) => ipcRenderer.invoke('attachments:remove', id),
    selectFile: () => ipcRenderer.invoke('attachments:selectFile'),
    readFile: (filePath) => ipcRenderer.invoke('attachments:readFile', filePath),
    openInFinder: (filePath) => ipcRenderer.invoke('attachments:openInFinder', filePath),
  },
  // Terminal
  terminal: {
    create: (projectId, path) => ipcRenderer.invoke('terminal:create', projectId, path),
    createSSH: (projectId, sshConfig) => ipcRenderer.invoke('terminal:createSSH', projectId, sshConfig),
    input: (termId, data) => ipcRenderer.send('terminal:input', termId, data),
    resize: (termId, cols, rows) => ipcRenderer.send('terminal:resize', termId, cols, rows),
    close: (termId) => ipcRenderer.invoke('terminal:close', termId),
    runClaude: (termId) => ipcRenderer.invoke('terminal:runClaude', termId),
    onData: (callback) => ipcRenderer.on('terminal:data', (_, termId, data) => callback(termId, data)),
    onExit: (callback) => ipcRenderer.on('terminal:exit', (_, termId) => callback(termId)),
    openExternal: (path, runClaude) => ipcRenderer.invoke('terminal:openExternal', path, runClaude),
  },
  // Security
  security: {
    encryptPassword: (plaintext) => ipcRenderer.invoke('security:encryptPassword', plaintext),
    decryptPassword: (base64) => ipcRenderer.invoke('security:decryptPassword', base64),
    selectKeyFile: () => ipcRenderer.invoke('security:selectKeyFile'),
  },
  // Shell
  shell: {
    revealInFinder: (folderPath) => ipcRenderer.invoke('shell:revealInFinder', folderPath),
  },
  // Files
  files: {
    list: (projectPath) => ipcRenderer.invoke('files:list', projectPath),
    read: (filePath) => ipcRenderer.invoke('files:read', filePath),
    readBinary: (filePath) => ipcRenderer.invoke('files:readBinary', filePath),
    write: (filePath, content) => ipcRenderer.invoke('files:write', filePath, content),
    create: (dirPath, fileName) => ipcRenderer.invoke('files:create', dirPath, fileName),
  },
  // Remote Files (SFTP)
  remote: {
    listFiles: (projectId, remotePath) => ipcRenderer.invoke('remote:listFiles', projectId, remotePath),
    readFile: (projectId, remotePath) => ipcRenderer.invoke('remote:readFile', projectId, remotePath),
    readBinary: (projectId, remotePath) => ipcRenderer.invoke('remote:readBinary', projectId, remotePath),
    writeFile: (projectId, remotePath, content) => ipcRenderer.invoke('remote:writeFile', projectId, remotePath, content),
    homeDir: (projectId) => ipcRenderer.invoke('remote:homeDir', projectId),
    disconnect: (projectId) => ipcRenderer.invoke('remote:disconnect', projectId),
    testConnection: (sshConfig) => ipcRenderer.invoke('remote:testConnection', sshConfig),
    browseDirs: (sshConfig, remotePath) => ipcRenderer.invoke('remote:browseDirs', sshConfig, remotePath),
  },
  // STT (Speech-to-Text)
  stt: {
    transcribe: (wavBuffer, options) => ipcRenderer.invoke('stt:transcribe', wavBuffer, options),
    checkInstalled: () => ipcRenderer.invoke('stt:checkInstalled'),
  },
  // Stats
  stats: {
    dashboard: () => ipcRenderer.invoke('stats:dashboard'),
  },
  // Updater
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback) => ipcRenderer.on('updater:status', (_, data) => callback(data)),
  },
});
