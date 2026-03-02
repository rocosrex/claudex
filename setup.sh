#!/bin/bash
# Claudex - 초기 셋업 스크립트
# 사용법: chmod +x setup.sh && ./setup.sh

set -e

echo "🚀 Claudex 초기 셋업 시작..."

# 1. Node.js 버전 확인
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js 20 이상이 필요합니다. 현재: $(node -v 2>/dev/null || echo '없음')"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# 2. 의존성 설치
echo "📦 npm install..."
npm install

# 3. node-pty 네이티브 리빌드
echo "🔧 electron-rebuild (node-pty, better-sqlite3)..."
npx electron-rebuild

# 4. 디렉토리 구조 확인
echo "📁 프로젝트 구조 확인..."
for dir in src/main src/renderer/components src/renderer/store src/renderer/styles src/renderer/utils public assets; do
  mkdir -p "$dir"
done

echo ""
echo "✅ 셋업 완료!"
echo ""
echo "다음 단계:"
echo "  1. claude 명령으로 Claude Code를 실행하세요"
echo "  2. docs/ORCHESTRATOR-PROMPT.md의 프롬프트를 붙여넣으세요"
echo "  3. Claude Code가 에이전트들을 실행하며 구현합니다"
echo ""
echo "또는 수동 실행:"
echo "  npm start    # 앱 실행 (구현 후)"
echo "  npm run dev  # 개발 모드 (DevTools 포함)"
