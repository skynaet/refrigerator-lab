# HANDOFF

- 업데이트: 2026-11-02
- 작성자: 냉장고 랩 연구봇 / Claude Code CLI 담당
- 브랜치: `feat/r32-r22`

## 끝난 일

### 국내 시스템에어컨 냉매 R32·R22 추가 (`/calculator`)

- `refrigerator/public/calculator/generate_saturation.py`(CoolProp **8.0.0** 고정)에 R32·R22를 단일 성분(`kind: pure`)으로 추가하고 `saturation-table.json`을 재생성했습니다. 단일 성분에도 범위 규칙 `min(70, floor(Tcrit − 5 K))`을 적용합니다(`pureTemperatureRule`). R32 −40~70 °C(Tcrit 78.105 °C, 최대 보간 오차 0.00035 K), R22 −40~70 °C(Tcrit 96.145 °C, 0.00016 K). 기존 6종 값은 바이트 단위로 같습니다(JSON diff는 추가만).
- `refrigerator/lib/field-calculator.ts`: 냉매 목록·순서 R290, R600a, R134a, R32, R22, R410A, R404A, R407C.
- `refrigerator/app/calculator/page.tsx`: 안전 안내 추가. R32 = 약가연성 A2L(점화원 관리·환기·A2L 대응 회수·진공 장비, R410A보다 약간 높은 압력, 방출 금지·회수). R22 = HCFC 오존층 파괴 물질(방출 금지·회수, 재생 냉매 가능성, R410A 등과 혼합·대체 충전 금지, 주로 광유 계통), A1. 확인 안 된 법 조문·수치는 쓰지 않았습니다.
- `calculator.css`: 냉매 버튼 360px에서 2열×4줄, 560px 이상 4열×2줄. 출처 링크 줄바꿈 분할 방지.
- `refrigerator/tests/field-calculator.mjs`: R32·R22 메타데이터·안전 등급·임계온도, CoolProp 직접값 스폿 체크(−20·0·40·60·−9.5·25.5 °C), 단조성·왕복, R32 > R410A > R22 압력 관계, 70 °C 초과 미외삽, 저장·복원.
- README 두 곳 갱신.

## 검증 결과

- `cd refrigerator && npm ci && npm test && npm run lint && npx tsc --noEmit && npm run build` 통과(Claude Code 실행과 오케스트레이터 재실행).
- Claude Code가 프로덕션 서버를 headless Chrome 360px·768px로 열어 8종 × 흡입·액관 확인: 가로 스크롤 없음, 44px 미만 터치 대상 없음, three.js 미로드, R32 선택 저장 복원. 실기기·iOS Safari·Pages 경로 빌드는 확인 안 함.

## 남은 일

- 후속 후보: R448A·R449A 등 CoolProp 8.0.0에 없는 냉매는 제조사 공개 P-T 표(저작권·재배포 조건 확인 필요)나 다른 검증된 물성 라이브러리가 생기면 검토합니다.
- 후속 후보: 제조사 서비스 데이터(기기별 정상 압력·과열도·과냉도 범위)를 근거로 쓸 수 있게 되면 높음·정상·낮음 판정을 추가합니다. 그 전에는 판정하지 않습니다.
- 후속 후보: R134a 25 °C 공개값(665.8 kPa로 제시됨)을 NIST·ASHRAE 원문으로 확인합니다. CoolProp 값은 665.38 kPa입니다.
- 후속 후보: `style-*.js` 404(기존 문제)의 원인을 vinext 빌드 쪽에서 확인하고 `favicon.ico` 404도 정리합니다.
- 후속 후보: `/reference` 3D 배관에 시나리오별 강조 상태를 전달하는 방식을 검토합니다.
- 후속 후보: R22 안내의 '주로 광유 계통'은 일반 지식 기반이므로 기기별 오일은 제조사 자료로 확인할 문구 보강을 검토합니다.
- 후속 후보: 혼합 냉매·R32·R22 값의 독립 기준점(NIST·ASHRAE 등 출처가 확인된 공개값)을 냉매당 한두 점 테스트에 추가합니다. 지금 스폿 체크는 같은 CoolProp 8.0.0 직접값이라 표 생성·보간만 검증합니다.
- 시나리오 확장은 기존 6개와 지표가 확실히 구별될 때 검토합니다. 불응축 가스·TXV 과공급·제상 불량을 별도 정답으로 추가하지 않은 기존 판단을 유지합니다.

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
