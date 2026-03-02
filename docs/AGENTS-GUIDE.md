# Claudex - Agent Teams 가이드

## 개요
이 프로젝트는 Claude Code의 **Agent Teams** 기능으로 병렬 개발한다.
서브에이전트와 달리 팀원끼리 직접 메시지를 주고받을 수 있고,
공유 태스크 리스트로 작업 진행 상황을 추적한다.

## Agent Teams vs 서브에이전트

| | 서브에이전트 | Agent Teams |
|---|---|---|
| 소통 | Lead에게만 보고 | 팀원끼리 직접 메시지 |
| 컨텍스트 | Lead의 컨텍스트 공유 | 각자 독립 컨텍스트 (CLAUDE.md는 자동 로드) |
| 태스크 관리 | 없음 | 공유 태스크 리스트 + 의존관계 |
| 모니터링 | 결과만 확인 | Shift+Up/Down으로 실시간 확인 |
| 비용 | 낮음 | 높음 (팀원마다 별도 세션) |

## 팀 구성 (4 Teammates + 1 Lead)

```
┌─────────────────────────────────────────────────┐
│                   Lead (오케스트레이터)             │
│         팀 생성, 태스크 배분, 통합 테스트            │
└──────┬──────────┬──────────┬──────────┬─────────┘
       │          │          │          │
  ┌────▼────┐ ┌──▼─────┐ ┌──▼──────┐ ┌▼────────┐
  │backend  │ │core-ui │ │feature- │ │terminal │
  │         │ │        │ │ui       │ │         │
  │src/main/│ │public/ │ │kanban/  │ │terminal/│
  │*.js     │ │app.js  │ │todos/   │ │*.js     │
  │         │ │common/ │ │notes/   │ │         │
  │         │ │dash/   │ │timer/   │ │         │
  │         │ │project/│ │         │ │         │
  └────┬────┘ └──┬─────┘ └──┬──────┘ └┬────────┘
       │          │          │          │
       └──────────┴────┬─────┴──────────┘
                       │
               통합 테스트 (Lead)
```

## 태스크 의존관계

```
Task 1: [backend] npm install + electron-rebuild
Task 2: [backend] src/main/database.js 구현          (depends: Task 1)
Task 3: [backend] src/main/terminal-manager.js 구현   (depends: Task 1)
Task 4: [backend] src/main/external-terminal.js 구현  (depends: Task 1)
Task 5: [backend] src/main/preload.js 구현           (depends: Task 2,3,4)
Task 6: [backend] src/main/main.js 구현              (depends: Task 5)

Task 7:  [core-ui] public/index.html + styles/main.css  (depends: Task 6)
Task 8:  [core-ui] store/store.js + utils/format.js     (depends: Task 6)
Task 9:  [core-ui] common/ (Sidebar, Modal, Toast)       (depends: Task 7,8)
Task 10: [core-ui] dashboard/ (DashboardView, StatsCards) (depends: Task 9)
Task 11: [core-ui] project/ (ProjectList, Detail, Form)   (depends: Task 9)
Task 12: [core-ui] app.js (라우터 + 초기화)               (depends: Task 10,11)

Task 13: [terminal] TerminalPanel.js                      (depends: Task 6, Task 9)

Task 14: [feature-ui] utils/drag-drop.js                  (depends: Task 9)
Task 15: [feature-ui] kanban/KanbanBoard.js               (depends: Task 14)
Task 16: [feature-ui] todos/TodoList.js                   (depends: Task 9)
Task 17: [feature-ui] notes/NoteList.js + NoteEditor.js   (depends: Task 9)
Task 18: [feature-ui] timer/TimeTracker.js                (depends: Task 9)

Task 19: [Lead] 통합 테스트 + 에러 수정                    (depends: Task 12,13,15,16,17,18)
```

## 파일 소유권 (충돌 방지)

⚠️ **가장 중요한 규칙: 각 팀원은 자기 담당 파일만 편집한다.**

| 팀원 | 소유 파일 |
|------|----------|
| backend | `src/main/main.js`, `preload.js`, `database.js`, `terminal-manager.js`, `external-terminal.js` |
| core-ui | `public/index.html`, `src/renderer/app.js`, `styles/main.css`, `store/store.js`, `utils/format.js`, `components/common/*`, `components/dashboard/*`, `components/project/*` |
| feature-ui | `components/kanban/*`, `components/todos/*`, `components/notes/*`, `components/timer/*`, `utils/drag-drop.js` |
| terminal | `components/terminal/*` |

## 팀원 간 소통 포인트

- **backend → core-ui, feature-ui, terminal**: "preload.js 완성됨. window.api 인터페이스 확인해줘"
- **core-ui → feature-ui**: "Modal, Toast, store.js 완성됨. import 가능"
- **core-ui → terminal**: "index.html에 xterm CDN 추가됨. styles/main.css에 터미널 CSS 필요하면 알려줘"
- **feature-ui → core-ui**: "main.css에 칸반/타이머 CSS 추가 필요" (core-ui가 추가)

## 실행 체크리스트

- [ ] `~/.claude/settings.json`에 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` 추가
- [ ] `cd claudex && claude --dangerously-skip-permissions` 실행
- [ ] `docs/ORCHESTRATOR-PROMPT.md`의 프롬프트 입력
- [ ] Lead가 팀 생성 → 태스크 배분 → 팀원 spawn
- [ ] backend 완료 확인 → core-ui, terminal 시작
- [ ] core-ui 공통 컴포넌트 완료 → feature-ui 시작
- [ ] 전원 완료 → npm start 테스트
- [ ] 에러 수정 → 완성

## 모니터링 팁

- `Shift+Up/Down`: 팀원 터미널 전환
- `Shift+Tab`: Lead를 delegate mode로 (구현 안 하고 조율만)
- `/cost`: 토큰 사용량 확인
- tmux/iTerm2 split-pane: 팀원들을 동시에 볼 수 있음

## 비용 참고
Agent Teams는 팀원마다 별도 컨텍스트 윈도우를 사용하므로 비용이 높다.
4명 팀원 = 약 4~5배의 토큰 사용량.
예상: Claudex 전체 구현에 $5~$15 (모델/속도에 따라 다름).
