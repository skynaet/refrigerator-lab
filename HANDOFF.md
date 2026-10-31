# HANDOFF

- 업데이트: 2026-10-31
- 작성자: 냉장고 랩 연구봇 / Claude Code 담당
- 브랜치: `chore/cleanup-agents-ci`

## 완료한 일

- `refrigerator/components/ui/` 파일 **60개 삭제**: 앱 코드(app, components, lib, generator, tests, 설정)에서 하나도 import하지 않는 shadcn 기본 컴포넌트였습니다. ui 파일끼리만 서로 참조했습니다.
- 그 결과 쓰이지 않게 된 의존성 9개 제거(`npm uninstall`, package-lock.json 재생성):
  `@base-ui/react`, `@shadcn/react`, `class-variance-authority`, `cmdk`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-resizable-panels`, `recharts`
- `refrigerator/.gitignore`에 `tsconfig.tsbuildinfo` 추가(추적 중인 tsbuildinfo는 없었음)
- 루트 `AGENTS.md` 작성: 프로젝트 개요, 폴더 구조, 검증 명령, 작업 규칙
- 루트 `HANDOFF.md` 작성(이 파일)
- PR CI 추가: `.github/workflows/pr-ci.yml`. main 대상 PR에서 `npm ci → npm test → npm run lint → npx tsc --noEmit → npm run build` 실행
- 로컬 검증: 위 다섯 명령 모두 통과

## 남겨 둔 것 (판단 보류)

- `date-fns`, `tw-animate-css`: 이번 정리 전부터 어디에서도 참조하지 않았지만, 이번 작업 범위 밖이라 그대로 두었습니다.
- `shadcn`(CLI), `lib/utils.ts`(`clsx`, `tailwind-merge`), `hooks/use-mobile.ts`: `components.json`의 별칭 설정이 참조하므로 그대로 두었습니다. shadcn을 더 쓰지 않기로 하면 함께 지울 수 있습니다.

## 남은 일 / 다음 후보

- 냉매 회로 고장 진단 연습 모드
- 모바일 사용성 개선

## 사용자 결정 사항

- 봇에게 저장소 전체 권한을 줍니다.
- main에 직접 push하지 않습니다. 항상 브랜치를 만들고 PR로 올립니다.
