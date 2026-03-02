# Agent 2: Core UI (Dashboard + Project + App Shell)

## 역할
앱의 기본 UI 셸, SPA 라우터, 대시보드, 프로젝트 CRUD 화면, 공통 컴포넌트를 담당한다.

## 반드시 CLAUDE.md를 먼저 읽고 UI 디자인 가이드를 따른다.

## 핵심 원칙
- Vanilla JS + Web Components (빌드 도구 없음)
- `<script type="module">`로 ES Module import
- 모든 컴포넌트는 class 기반, `render()` → DOM element 반환
- `window.api.*`로 IPC 호출 (preload.js가 노출한 API)
- 다크 테마 기본 (slate-900 배경)

## 구현할 파일

### 1. `public/index.html`
싱글 페이지 엔트리.

```html
<!-- 필수 포함 -->
- Tailwind CSS CDN (play.tailwindcss.com/cdn)
- xterm.js CDN (css + js)
- xterm-addon-fit CDN
- <div id="app"> 루트
- <script type="module" src="../src/renderer/app.js">
- 커스텀 CSS 링크 (../src/renderer/styles/main.css)
- CSP meta tag (Electron용)
```

### 2. `src/renderer/styles/main.css`
글로벌 스타일시트.

```css
/* 포함할 내용 */
:root {
  --color-primary: #6366f1;      /* indigo-500 */
  --color-primary-light: #818cf8; /* indigo-400 */
  --color-bg-primary: #0f172a;   /* slate-900 */
  --color-bg-secondary: #1e293b; /* slate-800 */
  --color-bg-card: #334155;      /* slate-700 */
  --color-text-primary: #f1f5f9; /* slate-100 */
  --color-text-secondary: #94a3b8; /* slate-400 */
  --color-border: #475569;       /* slate-600 */
  --sidebar-width: 240px;
}

/* macOS titlebar 드래그 영역 */
.titlebar-drag { -webkit-app-region: drag; }
.titlebar-no-drag { -webkit-app-region: no-drag; }

/* 스크롤바 커스텀 (webkit) */
/* 카드 hover 효과 */
/* 트랜지션 기본값: 0.2s ease */
/* 칸반 드래그 중 스타일 (.dragging) */
/* 우선순위 색상: urgent=red, high=orange, medium=blue, low=gray */
/* 터미널 패널 스타일 */
/* 모달 오버레이 + 애니메이션 */
/* 토스트 알림 (우측 하단, 자동 사라짐) */
```

### 3. `src/renderer/store/store.js`
간단한 이벤트 기반 상태 관리.

```js
class Store {
  constructor() {
    this.state = {
      currentView: 'dashboard',   // dashboard | project-detail | kanban
      selectedProjectId: null,
      projects: [],
      searchQuery: '',
    };
    this.listeners = new Map();
  }

  getState() { ... }
  setState(partial) { /* merge + notify listeners */ }
  on(event, callback) { ... }
  off(event, callback) { ... }
  emit(event, data) { ... }
}

export const store = new Store();
```

### 4. `src/renderer/utils/format.js`
유틸리티 함수들.

```js
export function formatDate(dateStr) { ... }        // "2024.03.15"
export function formatTime(dateStr) { ... }        // "14:30"
export function formatDateTime(dateStr) { ... }    // "2024.03.15 14:30"
export function formatDuration(minutes) { ... }    // "2시간 30분" or "45분"
export function formatRelativeTime(dateStr) { ... } // "3분 전", "2시간 전", "어제"
export function truncate(str, maxLen) { ... }
```

### 5. `src/renderer/app.js`
앱 초기화 + SPA 라우터.

```js
import { store } from './store/store.js';
import { Sidebar } from './components/common/Sidebar.js';
import { DashboardView } from './components/dashboard/DashboardView.js';
import { ProjectDetail } from './components/project/ProjectDetail.js';
import { KanbanBoard } from './components/kanban/KanbanBoard.js';

class App {
  constructor() {
    this.container = document.getElementById('app');
    this.sidebar = new Sidebar();
    this.init();
  }

  async init() {
    this.renderLayout();
    this.setupRouting();
    await this.loadData();
    this.navigate('dashboard');
  }

  renderLayout() {
    // <div class="flex h-screen">
    //   <aside> sidebar </aside>
    //   <main id="main-content" class="flex-1 overflow-auto"> </main>
    // </div>
  }

  navigate(view, params = {}) {
    store.setState({ currentView: view, ...params });
    const main = document.getElementById('main-content');
    main.innerHTML = '';

    switch(view) {
      case 'dashboard': main.appendChild(new DashboardView().render()); break;
      case 'project-detail': main.appendChild(new ProjectDetail(params.projectId).render()); break;
      case 'kanban': main.appendChild(new KanbanBoard().render()); break;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => new App());
```

### 6. `src/renderer/components/common/Sidebar.js`
좌측 네비게이션 사이드바.

**구성**:
- 상단: 앱 로고/이름 "Claudex" + titlebar 드래그 영역
- 네비: 대시보드, 칸반 보드 링크
- 프로젝트 목록 (활성 프로젝트들, 색상 dot + 이름)
- 하단: + 새 프로젝트 버튼
- 검색 입력 필드

### 7. `src/renderer/components/common/Modal.js`
재사용 가능한 모달 컴포넌트.

```js
export class Modal {
  constructor({ title, content, onConfirm, onCancel, confirmText, cancelText }) { ... }
  render() { /* overlay + centered card */ }
  open() { ... }
  close() { ... }
}
```

### 8. `src/renderer/components/common/Toast.js`
알림 토스트 시스템.

```js
export class Toast {
  static show(message, type = 'info', duration = 3000) { ... }
  // types: info, success, warning, error
  // 우측 하단에 나타났다가 자동 사라짐
}
```

### 9. `src/renderer/components/dashboard/DashboardView.js`
메인 대시보드 화면.

**구성**:
- 상단: "대시보드" 제목 + 현재 날짜
- 통계 카드 행: 전체 프로젝트 수, 활성 프로젝트, 미완료 할 일, 오늘 작업 시간
- 프로젝트 그리드: 활성 프로젝트 카드들
  - 각 카드: 아이콘 + 이름, 상태 배지, 진행률 바, 할 일 완료 비율
  - 카드 클릭 → project-detail 이동
  - "▶ Claude Code" 버튼 → 터미널 실행
- 최근 활동 타임라인 (전체 프로젝트)

### 10. `src/renderer/components/dashboard/StatsCards.js`
통계 카드 컴포넌트.

```js
export class StatsCards {
  async render() {
    const stats = await window.api.stats.dashboard();
    // 4개의 카드를 그리드로 렌더링
    // 각 카드: 아이콘 + 라벨 + 숫자
  }
}
```

### 11. `src/renderer/components/project/ProjectList.js`
프로젝트 목록 (사이드바 & 대시보드에서 사용).

### 12. `src/renderer/components/project/ProjectDetail.js`
프로젝트 상세 페이지.

**구성**: 탭 구조
- **개요** 탭: 프로젝트 정보, 통계, 최근 활동, 실행 버튼들
  - "🖥 임베디드 터미널" 버튼 → TerminalPanel 열기
  - "🔗 Terminal.app에서 열기" 버튼 → 외부 터미널
  - "▶ Claude Code 실행" 버튼 → 터미널 + claude 실행
- **할 일** 탭: TodoList 컴포넌트
- **노트** 탭: NoteList 컴포넌트
- **시간** 탭: TimeTracker 컴포넌트
- **터미널** 탭: TerminalPanel 컴포넌트

하단에 터미널 패널이 토글로 나타날 수 있음 (슬라이드 업).

### 13. `src/renderer/components/project/ProjectForm.js`
프로젝트 생성/편집 모달 폼.

**필드**:
- 이름 (text input)
- 경로 (text input + "폴더 선택" 버튼 → `api.projects.selectFolder()`)
- 설명 (textarea)
- 색상 (color picker - 프리셋 8색 + 커스텀)
- 아이콘 (이모지 선택 드롭다운)
- 상태 (select: active/paused/completed/archived)

## 완료 기준
- [ ] 앱 실행 시 대시보드 표시
- [ ] 사이드바 네비게이션 동작
- [ ] 프로젝트 생성 모달 → 폴더 선택 → 저장
- [ ] 프로젝트 카드 클릭 → 상세 페이지 진입
- [ ] 상세 페이지 탭 전환 동작
- [ ] 통계 카드 숫자 표시
- [ ] 토스트 알림 동작
- [ ] 다크 테마 일관성
