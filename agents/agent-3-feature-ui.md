# Agent 3: Feature UI (Kanban + Todos + Notes + Timer)

## 역할
칸반 보드, 할 일 체크리스트, 아이디어/메모 노트, 작업 시간 추적 컴포넌트를 담당한다.

## 반드시 CLAUDE.md를 먼저 읽고 UI 디자인 가이드를 따른다.
## `src/renderer/store/store.js`와 `src/renderer/utils/format.js`를 import해서 사용한다.
## 공통 컴포넌트(Modal, Toast)는 Agent 2가 만든 것을 사용한다.

## 구현할 파일

### 1. `src/renderer/utils/drag-drop.js`
칸반 보드용 드래그앤드롭 유틸리티.

```js
/**
 * 드래그앤드롭 헬퍼.
 * HTML5 Drag and Drop API 사용.
 *
 * 사용법:
 *   makeDraggable(element, { type: 'project', id: '...' });
 *   makeDropZone(element, {
 *     acceptType: 'project',
 *     onDrop: (data) => { ... }
 *   });
 */
export function makeDraggable(element, data) {
  element.draggable = true;
  element.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    element.classList.add('dragging');
    // 드래그 이미지 (반투명 복사본)
  });
  element.addEventListener('dragend', () => {
    element.classList.remove('dragging');
  });
}

export function makeDropZone(element, { acceptType, onDrop, onDragOver, onDragLeave }) {
  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    element.classList.add('drag-over');
    onDragOver?.(e);
  });
  element.addEventListener('dragleave', () => {
    element.classList.remove('drag-over');
    onDragLeave?.();
  });
  element.addEventListener('drop', (e) => {
    e.preventDefault();
    element.classList.remove('drag-over');
    const rawData = e.dataTransfer.getData('application/json');
    if (rawData) {
      const data = JSON.parse(rawData);
      if (data.type === acceptType) onDrop(data);
    }
  });
}
```

### 2. `src/renderer/components/kanban/KanbanBoard.js`
칸반 보드 화면 — 전체 프로젝트를 4개 스테이지 컬럼으로 표시.

**스테이지 컬럼**:
| 컬럼 | kanban_stage | 색상 |
|------|-------------|------|
| 📋 Backlog | backlog | gray |
| 🔨 진행 중 | in_progress | blue |
| 👀 리뷰 | review | yellow |
| ✅ 완료 | done | green |

**카드 내용**:
- 프로젝트 아이콘 + 이름
- 할 일 진행률 미니 바 (완료/전체)
- 색상 액센트 (프로젝트 color)
- 카드 클릭 → project-detail 이동

**드래그 동작**:
- 카드를 다른 컬럼에 드롭하면 `api.projects.update(id, { kanban_stage: newStage })` 호출
- 드래그 중 대상 컬럼 하이라이트
- 같은 컬럼 내 순서 변경도 지원 (sort_order 업데이트)

**추가 기능**:
- 각 컬럼 상단에 프로젝트 수 표시
- 필터: 상태별 (active만/전체)
- 빈 컬럼에 안내 메시지

### 3. `src/renderer/components/todos/TodoList.js`
프로젝트별 할 일 체크리스트.

**구성**:
- 상단: "할 일" 제목 + 진행률 (3/10 완료) + 필터 드롭다운
- 입력 행: 새 할 일 추가 (title input + priority select + 추가 버튼)
- 리스트:
  - 각 행: 체크박스 + 제목 + 우선순위 배지 + 마감일 + 삭제 버튼
  - 체크 시 취소선 + 완료 처리 (`api.todos.update`)
  - 우선순위 배지 색상: urgent=red, high=orange, medium=blue, low=gray
  - 인라인 편집: 제목 더블클릭 시 편집 모드
- 필터: 전체 / 미완료 / 완료 / 우선순위별
- 정렬: 우선순위 > 생성일

**할 일 아이템 HTML 구조**:
```html
<div class="todo-item flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/50">
  <input type="checkbox" class="..." />
  <span class="priority-badge ...">높음</span>
  <span class="todo-title flex-1 ...">할 일 제목</span>
  <span class="due-date text-sm text-slate-400">3/15</span>
  <button class="delete-btn ...">🗑</button>
</div>
```

### 4. `src/renderer/components/notes/NoteList.js`
프로젝트별 아이디어/메모 노트 목록.

**구성**:
- 상단: "아이디어 & 메모" 제목 + 타입 필터 탭 (전체/💡아이디어/📝메모/📚참고/🐛버그/✨기능)
- "+ 새 노트" 버튼
- 노트 그리드 (2~3열 카드 레이아웃):
  - 각 카드: 타입 아이콘 + 제목, 내용 미리보기 (2줄), 태그 칩들, 날짜, 핀 아이콘
  - 핀 된 노트는 상단 고정
  - 카드 클릭 → NoteEditor 열기

### 5. `src/renderer/components/notes/NoteEditor.js`
노트 편집기 (모달 또는 슬라이드 패널).

**구성**:
- 제목 입력
- 타입 선택 드롭다운 (idea/memo/reference/bug/feature)
- 내용 텍스트에어리어 (넉넉한 크기, monospace 폰트)
  - 향후 마크다운 미리보기 가능하도록 구조화
- 태그 입력 (쉼표로 구분, 칩으로 표시)
- 📌 핀 토글
- 저장 / 삭제 버튼
- 자동 저장: 내용 변경 후 2초 디바운스로 자동 저장

### 6. `src/renderer/components/timer/TimeTracker.js`
프로젝트별 작업 시간 추적.

**구성**:
- **타이머 영역**:
  - 대형 디지털 시계 표시 (00:00:00 형식, 1초마다 업데이트)
  - 작업 설명 입력
  - ▶ 시작 / ⏹ 정지 버튼
  - 실행 중 상태: 녹색 펄스 애니메이션
- **오늘 요약**:
  - 오늘 총 작업 시간
  - 오늘 세션 리스트
- **기록 테이블**:
  - 최근 기록들 (날짜, 시작~종료, 소요시간, 설명)
  - 일별 그룹핑
- **주간 차트** (선택적):
  - 7일간 막대 차트 (CSS로 간단히 구현)

**타이머 로직**:
```js
// 시작 시: api.timelogs.start(projectId, description) → DB 저장
// 화면에서 setInterval 1초마다 표시 업데이트
// 정지 시: api.timelogs.stop(logId) → DB에 ended_at, duration_minutes 업데이트
// 앱 재시작 시: ended_at이 null인 로그가 있으면 타이머 복원
```

## CSS 클래스 참고 (Agent 2의 main.css에 추가 필요한 것들)

```css
/* 칸반 */
.kanban-column { /* 컬럼 스타일 */ }
.kanban-card.dragging { opacity: 0.5; }
.kanban-column.drag-over { /* 하이라이트 */ }

/* 우선순위 배지 */
.priority-urgent { @apply bg-red-500/20 text-red-400; }
.priority-high { @apply bg-orange-500/20 text-orange-400; }
.priority-medium { @apply bg-blue-500/20 text-blue-400; }
.priority-low { @apply bg-slate-500/20 text-slate-400; }

/* 타이머 */
.timer-display { font-family: 'SF Mono', monospace; font-size: 3rem; }
.timer-running { animation: pulse 2s infinite; }

/* 노트 타입 */
.note-type-idea { border-left: 3px solid #eab308; }
.note-type-bug { border-left: 3px solid #ef4444; }
.note-type-feature { border-left: 3px solid #22c55e; }
```

## 완료 기준
- [ ] 칸반 보드: 4컬럼 표시, 카드 드래그앤드롭으로 스테이지 변경
- [ ] 할 일: 추가, 체크, 삭제, 우선순위 표시, 필터
- [ ] 노트: 생성, 편집, 타입별 필터, 핀, 태그
- [ ] 타이머: 시작/정지, 시간 표시, 기록 리스트
- [ ] 모든 변경이 DB에 저장되고 새로고침 후에도 유지
