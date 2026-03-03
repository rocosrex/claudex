# Claudex

## 프로젝트 개요
Claudex — 개발 프로젝트 관리 + Claude Code 런처 통합 애플리케이션.
여러 개발 프로젝트를 GUI로 관리하면서, 버튼 클릭으로 Claude Code를 실행할 수 있다.

## 로드맵
| Phase | 플랫폼 | 기술 | 범위 |
|-------|--------|------|------|
| **Phase 1** (현재) | macOS Desktop | Electron | 프로젝트 관리 + 터미널 + Claude Code 런처 |
| **Phase 2** | iOS / Android | Flutter | 프로젝트 관리만 (할 일, 노트, 칸반, 타이머) |
| **Phase 3** | 동기화 | Firebase 또는 Supabase | Desktop ↔ Mobile 실시간 데이터 연동 |

## 대상 환경
- macOS (Mac Mini M4 Pro)
- Node.js 20+
- Electron 33+
- Claude Code (with Agent Teams enabled)

## Agent Teams 설정
이 프로젝트는 Claude Code의 Agent Teams로 병렬 개발한다.

### 사전 설정 (한 번만)
`~/.claude/settings.json`에 추가:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 팀 구성
| 역할 | 담당 파일 | 설명 |
|------|----------|------|
| **Lead** (오케스트레이터) | — | 팀 생성, 태스크 관리, 통합 테스트 |
| **backend** | `src/main/*` | Electron main process, DB, IPC, 터미널 관리 |
| **core-ui** | `public/*, src/renderer/app.js, styles/*, store/*, utils/format.js, components/common/*, dashboard/*, project/*` | 앱 셸, 대시보드, 프로젝트 CRUD UI |
| **feature-ui** | `src/renderer/components/kanban/*, todos/*, notes/*, timer/*, utils/drag-drop.js` | 칸반, 할 일, 노트, 타이머 |
| **terminal** | `src/renderer/components/terminal/*` | xterm.js 터미널, Claude Code 런처 |

### 파일 소유권 규칙 (충돌 방지)
⚠️ **각 팀원은 자기 담당 파일만 편집한다. 다른 팀원의 파일을 수정하지 않는다.**
- backend가 완성한 `preload.js`의 API 인터페이스를 다른 팀원들이 참조만 한다
- core-ui가 만든 공통 컴포넌트(Modal, Toast, store)를 feature-ui와 terminal이 import해서 사용한다
- 같은 파일을 두 팀원이 동시에 편집하면 충돌이 발생하므로 절대 금지

### 태스크 의존관계
```
[backend] src/main/* 구현
    ↓ (완료 후 unblock)
[core-ui] 앱 셸 + 대시보드 + 프로젝트 UI
[terminal] xterm.js 터미널 패널
    ↓ (core-ui 공통 컴포넌트 완료 후 unblock)
[feature-ui] 칸반 + 할 일 + 노트 + 타이머
    ↓ (모두 완료 후)
[Lead] 통합 테스트 + 에러 수정
```

## 기술 스택
| 레이어 | 기술 |
|--------|------|
| Framework | Electron 33 |
| Frontend | Vanilla JS + Web Components (빌드 도구 없이 바로 실행 가능) |
| CSS | Tailwind CSS (CDN) + Custom CSS Variables |
| Terminal | xterm.js 5.5 + xterm-addon-fit + node-pty |
| Database | better-sqlite3 (SQLite WAL mode) |
| IPC | Electron contextBridge + ipcRenderer/ipcMain |
| ID 생성 | uuid v4 |

## 핵심 기능
1. **프로젝트 대시보드** — 전체 프로젝트 목록, 상태별 필터, 검색, 통계 카드
2. **할 일 체크리스트** — 프로젝트별 TODO, 우선순위(low/medium/high/urgent), 완료 체크
3. **아이디어/메모 노트** — 마크다운 메모, 타입(idea/memo/reference/bug/feature), 태그, 핀
4. **칸반 보드** — 프로젝트를 backlog → in_progress → review → done 으로 드래그 이동
5. **작업 시간 기록** — 프로젝트별 타이머 시작/정지, 일별/주별 통계
6. **터미널 통합** — 앱 내 xterm.js 임베디드 터미널 + 외부 Terminal.app 실행
7. **Claude Code 런처** — 버튼 클릭으로 해당 프로젝트 폴더에서 `claude` 명령 실행
8. **활동 로그** — 모든 액션 자동 기록 타임라인

## 아키텍처

```
claudex/
├── CLAUDE.md                    # 이 파일 (마스터 스펙)
├── package.json
├── public/
│   └── index.html               # Single HTML entry point
├── assets/
│   └── icon.png
├── src/
│   ├── main/
│   │   ├── main.js              # Electron main process
│   │   ├── preload.js           # Context bridge (IPC)
│   │   ├── database.js          # SQLite 스키마 & CRUD
│   │   ├── terminal-manager.js  # node-pty 관리
│   │   └── external-terminal.js # Terminal.app AppleScript
│   └── renderer/
│       ├── app.js               # SPA 라우터 & 앱 초기화
│       ├── styles/
│       │   └── main.css         # 전체 스타일 (다크 테마)
│       ├── components/
│       │   ├── dashboard/
│       │   │   ├── DashboardView.js    # 메인 대시보드
│       │   │   └── StatsCards.js       # 통계 카드
│       │   ├── project/
│       │   │   ├── ProjectList.js      # 프로젝트 목록
│       │   │   ├── ProjectDetail.js    # 프로젝트 상세
│       │   │   └── ProjectForm.js      # 생성/편집 폼
│       │   ├── kanban/
│       │   │   └── KanbanBoard.js      # 칸반 보드 (드래그앤드롭)
│       │   ├── todos/
│       │   │   └── TodoList.js         # 할 일 체크리스트
│       │   ├── notes/
│       │   │   ├── NoteList.js         # 노트 목록
│       │   │   └── NoteEditor.js       # 노트 편집기
│       │   ├── timer/
│       │   │   └── TimeTracker.js      # 작업 시간 추적
│       │   ├── terminal/
│       │   │   └── TerminalPanel.js    # xterm.js 터미널 패널
│       │   └── common/
│       │       ├── Sidebar.js          # 사이드바 네비게이션
│       │       ├── Modal.js            # 모달 컴포넌트
│       │       └── Toast.js            # 알림 토스트
│       ├── store/
│       │   └── store.js         # 간단한 상태 관리 (EventEmitter)
│       └── utils/
│           ├── format.js        # 날짜, 시간 포맷 유틸
│           └── drag-drop.js     # 드래그앤드롭 유틸
└── docs/
    └── ARCHITECTURE.md
```

## DB 스키마

### projects
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | 프로젝트 이름 |
| path | TEXT | 로컬 폴더 경로 |
| description | TEXT | 설명 |
| color | TEXT | 테마 색상 (#hex) |
| icon | TEXT | 이모지 아이콘 |
| status | TEXT | active / paused / completed / archived |
| kanban_stage | TEXT | backlog / in_progress / review / done |
| created_at | DATETIME | 생성일 |
| updated_at | DATETIME | 수정일 |
| sort_order | INTEGER | 정렬 순서 |

### todos
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | projects.id |
| title | TEXT | 할 일 제목 |
| description | TEXT | 상세 설명 |
| completed | INTEGER | 0 or 1 |
| priority | TEXT | low / medium / high / urgent |
| due_date | TEXT | 마감일 (nullable) |
| sort_order | INTEGER | 정렬 순서 |

### notes
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | projects.id |
| title | TEXT | 노트 제목 |
| content | TEXT | 마크다운 내용 |
| type | TEXT | idea / memo / reference / bug / feature |
| tags | TEXT | JSON array |
| pinned | INTEGER | 0 or 1 |

### time_logs
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | projects.id |
| description | TEXT | 작업 설명 |
| started_at | DATETIME | 시작 시각 |
| ended_at | DATETIME | 종료 시각 (nullable) |
| duration_minutes | INTEGER | 소요 시간(분) |

### activity_logs
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | projects.id |
| action | TEXT | 액션 코드 |
| detail | TEXT | 상세 내용 |
| created_at | DATETIME | 발생 시각 |

## UI 디자인 가이드
- **테마**: 다크 모드 기본 (Slate계열 bg-slate-900 ~ bg-slate-800)
- **강조색**: Indigo (#6366f1) 기본, 프로젝트별 커스텀 색상
- **폰트**: system-ui, -apple-system (macOS 네이티브 느낌)
- **레이아웃**: 좌측 사이드바(240px) + 메인 콘텐츠 영역
- **titleBar**: hiddenInset (macOS 신호등 버튼 커스텀 위치)
- **카드**: rounded-xl, subtle shadow, hover elevation
- **애니메이션**: CSS transition 0.2s ease

## IPC 채널 규약
모든 IPC는 `채널그룹:액션` 형태로 명명한다.
- `projects:list`, `projects:create`, `projects:update`, `projects:delete`
- `projects:selectFolder`
- `todos:list`, `todos:create`, `todos:update`, `todos:delete`
- `notes:list`, `notes:create`, `notes:update`, `notes:delete`
- `timelogs:list`, `timelogs:start`, `timelogs:stop`
- `activity:list`
- `terminal:create`, `terminal:input`, `terminal:resize`, `terminal:close`, `terminal:runClaude`
- `terminal:data` (main→renderer), `terminal:exit` (main→renderer)
- `terminal:openExternal`
- `stats:dashboard`

## 코딩 규칙
- ES Module 스타일이지만 Electron main은 CommonJS (require)
- Renderer는 <script type="module">로 ES Module 사용
- 모든 컴포넌트는 class 기반 (render() 메서드로 DOM 생성)
- 에러 핸들링: try-catch + Toast 알림
- **영어 UI 기본** (모든 사용자 대면 텍스트: 버튼, 라벨, 토스트, 모달, 상태 메시지 등은 영어로 작성)
- 영어 주석

---

## Phase 2: 모바일 확장 전략 (Flutter)

### 목표
이동 중에 프로젝트 상태 확인, 할 일 체크, 아이디어 메모를 할 수 있는 모바일 컴패니언 앱.
터미널/Claude Code 런처는 데스크톱 전용이며, 모바일에서는 프로젝트 관리 기능만 제공한다.

### 기술 스택
| 레이어 | 기술 |
|--------|------|
| Framework | Flutter 3.x |
| 언어 | Dart |
| DB (로컬) | drift (SQLite) — Electron과 동일 스키마 |
| DB (클라우드) | Firebase Firestore 또는 Supabase |
| 상태관리 | Riverpod 또는 Bloc |
| 타겟 | iOS + Android |

### 모바일에서 제공하는 기능
| 기능 | 설명 |
|------|------|
| ✅ 프로젝트 대시보드 | 전체 프로젝트 목록, 상태, 통계 |
| ✅ 할 일 체크리스트 | 추가, 완료, 삭제, 우선순위 |
| ✅ 아이디어/메모 노트 | 생성, 편집, 태그, 핀 |
| ✅ 칸반 보드 | 스와이프/드래그로 스테이지 이동 |
| ✅ 작업 시간 기록 | 타이머 시작/정지, 기록 조회 |
| ✅ 활동 로그 | 타임라인 조회 |
| ❌ 터미널 임베딩 | 데스크톱 전용 |
| ❌ Claude Code 런처 | 데스크톱 전용 |
| ❌ 외부 터미널 실행 | 데스크톱 전용 |

### 동기화 설계 (Phase 3)

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────┐
│  Electron    │       │  Firebase /      │       │  Flutter    │
│  Desktop     │◄─────►│  Supabase        │◄─────►│  Mobile     │
│  (SQLite)    │  sync │  (Cloud DB)      │  sync │  (drift)    │
└─────────────┘       └──────────────────┘       └─────────────┘
```

**동기화 전략**:
- **오프라인 우선**: 양쪽 모두 로컬 SQLite에 먼저 저장, 온라인 시 동기화
- **충돌 해결**: Last-write-wins (updated_at 기준) + 수동 충돌 해결 UI
- **동기화 단위**: projects, todos, notes, time_logs, activity_logs 테이블 단위
- **실시간**: Firestore onSnapshot 또는 Supabase Realtime으로 변경 감지

### Phase 1에서 Phase 2를 위해 미리 준비할 것
1. **DB 스키마 안정화** — 테이블 구조 변경을 Phase 1에서 확정
2. **UUID 기반 ID** — 이미 적용됨 (충돌 없는 분산 ID)
3. **updated_at 타임스탬프** — 이미 모든 테이블에 적용됨 (동기화 기준)
4. **데이터 레이어 분리** — database.js를 순수 CRUD 모듈로 유지 (IPC와 분리)
5. **JSON 직렬화 가능한 데이터** — tags 등은 JSON 문자열로 저장 (이미 적용)

### 모바일 디렉토리 구조 (Phase 2 시작 시)
```
claudex-mobile/
├── lib/
│   ├── main.dart
│   ├── models/          # project.dart, todo.dart, note.dart ...
│   ├── database/        # drift 스키마 (Electron과 동일 구조)
│   ├── services/        # sync_service.dart, auth_service.dart
│   ├── providers/       # Riverpod providers
│   ├── screens/
│   │   ├── dashboard/
│   │   ├── project_detail/
│   │   ├── kanban/
│   │   ├── todos/
│   │   ├── notes/
│   │   └── timer/
│   └── widgets/         # 공통 위젯
├── pubspec.yaml
└── CLAUDE.md            # 모바일 전용 스펙
```

