# HANDOFF

- 업데이트: 2026-11-02
- 작성자: 냉장고 랩 연구봇 / Codex CLI 담당 (Claude Code는 5시간 한도 소진으로 시작 직후 429, 14:10 KST 리셋)
- 브랜치: `feat/blend-refrigerants`

## 끝난 일

### 1. 혼합 냉매 기포점·이슬점 표

- `refrigerator/public/calculator/generate_saturation.py`(CoolProp **8.0.0** 고정)에 R410A·R404A·R407C를 추가했습니다. CoolProp의 Lemmon 의사순수(pseudo-pure) 모델로 `PropsSI('P','T',T,'Q',0,f)`(기포점)와 `Q=1`(이슬점) 압력을 따로 만들어 `bubblePressurePa`·`dewPressurePa` 열로 저장합니다.
- 범위: 하한 −40 °C, 1 K 간격, 상한 `min(70, floor(Tcrit − 5 K))` → R410A −40~66 °C(Tcrit 71.3 °C), R404A −40~67 °C(72.1 °C), R407C −40~70 °C(86.2 °C). 냉매별 `temperatureC`에 기록합니다.
- 검사: 열마다 단조 증가, 모든 점에서 기포점 압력 > 이슬점 압력(R410A 근사 공비 포함), 열마다 ln(P)–1/T 보간 중간점 오차 < 0.05 K. 실측 최대 오차 R410A 0.0004 K, R404A 0.0006 K, R407C 0.0003 K.
- 단일 성분 R290·R600a·R134a의 `pressurePa` 값과 검사는 그대로입니다(재생성 후 main과 값 동일 확인). 각 항목에 `kind`(`pure`/`blend`)를 붙였습니다.
- ASHRAE 34 안전 등급: R410A·R404A·R407C 모두 A1.
- **R448A·R449A는 제외**: CoolProp 8.0.0에 해당 유체가 없습니다(`Neither input to Props1SI [R448A,Tcrit] is a valid fluid`). HEOS 혼합물로 임의 합성하지 않았고, JSON `excludedFluids`와 문서에 적었습니다.
- 재생성(저장소 루트): `python3 -m venv /tmp/sat-venv && /tmp/sat-venv/bin/pip install CoolProp==8.0.0 && /tmp/sat-venv/bin/python refrigerator/public/calculator/generate_saturation.py`. 같은 날 다시 돌리면 바이트 단위로 같은 파일이 나옵니다(날짜 필드만 실행일에 따라 바뀜).

### 2. 계산기 (`/calculator`)

- `refrigerator/lib/field-calculator.ts`: `RefrigerantId`에 R410A·R404A·R407C 추가. 혼합 냉매는 흡입(저압) 과열도 = 배관 온도 − **이슬점** 온도, 액관(고압) 과냉도 = **기포점** 온도 − 배관 온도. 결과에 기준(`basis`: pure/dew/bubble)과 그 압력의 온도 글라이드(`glideK`, 이슬점 − 기포점)를 넣었습니다. 반대쪽 열이 범위 밖이면 글라이드는 외삽하지 않고 null입니다. 역계산은 혼합 냉매에서 기포점·이슬점 압력을 둘 다 돌려줍니다(`saturationPressuresKPa`).
- `refrigerator/app/calculator/page.tsx`: 기준 온도 이름(포화/이슬점/기포점)과 "이슬점 기준(흡입 과열도) · 이 압력의 온도 글라이드 약 x K" 문구 표시, 측정 위치별 계산 범위, 역계산 두 압력 표시. 새 냉매 안전 안내(R410A 고압 전용 게이지·호스·회수 장비, 불연성 A1이어도 고압 위험, 산소 결핍·환기, 분해 생성물, 대기 방출 금지·회수, 혼합 냉매 액상 충전, 제조사 절차·현지 법규). 확인 안 된 법 조문·수치는 쓰지 않았습니다. 출처 링크와 링크 터치 높이 44px(`calculator.css`) 추가. three.js는 불러오지 않습니다.
- 저장값 형식 version 1은 그대로입니다. 예전 R290·R600a·R134a 저장값이 복원되고, 새 냉매도 저장·복원됩니다.

### 3. 검사·문서

- `refrigerator/tests/field-calculator.mjs`: 메타데이터(냉매 목록·kind·안전 등급·냉매별 범위·임계 여유·R448A/R449A 미포함), 열별 단조성, 기포점 > 이슬점, CoolProp 직접값 스폿 체크(−20·0·40·60 °C, 0.06 Pa), 중간점 직접값(0.001 K), 열별 왕복, 이슬점·기포점 기준 과열도·과냉도와 글라이드(R407C 800 kPa(a): 기포점 11.0 °C·이슬점 16.8 °C·글라이드 약 5.85 K), 범위 밖 미외삽(R410A 68 °C 등), 예전 저장값 복원과 새 냉매 저장·복원.
- `README.md`, `refrigerator/README.md`: 냉매 목록·데이터 출처·재생성 방법·테스트 설명 갱신.

## 검증 결과

- `cd refrigerator && npm ci && npm test && npm run lint && npx tsc --noEmit && npm run build` 모두 통과(Node v24.22.1, Codex 실행과 오케스트레이터 재실행 둘 다).
- Codex가 프로덕션 서버를 Chrome 360px로 열어 혼합 냉매 3종의 흡입·액관·모든 압력 단위를 확인: 가로 스크롤 없음, 44px 미만 터치 대상 없음, three.js 미로드, 저장값 복원 정상. 기존 `style-*.js`·`favicon.ico` 404는 그대로입니다.

## 남은 일

- 후속 후보: R448A·R449A 등 CoolProp 8.0.0에 없는 냉매는 제조사 공개 P-T 표(저작권·재배포 조건 확인 필요)나 다른 검증된 물성 라이브러리가 생기면 검토합니다.
- 후속 후보: R22·R32 등 국내 시스템에어컨에서 쓰는 냉매 추가(R32는 CoolProp 순수 유체, A2L 안전 안내 필요).
- 후속 후보: 제조사 서비스 데이터(기기별 정상 압력·과열도·과냉도 범위)를 근거로 쓸 수 있게 되면 높음·정상·낮음 판정을 추가합니다. 그 전에는 판정하지 않습니다.
- 후속 후보: R134a 25 °C 공개값(665.8 kPa로 제시됨)을 NIST·ASHRAE 원문으로 확인합니다. CoolProp 값은 665.38 kPa입니다.
- 후속 후보: `style-*.js` 404(기존 문제)의 원인을 vinext 빌드 쪽에서 확인하고 `favicon.ico` 404도 정리합니다.
- 후속 후보: `/reference` 3D 배관에 시나리오별 강조 상태를 전달하는 방식을 검토합니다.

## 사용자 결정 사항

- 봇에게 저장소 전체 권한을 줍니다.
- main에 직접 push하지 않습니다. 항상 브랜치를 만들고 PR로 올립니다.
- 테스트 통과 시 봇이 squash 머지합니다.
- 리포는 skynaet 조직에 있습니다.
- skynaet 리포의 규칙(AGENTS.md 등) 변경은 봇이 정해도 됩니다. 삭제는 사용자만 합니다(2026-10-31 18:27 KST 설이대장님 "니알아서 하라니까?"). 이에 따라 AGENTS.md 머지 문구를 봇 머지 허용으로 고쳤습니다.

## 진행 중 하위 작업

병렬 하위 작업이 있으면 그로기가 통합할 때 이 표를 갱신한다. 지금은 없다.

| 작업 | 에이전트 | 브랜치 | worktree | 상태 |
|---|---|---|---|---|

## 설계 결정

- 여러 AI가 병렬로 작업할 때는 각자 별도 브랜치·worktree를 쓴다. 하위 작업 AI는 `HANDOFF.md`를 고치지 않고, 그로기가 통합할 때 한 번 갱신한다(2026-11-01).
