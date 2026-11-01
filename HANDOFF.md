# HANDOFF

- 업데이트: 2026-11-01
- 작성자: 냉장고 랩 연구봇 / Claude Code 담당
- 브랜치: `feat/saturation-tables`

## 끝난 일

### 1. 재현 가능한 포화압력 표

- `refrigerator/public/calculator/generate_saturation.py`를 추가했습니다. CoolProp **8.0.0**으로 고정했고, 다른 버전이면 실행을 멈춥니다. `PropsSI('P','T',T,'Q',0,fluid)`로 R290(Propane)·R600a(IsoButane)·R134a의 −40…70 °C, 1 K 간격 포화압력(절대압 Pa, 0.1 Pa 반올림)을 만들고, Q=1 압력과 같은지(단일 성분, 기포점 = 이슬점), 단조 증가, 임계온도 여유를 확인합니다. 구간 중간 9점을 CoolProp 직접 계산과 비교해 최대 ln(P)–1/T 보간 오차가 0.05 K 미만인지도 검사합니다. 실측 최대 오차는 R290 0.00013 K, R600a 0.00018 K, R134a 0.0002 K이며, 5 K 간격에서도 0.005 K 이하였습니다.
- 결과 `refrigerator/public/calculator/saturation-table.json`(약 6 KB)에는 CoolProp 버전, 생성 스크립트 경로, 생성 날짜(2026-11-01), 호출식, 단위(°C, 절대압 Pa), 보간 방법, 냉매별 CoolProp 이름·표시 이름·ASHRAE 안전 등급(R290·R600a A3, R134a A1)·임계온도·최대 보간 오차가 들어 있습니다. 혼합 냉매(R404A·R407C 등)는 넣지 않았습니다.
- 재생성 방법(저장소 루트, CoolProp은 npm 의존성이 아님): `python3 -m venv /tmp/sat-venv && /tmp/sat-venv/bin/pip install CoolProp==8.0.0 && /tmp/sat-venv/bin/python refrigerator/public/calculator/generate_saturation.py`.

### 2. 계산기 전환 (`/calculator`)

- `refrigerator/lib/field-calculator.ts`: 손으로 옮긴 13·14점을 지우고, 생성 JSON을 `import … with {type: 'json'}`로 불러옵니다(Node 테스트·tsc·vinext 정적 빌드 모두 동작). `RefrigerantId`에 `R134a`를 추가했고, `safetyGroup`, `SATURATION_TABLE_PATH`, `SATURATION_LIBRARY`를 내보냅니다. 0~30 °C 공백이 없어져 `wideGap` 필드와 넓은 간격 안내를 지웠습니다. 범위 밖 처리(외삽하지 않고 한계값 표시)는 그대로 두었고, 범위는 −40~70 °C로 넓어졌습니다.
- `refrigerator/app/calculator/page.tsx`: 냉매 선택에 R134a를 추가했고, 선택한 냉매별 안전 안내를 냉매 선택 바로 아래에 표시합니다. R134a 안내 내용은 불연성(A1)이지만 고압 용기·배관 위험, 밀폐 공간 산소 결핍(환기), 화염·뜨거운 표면에서 생기는 유해 분해 생성물, 대기 방출 금지와 회수, 제조사 절차·현지 법규 준수입니다. 법규 조문이나 수치처럼 확인하지 못한 내용은 적지 않았습니다. 데이터 출처 문구도 생성 표 기준으로 바꿨습니다. three.js는 불러오지 않습니다.
- 저장된 선택값 형식(version 1)은 바뀌지 않았습니다. 예전에 저장한 R290·R600a 값은 그대로 복원되고 R134a도 저장·복원됩니다.

### 3. 검사·문서

- `refrigerator/tests/field-calculator.mjs`에서 검사하는 항목:
  - 표 메타데이터(버전·단위·범위·냉매 목록·안전 등급)
  - 기존 CoolProp 8.0.0 표(`public/reference/cycle-table.json` R290 13점, `public/design/r600a-cycle-grid.json` R600a 14점)와 공통 온도에서 0.06 Pa 이내 일치
  - R134a 0 °C 292.8 kPa(a), 40 °C 1016.6 kPa(a)(±0.05 kPa), 25 °C 665.38 kPa(a)(CoolProp 값), 정상 비등점 약 −26.07 °C
  - 단조성, 표 점 왕복과 역함수 왕복, 보간 구간이 1 K 이하인지, 2 K 간격으로 가운데 점을 재현한 오차(0.002 K 이내)
  - 범위 밖 미외삽, R134a 통합 계산과 예전 0~30 °C 구간 계산, 예전 저장값 복원
- R134a 25 °C는 요청에 제시된 665.8 kPa와 CoolProp 665.38 kPa가 0.4 kPa(0.06 %) 다릅니다. 문헌 원본을 확인하지 못해 665.8은 단언하지 않았습니다.
- `README.md`, `refrigerator/README.md`: 냉매 목록, 데이터 출처, 재생성 방법(`public/calculator/` 데이터 절), 테스트 표 설명을 갱신했습니다.
- 이번 지시에 따라 커밋·push·브랜치 변경·PR 생성은 하지 않았습니다. 운영자가 진행합니다. AGENTS.md와 비밀·환경 파일은 열거나 고치지 않았고, npm 의존성도 바꾸지 않았습니다.

## 검증 결과

`refrigerator/`에서 최종 코드에 대해 다음 명령을 실행했고, 모두 종료 코드 0으로 통과했습니다. Node.js 버전은 v24.22.1입니다.

```bash
npm ci && npm test && npm run lint && npx tsc --noEmit && npm run build
```

- `npm test`: 10개 스크립트가 모두 통과했습니다. `npm run lint`는 경고·오류 0건이고, `npx tsc --noEmit`과 `npm run build`도 통과했습니다. 기존의 큰 청크 경고와 Vite 설정 경고는 남아 있습니다.
- `git diff --check`: 통과했습니다.
- 프로덕션 서버(`npx vinext start --hostname 127.0.0.1 --port 3102`)를 헤드리스 Chrome(360×780, 모바일·터치 에뮬레이션)으로 열어 확인했습니다.
  - R134a 선택 시 안전 안내가 표시되었고, 범위는 −40~70 °C(−50 ~ 2016 kPa(g))였습니다. 0.915268 MPa(g)·액관 35 °C를 넣으면 포화 40.0 °C, 과냉도 5.0 K가 나왔습니다.
  - 0~30 °C 값: 387 kPa(g) → 15.0 °C, 역계산 15 °C → 387 kPa(g)·488.4 kPa(a). 페이지에 "넓은 간격" 문구가 없습니다.
  - 범위 밖: 3000 kPa(g)는 한계(2016 kPa(g) = 70 °C)를 표시했고, 역계산 75 °C는 범위 밖으로 안내했습니다.
  - `innerWidth=scrollWidth=360`이었고, 44px보다 작은 버튼·라디오·입력·메뉴 링크는 없었습니다. three.js 스크립트도 불러오지 않았습니다.
  - 새로고침 후 R134a·액관·kPa가 복원되었고, 예전 형식으로 저장한 R600a·흡입·bar도 복원되었습니다.
  - 콘솔에는 기존 문제인 `/_next/static/chunks/style-B64nAGKN.js` 404와 `favicon.ico` 404만 있었습니다.
- 검사 스크립트·스크린샷·로그·venv는 `/tmp/sat-*`에만 두었습니다.

## 남은 일

- 이번 요청 범위의 구현·검증은 끝났습니다. 운영자가 변경을 검토하고 커밋·push·PR을 처리하면 됩니다.
- 후속 후보: 제조사 서비스 데이터(기기별 정상 압력·과열도·과냉도 범위)를 저작권 문제 없이 근거로 쓸 수 있게 되면 높음·정상·낮음 판정을 추가할 수 있습니다. 그 전에는 판정하지 않습니다.
- 후속 후보: 혼합 냉매(R404A·R407C 등)를 넣으려면 기포점·이슬점 열을 따로 만들고, 측정 위치별로 어느 쪽을 쓰는지(흡입 → 이슬점, 액관 → 기포점) 화면과 테스트에 반영해야 합니다.
- 후속 후보: R134a 25 °C 공개값(665.8 kPa로 제시됨)을 NIST·ASHRAE 원문으로 확인합니다. CoolProp 값은 665.38 kPa입니다.
- 후속 후보: `style-*.js` 404(기존 문제)의 원인을 vinext 빌드 쪽에서 확인합니다. `favicon.ico` 404도 같은 기회에 정리할 수 있습니다.
- 후속 후보: `/reference`의 실제 3D 배관에 시나리오별 선택·강조 상태를 전달하는 방식을 검토할 수 있습니다. 현재는 기존 2D 위치 안내와 3D 배관 화면 이동을 유지합니다.
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
