# AGENTS.md

AI 에이전트(Claude Code 등)가 이 저장소에서 작업할 때 따르는 안내입니다.

## 프로젝트 개요

미국 업소용 냉장고를 브라우저에서 3D로 설계하고 냉매 회로를 시뮬레이션하는 웹앱입니다.

- **Hoshizaki HR24B** (`/`): 서비스 매뉴얼을 바탕으로 부품 배치와 냉매 회로를 3D로 재구성
- **True T-19-HC** (`/reference`): 사양서 치수로 만든 외형 모델, R290 냉동 사이클(P-h 선도), 냉각 실험
- **MONO 120** (`/lab`): 120L 가상 설계(실제 제품이 아님). 가상 제어기와 고장·정전 시험
- 사양서(JSON) → 3D 모델·배관 생성기(`/models`, `/new`, `/editor`)

기술 스택: TypeScript, React 19, vinext(Vite 기반 Next.js 호환 프레임워크), three.js, Tailwind CSS 4, oxlint. 정적 사이트로 빌드해 GitHub Pages에 배포합니다.

## 폴더 구조

```
refrigerator/          웹앱 (모든 npm 명령은 이 폴더에서 실행)
├─ app/                화면 (hr24, new, models, editor, reference, lab)
├─ components/         3D 장면, 냉매 회로도
├─ generator/          사양서 → 3D 모델·배관 생성기와 자동 검사
├─ specs/              냉장고 사양서 (JSON)
├─ lib/                시뮬레이션 계산, CAD·저장소 보조 코드
├─ public/             3D 모델·배관·물성표 데이터
└─ tests/              계산·모델 검증 (Node 스크립트)
.github/workflows/     pages.yml(main push 시 배포), pr-ci.yml(PR 검사)
HANDOFF.md             작업 인계 메모
```

## 검증

Node.js **22.13 이상**이 필요합니다.

```bash
cd refrigerator && npm ci && npm test && npm run lint && npx tsc --noEmit && npm run build
```

PR을 올리기 전에 위 명령이 모두 통과해야 합니다. 같은 검사를 PR CI(`.github/workflows/pr-ci.yml`)도 실행합니다.

## 작업 규칙

- 작업은 항상 **새 브랜치**에서 하고 **PR**로 올립니다.
- **main에 직접 push하지 않습니다.** main push가 곧 공개 GitHub Pages 배포입니다.
- 봇은 PR을 merge하거나 force push하지 않습니다. merge는 사용자가 합니다.
- 한 번에 **AI 하나만** 이 저장소에서 작업합니다.
- 작업을 마치면 `HANDOFF.md`를 새 내용으로 **덮어써** 다음 작업자에게 인계합니다.
- 답변과 문서는 **한국어**로 씁니다.
- 제조사 문서(매뉴얼·사양서 PDF와 그림)는 저작권 때문에 커밋하지 않습니다(`.gitignore` 참고).
