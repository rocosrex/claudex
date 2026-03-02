# Claudex - Agent Teams 오케스트레이터 프롬프트

## 사전 준비

### 1. Agent Teams 활성화 (한 번만)
`~/.claude/settings.json`에 추가:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 2. 실행
```bash
cd claudex
claude --dangerously-skip-permissions
```

> `--dangerously-skip-permissions`이 없으면 팀원들이 파일 접근 권한 승인에서 멈춥니다.

---

## 프롬프트 (복사해서 붙여넣기)

```
먼저 npm install과 npx electron-rebuild를 실행해줘.

그 다음 CLAUDE.md를 읽고 Claudex 앱을 Agent Teams로 구현해줘.
agents/ 폴더에 각 팀원의 태스크 상세가 있어.

에이전트 팀을 만들어줘. 4명의 팀원 구성:

1. Teammate "backend"
   - agents/agent-1-backend.md를 읽고 실행
   - 담당: src/main/* (main.js, preload.js, database.js, terminal-manager.js, external-terminal.js)
   - 다른 팀원보다 먼저 완료해야 함 (의존 관계의 기반)

2. Teammate "core-ui"
   - agents/agent-2-core-ui.md를 읽고 실행
   - 담당: public/*, src/renderer/app.js, styles/*, store/*, utils/format.js, components/common/*, dashboard/*, project/*
   - backend 완료 후 시작

3. Teammate "feature-ui"
   - agents/agent-3-feature-ui.md를 읽고 실행
   - 담당: components/kanban/*, todos/*, notes/*, timer/*, utils/drag-drop.js
   - backend 완료 + core-ui의 공통 컴포넌트(Modal, Toast, store) 완료 후 시작

4. Teammate "terminal"
   - agents/agent-4-terminal.md를 읽고 실행
   - 담당: components/terminal/*
   - backend 완료 후 시작

파일 소유권 규칙:
- 각 팀원은 자기 담당 파일만 편집한다
- 다른 팀원의 파일을 절대 수정하지 않는다
- 같은 파일 동시 편집 금지

태스크 의존관계:
- backend → core-ui, terminal (병렬)
- core-ui 공통 컴포넌트 완료 → feature-ui
- 전원 완료 → Lead가 통합 테스트

Lead인 너는 직접 구현하지 말고, 팀원들에게 위임하고 조율만 해줘.
팀원들의 진행 상황을 모니터링하고, 모두 완료되면 npm start로 테스트해서 에러를 수정해줘.
```

---

## 대안: 순차 실행 (Agent Teams 없이)

Agent Teams를 사용하지 않고 순차적으로 하고 싶다면:

```bash
claude --dangerously-skip-permissions
```

```
CLAUDE.md를 읽고 Claudex 앱을 구현해줘.
agents/ 폴더의 태스크 파일 순서대로 진행해줘:
1. agents/agent-1-backend.md
2. agents/agent-2-core-ui.md
3. agents/agent-3-feature-ui.md
4. agents/agent-4-terminal.md
마지막에 npm start로 테스트하고 에러 수정해줘.
```

---

## 팁
- `Shift+Up/Down`으로 팀원 터미널 전환 가능
- `Shift+Tab`으로 Lead를 delegate mode로 전환하면 Lead가 직접 구현하지 않고 조율만 함
- 팀원이 멈춰있으면 Lead에게 "nudge해줘"라고 말하기
- `/cost`로 토큰 사용량 모니터링 (팀원이 많으면 비용 증가)
- tmux나 iTerm2에서 실행하면 split-pane으로 팀원들을 동시에 볼 수 있음
