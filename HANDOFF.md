# HANDOFF

- 업데이트: 2026-10-31
- 작성자: 냉장고 랩 연구봇 / Codex 담당
- 브랜치: `feat/diagnosis-practice`

## 끝난 일

### 1. 냉매 회로 고장 진단 연습 모드 v1 (`/diagnose`)

- `refrigerator/lib/diagnosis.ts`: 시나리오 데이터와 순수 함수(`listScenarios`, `symptomKey`, `pickScenario`, `buildChoices`, `judge`).
  - 시나리오 6개: 냉매 부족(누설), 냉매 과충전, 모세관/드라이어 막힘(제한), 응축기 오염 또는 응축기 팬 고장, 증발기 팬 고장 또는 증발기 결빙, 압축기 효율 저하.
  - 항목 7개를 정상 대비 `높음`/`낮음`/`정상`으로 표시: 저압(흡입) 압력, 고압(토출/응축) 압력, 과열도, 과냉도, 압축기 전류, 증발기 온도, 고내 온도. 시나리오마다 관찰 단서와 짧은 한국어 해설이 있습니다.
  - 모세관 방식, 단일 고장, 압축기 운전 중, 비슷한 주위 온도·부하를 가정한 교과서 수준의 경향입니다. 조건에 따라 달라지는 항목(제한 시 고압, 응축기 고장 시 과열도·과냉도, 증발기 풍량 부족 시 과냉도, 압축기 효율 저하 시 과열도 등)은 해설에 가정과 예외를 적었습니다.
  - 수치는 표시하지 않고 방향만 보여 줍니다. 제조사 서비스 데이터나 특정 모델의 실측값이 아닙니다.
- `refrigerator/app/diagnose/page.tsx`, `layout.tsx`, `diagnose.css`: 무작위 문제(직전 문제 반복 방지), 원인 고르기, 정답/오답과 해설, `다음 문제`, 점수(맞힌 수 / 푼 문제 수). 무작위 추첨은 마운트 뒤에 해서 hydration 불일치를 피합니다. 브라우저 제목은 `냉매 회로 고장 진단 연습 · Refrigerator Lab`.
- 진입 링크 `고장 진단 연습`: 홈(`/`, hr24 머리말), `/models`, `/new`, `/editor`, `/reference` 머리말. 링크가 늘어 머리말이 좁은 화면에서 줄바꿈되도록 `hr24/style.css`, `reference/reference.css`에 한 줄씩 추가했습니다.
- `refrigerator/tests/diagnosis.mjs`: 시나리오 6개 이상, 증상 조합 중복 금지, 항목·방향 완전성, 모든 정답/오답 판정, 잘못된 ID, 난수 주입 추첨과 보기 섞기 검사. `npm test`에 `node --experimental-strip-types tests/diagnosis.mjs`로 연결했습니다.

### 2. 문서

- `README.md`: 화면 표에 `/diagnose` 한 줄, 구성의 app 목록에 `diagnose` 추가.
- `refrigerator/README.md`: 목차에 진단 연습 한 줄 추가.

### 3. 검증

`refrigerator/`에서 차례로 실행했고 모두 통과했습니다.

- `npm ci` 통과
- `npm test` 통과
- `npm run lint` 통과
- `npx tsc --noEmit` 통과
- `npm run build` 통과
- 360px 세로 화면(헤드리스 Chrome, `vinext start`): `/diagnose` 문제·정답 화면 모두 가로 스크롤 없음(scrollWidth 360). 답 선택 → 정답/오답·점수 갱신 → `다음 문제` 동작 확인. `/`, `/models`, `/reference`에 진입 링크 있음.

## 남은 일 / 다음 후보

- 진단 시나리오 확장
- 3D 회로와 연결
- 휴대폰 사용성
- AGENTS.md 머지 규칙 변경은 사용자 확인 대기

## 사용자 결정 사항

- 봇에게 저장소 전체 권한을 줍니다.
- main에 직접 push하지 않습니다. 항상 브랜치를 만들고 PR로 올립니다.
- 테스트 통과 시 봇이 squash 머지합니다.
- 리포는 skynaet 조직에 있습니다.
