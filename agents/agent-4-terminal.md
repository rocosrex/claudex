# Agent 4: Terminal Integration (xterm.js + Claude Code Launcher)

## 역할
xterm.js 기반 임베디드 터미널 UI, 터미널 탭 관리, Claude Code 런처 버튼을 담당한다.

## 반드시 CLAUDE.md를 먼저 읽는다.

## 핵심 개념
- xterm.js와 xterm-addon-fit는 CDN에서 로드 (public/index.html에서)
- `window.Terminal`과 `window.FitAddon`으로 접근
- `window.api.terminal.*`로 main process의 node-pty와 통신
- IPC 흐름: renderer → api.terminal.input → main → pty.write → pty.onData → terminal:data → renderer

## 구현할 파일

### 1. `src/renderer/components/terminal/TerminalPanel.js`
터미널 패널 컴포넌트.

```js
import { Toast } from '../common/Toast.js';

export class TerminalPanel {
  /**
   * @param {string} projectId
   * @param {string} projectPath
   * @param {Object} options
   * @param {boolean} options.autoRunClaude - 생성 시 자동으로 claude 실행
   * @param {string} options.mode - 'embedded' (앱 내) | 'panel' (하단 슬라이드)
   */
  constructor(projectId, projectPath, options = {}) {
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.autoRunClaude = options.autoRunClaude || false;
    this.mode = options.mode || 'embedded';
    this.termId = null;
    this.terminal = null;  // xterm.js Terminal instance
    this.fitAddon = null;
    this.tabs = [];        // 여러 터미널 세션 관리
    this.activeTabIndex = 0;
  }

  render() {
    const container = document.createElement('div');
    container.className = 'terminal-panel flex flex-col h-full';
    container.innerHTML = `
      <!-- 터미널 탭 바 -->
      <div class="terminal-tabs flex items-center gap-1 px-2 py-1 bg-slate-900 border-b border-slate-700">
        <div class="tabs-list flex gap-1 flex-1 overflow-x-auto"></div>
        <div class="tab-actions flex gap-1">
          <button class="btn-new-terminal text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                  title="새 터미널">+ Terminal</button>
          <button class="btn-run-claude text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                  title="Claude Code 실행">▶ Claude</button>
          <button class="btn-open-external text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
                  title="Terminal.app에서 열기">🔗 외부</button>
        </div>
      </div>
      <!-- 터미널 본체 -->
      <div class="terminal-body flex-1 relative" style="min-height: 300px;">
        <div class="terminal-container w-full h-full"></div>
        <!-- 터미널 없을 때 표시 -->
        <div class="terminal-placeholder absolute inset-0 flex items-center justify-center text-slate-500">
          <div class="text-center">
            <div class="text-4xl mb-3">⌨️</div>
            <p class="text-lg mb-2">터미널이 없습니다</p>
            <p class="text-sm">위의 "+ Terminal" 또는 "▶ Claude" 버튼으로 시작하세요</p>
          </div>
        </div>
      </div>
    `;

    this.container = container;
    this.setupEventListeners();
    this.setupIPCListeners();

    // 자동 실행
    if (this.autoRunClaude) {
      setTimeout(() => this.createAndRunClaude(), 100);
    }

    return container;
  }

  // --- 터미널 생성 ---
  async createTerminalSession(runClaude = false) {
    const result = await window.api.terminal.create(this.projectId, this.projectPath);
    if (result.error) {
      Toast.show(`터미널 생성 실패: ${result.error}`, 'error');
      return;
    }

    const termId = result.termId;
    const term = new window.Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        cursorAccent: '#0f172a',
        selectionBackground: '#6366f1',
        selectionForeground: '#ffffff',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f8fafc',
      },
      fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    // 탭 추가
    const tab = { termId, term, fitAddon, title: runClaude ? '🤖 Claude' : '⌨️ Terminal' };
    this.tabs.push(tab);
    this.activeTabIndex = this.tabs.length - 1;

    // 탭 UI 업데이트
    this.renderTabs();

    // 터미널 DOM에 마운트
    const termContainer = this.container.querySelector('.terminal-container');
    termContainer.innerHTML = '';
    term.open(termContainer);

    // fitAddon은 DOM에 마운트된 후 호출
    requestAnimationFrame(() => {
      fitAddon.fit();
      const { cols, rows } = fitAddon.proposeDimensions() || { cols: 120, rows: 30 };
      window.api.terminal.resize(termId, cols, rows);
    });

    // placeholder 숨기기
    const placeholder = this.container.querySelector('.terminal-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    // renderer → main (키 입력)
    term.onData((data) => {
      window.api.terminal.input(termId, data);
    });

    // 리사이즈 핸들링
    this.resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          window.api.terminal.resize(termId, dims.cols, dims.rows);
        }
      } catch (e) { /* ignore */ }
    });
    this.resizeObserver.observe(termContainer);

    // Claude Code 실행
    if (runClaude) {
      setTimeout(() => {
        window.api.terminal.runClaude(termId);
      }, 500);
    }

    this.termId = termId;
    this.terminal = term;
    this.fitAddon = fitAddon;
  }

  async createAndRunClaude() {
    await this.createTerminalSession(true);
  }

  // --- 탭 UI ---
  renderTabs() {
    const tabsList = this.container.querySelector('.tabs-list');
    tabsList.innerHTML = '';

    this.tabs.forEach((tab, index) => {
      const tabEl = document.createElement('div');
      const isActive = index === this.activeTabIndex;
      tabEl.className = `tab-item flex items-center gap-1 px-3 py-1 rounded text-xs cursor-pointer ${
        isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
      }`;
      tabEl.innerHTML = `
        <span>${tab.title}</span>
        <button class="tab-close ml-1 hover:text-red-400" data-index="${index}">✕</button>
      `;

      tabEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) {
          this.closeTab(index);
        } else {
          this.switchTab(index);
        }
      });

      tabsList.appendChild(tabEl);
    });
  }

  switchTab(index) {
    if (index < 0 || index >= this.tabs.length) return;
    this.activeTabIndex = index;
    const tab = this.tabs[index];

    const termContainer = this.container.querySelector('.terminal-container');
    termContainer.innerHTML = '';
    tab.term.open(termContainer);

    requestAnimationFrame(() => {
      tab.fitAddon.fit();
    });

    this.termId = tab.termId;
    this.terminal = tab.term;
    this.fitAddon = tab.fitAddon;
    this.renderTabs();
  }

  async closeTab(index) {
    const tab = this.tabs[index];
    await window.api.terminal.close(tab.termId);
    tab.term.dispose();
    this.tabs.splice(index, 1);

    if (this.tabs.length === 0) {
      // 모든 탭 닫힘 → placeholder 표시
      const termContainer = this.container.querySelector('.terminal-container');
      termContainer.innerHTML = '';
      const placeholder = this.container.querySelector('.terminal-placeholder');
      if (placeholder) placeholder.style.display = 'flex';
      this.termId = null;
      this.terminal = null;
    } else {
      this.activeTabIndex = Math.min(this.activeTabIndex, this.tabs.length - 1);
      this.switchTab(this.activeTabIndex);
    }
    this.renderTabs();
  }

  // --- 이벤트 ---
  setupEventListeners() {
    this.container.querySelector('.btn-new-terminal').addEventListener('click', () => {
      this.createTerminalSession(false);
    });

    this.container.querySelector('.btn-run-claude').addEventListener('click', () => {
      if (this.termId && this.terminal) {
        // 현재 활성 터미널에서 claude 실행
        window.api.terminal.runClaude(this.termId);
      } else {
        // 새 터미널 + claude 실행
        this.createAndRunClaude();
      }
    });

    this.container.querySelector('.btn-open-external').addEventListener('click', () => {
      window.api.terminal.openExternal(this.projectPath, true);
      Toast.show('Terminal.app에서 Claude Code를 실행합니다', 'info');
    });
  }

  setupIPCListeners() {
    // main → renderer (터미널 출력)
    window.api.terminal.onData((termId, data) => {
      const tab = this.tabs.find(t => t.termId === termId);
      if (tab) {
        tab.term.write(data);
      }
    });

    // 터미널 종료
    window.api.terminal.onExit((termId) => {
      const index = this.tabs.findIndex(t => t.termId === termId);
      if (index !== -1) {
        this.tabs[index].title += ' (종료)';
        this.renderTabs();
        Toast.show('터미널 세션이 종료되었습니다', 'warning');
      }
    });
  }

  // --- 정리 ---
  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.tabs.forEach(tab => {
      window.api.terminal.close(tab.termId);
      tab.term.dispose();
    });
    this.tabs = [];
  }
}
```

## CSS 요구사항 (Agent 2의 main.css에 추가)

```css
/* 터미널 패널 */
.terminal-panel {
  background: var(--color-bg-primary);
  border-top: 1px solid var(--color-border);
}

.terminal-container .xterm {
  padding: 8px;
}

.terminal-container .xterm-viewport::-webkit-scrollbar {
  width: 8px;
}

.terminal-container .xterm-viewport::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}

/* 터미널 탭 */
.tab-item {
  white-space: nowrap;
  transition: all 0.15s ease;
}

.tab-close {
  opacity: 0;
  transition: opacity 0.15s;
}

.tab-item:hover .tab-close {
  opacity: 1;
}
```

## CDN 리소스 (index.html에 추가)

```html
<!-- xterm.js -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.5.0/css/xterm.css">
<script src="https://cdn.jsdelivr.net/npm/xterm@5.5.0/lib/xterm.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.js"></script>
```

## 완료 기준
- [ ] "+ Terminal" 버튼으로 임베디드 터미널 생성
- [ ] 터미널에서 키 입력 → 명령 실행 → 출력 표시
- [ ] "▶ Claude" 버튼으로 claude 명령 자동 실행
- [ ] "🔗 외부" 버튼으로 Terminal.app 열기 + claude 실행
- [ ] 여러 탭 생성/전환/닫기
- [ ] 리사이즈 시 터미널 크기 자동 조절
- [ ] 다크 테마 색상 일관성 (터미널 테마 포함)
