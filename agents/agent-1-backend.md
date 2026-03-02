# Agent 1: Backend (Electron Main Process)

## 역할
Electron main process, SQLite 데이터베이스, IPC 핸들러, 터미널(node-pty) 관리, 외부 Terminal.app 실행을 담당한다.

## 반드시 CLAUDE.md를 먼저 읽고 DB 스키마, IPC 채널 규약을 따른다.

## 구현할 파일

### 1. `src/main/database.js`
SQLite 데이터베이스 모듈.

```js
// Export해야 할 함수들:
module.exports = {
  initDatabase(dbPath),    // DB 파일 열기 + 테이블 생성
  getDB(),                 // DB 인스턴스 반환

  // Projects
  listProjects(),
  createProject(data),     // returns created project
  updateProject(id, data), // returns updated project
  deleteProject(id),

  // Todos
  listTodos(projectId),
  createTodo(projectId, data),
  updateTodo(id, data),
  deleteTodo(id),

  // Notes
  listNotes(projectId),
  createNote(projectId, data),
  updateNote(id, data),
  deleteNote(id),

  // Time Logs
  listTimeLogs(projectId),
  startTimeLog(projectId, description),
  stopTimeLog(id),

  // Activity
  addActivity(projectId, action, detail),
  listActivity(projectId, limit),

  // Stats
  getDashboardStats(),
};
```

**주의사항**:
- `better-sqlite3` 사용 (동기 API)
- `uuid` v4로 ID 생성
- WAL mode, foreign_keys ON
- notes의 tags 컬럼은 JSON 문자열로 저장
- time_logs의 duration_minutes는 stop 시 자동 계산
- 모든 테이블에 created_at, updated_at 포함 (CLAUDE.md 스키마 참조)

### 2. `src/main/terminal-manager.js`
node-pty 터미널 세션 관리.

```js
// Export해야 할 함수들:
module.exports = {
  createTerminal(projectId, projectPath),  // returns { termId }
  writeToTerminal(termId, data),
  resizeTerminal(termId, cols, rows),
  closeTerminal(termId),
  runClaudeInTerminal(termId),             // 'claude\r' 전송
  setDataCallback(callback),               // onData 콜백 등록
  setExitCallback(callback),               // onExit 콜백 등록
  closeAll(),                              // 앱 종료 시 정리
};
```

**주의사항**:
- node-pty가 없을 때 graceful fallback (에러 메시지 반환)
- 셸: `process.env.SHELL || '/bin/zsh'`
- 환경변수: `{ ...process.env, TERM: 'xterm-256color' }`
- termId 형식: `term_${projectId}_${Date.now()}`

### 3. `src/main/external-terminal.js`
macOS Terminal.app을 AppleScript로 열기.

```js
// Export해야 할 함수들:
module.exports = {
  openInTerminalApp(projectPath, runClaude = true),
  // runClaude가 true면: cd <path> && claude
  // runClaude가 false면: cd <path>
};
```

**주의사항**:
- `child_process.exec`로 `osascript -e '...'` 실행
- 경로에 공백이나 특수문자가 있을 수 있으므로 따옴표 이스케이프 처리
- iTerm2 지원도 고려 (환경변수 TERM_PROGRAM 체크)

### 4. `src/main/preload.js`
contextBridge로 renderer에 노출할 API.

```js
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
  // Terminal
  terminal: {
    create: (projectId, path) => ipcRenderer.invoke('terminal:create', projectId, path),
    input: (termId, data) => ipcRenderer.send('terminal:input', termId, data),
    resize: (termId, cols, rows) => ipcRenderer.send('terminal:resize', termId, cols, rows),
    close: (termId) => ipcRenderer.invoke('terminal:close', termId),
    runClaude: (termId) => ipcRenderer.invoke('terminal:runClaude', termId),
    onData: (callback) => ipcRenderer.on('terminal:data', (_, termId, data) => callback(termId, data)),
    onExit: (callback) => ipcRenderer.on('terminal:exit', (_, termId) => callback(termId)),
    openExternal: (path, runClaude) => ipcRenderer.invoke('terminal:openExternal', path, runClaude),
  },
  // Stats
  stats: {
    dashboard: () => ipcRenderer.invoke('stats:dashboard'),
  },
});
```

### 5. `src/main/main.js`
Electron 메인 엔트리. 위 모듈들을 조합한다.

**주요 로직**:
- `app.whenReady()` → initDatabase → createWindow
- BrowserWindow: 1400x900, minWidth 1000, hiddenInset titleBar, bg #0f172a
- preload.js 연결, contextIsolation: true
- database.js의 함수들을 ipcMain.handle로 연결
- terminal-manager.js의 콜백을 webContents.send로 연결
- external-terminal.js를 ipcMain.handle로 연결
- `window-all-closed`: macOS에서는 quit 안 함
- 개발 모드(NODE_ENV=development)에서 DevTools 자동 열기

## 완료 기준
- [ ] `npm start` 시 빈 윈도우가 뜨고 에러 없음
- [ ] DevTools 콘솔에서 `window.api.projects.list()` 호출 시 빈 배열 반환
- [ ] `window.api.projects.create({name:'Test', path:'/tmp'})` 후 다시 list하면 1개 반환
- [ ] 모든 CRUD IPC가 정상 동작
