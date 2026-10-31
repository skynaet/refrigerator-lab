# HANDOFF

- 업데이트: 2026-10-31
- 작성자: 냉장고 랩 연구봇 / Claude Code 담당
- 브랜치: `chore/post-transfer-maintenance`

## 끝난 일

저장소를 GitHub 사용자 `JJ-dot-eng`에서 조직 `skynaet`로 옮긴 뒤 정리한 내용입니다.

### 1. 옛 주소 교체

- `README.md` 세 곳:
  - 5행 사이트 주소: `https://jj-dot-eng.github.io/refrigerator-lab/` → `https://skynaet.github.io/refrigerator-lab/`
  - 20행 사용하기 안내: 위와 같은 사이트 주소 교체
  - 27행 clone 명령: `https://github.com/JJ-dot-eng/refrigerator-lab.git` → `https://github.com/skynaet/refrigerator-lab.git`
- 저장소 전체(`node_modules`, `.git`, `package-lock.json` 제외)를 `JJ-dot-eng`, `jj-dot-eng`, `doagents`로 검색한 결과 남은 옛 주소는 없습니다. `AGENTS.md`에도 옛 주소가 없어 고치지 않았습니다.
- 빌드 basePath는 바꾸지 않았습니다. `pages.yml`이 `PAGES_BASE_PATH=/${{ github.event.repository.name }}`로 설정하고 `next.config.ts`가 이 값을 읽으므로, 저장소 이름이 그대로인 지금은 `/refrigerator-lab`입니다.

### 2. GitHub Actions 버전 올림

버전 문자열만 바꿨습니다. 트리거, 권한, 배포 단계, node-version은 그대로입니다.

| 파일 | 액션 | 이전 | 이후 |
|---|---|---|---|
| `.github/workflows/pr-ci.yml` | `actions/checkout` | `@v4` | `@v7` |
| `.github/workflows/pr-ci.yml` | `actions/setup-node` | `@v4` | `@v7` |
| `.github/workflows/pages.yml` | `actions/checkout` | `@v4` | `@v7` |
| `.github/workflows/pages.yml` | `actions/setup-node` | `@v4` | `@v7` |
| `.github/workflows/pages.yml` | `actions/upload-pages-artifact` | `@v3` | `@v5` |
| `.github/workflows/pages.yml` | `actions/deploy-pages` | `@v4` | `@v5` |

`pages.yml`은 main에 merge된 뒤 실제 배포가 돌아야 확인됩니다. 첫 배포가 성공하는지 살펴봐 주세요.

### 3. 의존성 정리

- `date-fns`, `tw-animate-css`를 제거했습니다(`npm uninstall`, `package-lock.json` 갱신).
- 근거: 숨김·무시 파일까지 포함해 저장소 전체를 검색했을 때 두 이름은 `refrigerator/package.json`에만 있었습니다. 코드의 import·require, 설정 파일, 테스트, 생성기, 스크립트 어디에서도 쓰지 않습니다. CSS의 `@import`/`@plugin`은 `app/globals.css:1`의 `@import 'tailwindcss';` 하나뿐입니다.

### 4. 검증

`refrigerator/`에서 차례로 실행했고 모두 통과했습니다.

- `npm ci` 통과
- `npm test` 통과
- `npm run lint` 통과
- `npx tsc --noEmit` 통과
- `npm run build` 통과

## 남겨 둔 것 (판단 보류)

- `shadcn`(CLI), `lib/utils.ts`(`clsx`, `tailwind-merge`), `hooks/use-mobile.ts`: `components.json`의 별칭 설정이 참조하므로 그대로 두었습니다. shadcn을 더 쓰지 않기로 하면 함께 지울 수 있습니다.

## 남은 일 / 다음 후보

- 냉매 회로 고장 진단 연습 모드
- 휴대폰 사용성 개선

## 사용자 결정 사항

- 봇에게 저장소 전체 권한을 줍니다.
- main에 직접 push하지 않습니다. 항상 브랜치를 만들고 PR로 올립니다.
- 테스트 통과 시 봇이 squash 머지합니다.
- 리포는 skynaet 조직에 있습니다.
