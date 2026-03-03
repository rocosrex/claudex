# Claudex

개발 프로젝트 관리 + Claude Code 런처 통합 데스크톱 애플리케이션.

여러 개발 프로젝트를 GUI로 관리하면서, 버튼 클릭으로 Claude Code를 실행할 수 있습니다.

![Platform](https://img.shields.io/badge/platform-macOS-blue)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)

## 주요 기능

- **프로젝트 대시보드** — 전체 프로젝트 목록, 상태별 필터, 검색, 통계 카드
- **할 일 체크리스트** — 프로젝트별 TODO, 우선순위(low/medium/high/urgent), 파일 첨부
- **아이디어/메모 노트** — 마크다운 메모, 타입별 분류, 태그, 핀 고정
- **칸반 보드** — backlog → in_progress → review → done 드래그 이동
- **작업 시간 기록** — 프로젝트별 타이머, 일별/주별 통계
- **터미널 통합** — 앱 내 xterm.js 임베디드 터미널 + SSH 접속
- **Claude Code 런처** — 버튼 클릭으로 프로젝트 폴더에서 `claude` 명령 실행
- **자동 업데이트** — GitHub Releases 기반 자동 업데이트

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Framework | Electron 33 |
| Frontend | Vanilla JS + Web Components |
| CSS | Tailwind CSS (CDN) + Custom CSS Variables |
| Terminal | xterm.js 5.5 + node-pty |
| Database | better-sqlite3 (SQLite WAL mode) |
| Auto Update | electron-updater + GitHub Releases |

## 설치 및 실행

### 요구사항

- macOS
- Node.js 20+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (터미널 런처 사용 시)

### 셋업

```bash
git clone https://github.com/rocosrex/claudex.git
cd claudex
chmod +x setup.sh && ./setup.sh
```

또는 수동으로:

```bash
npm install
npx electron-rebuild
```

### 실행

```bash
# 프로덕션 모드
npm start

# 개발 모드 (DevTools 포함, 핫 리로드)
npm run dev
```

### 빌드

```bash
# macOS 빌드 (dmg + zip)
npm run build:mac

# 빌드 + GitHub Release 배포
GH_TOKEN=$(gh auth token) npm run publish
```

## 스크린샷

> TODO: 스크린샷 추가 예정

## 로드맵

| Phase | 플랫폼 | 상태 |
|-------|--------|------|
| **Phase 1** | macOS Desktop (Electron) | 진행 중 |
| **Phase 2** | iOS / Android (Flutter) | 계획 |
| **Phase 3** | Desktop ↔ Mobile 실시간 동기화 | 계획 |

## 라이선스

MIT
