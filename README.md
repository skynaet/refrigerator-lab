# Refrigerator Lab

업소용 냉장고를 브라우저에서 3D로 설계하고 살펴보는 웹앱입니다. 형태와 치수만 넣으면 부품 배치와 냉매 배관을 자동으로 만들고 간섭을 검사하며, 도면·부품 카탈로그·CAD 파일로 다듬을 수 있습니다. 실제 제품 재구성(HR24B, T-19-HC)과 냉동 사이클 시뮬레이션도 들어 있습니다.

**사이트:** https://skynaet.github.io/refrigerator-lab/

## 화면

| 경로 | 모델 | 내용 |
|---|---|---|
| `/` | **Hoshizaki HR24B** | 제조사 서비스 매뉴얼의 부품 배치와 냉매 회로 순서를 따른 3D 재구성. 밀폐형 압축기, 와이어-온-튜브 응축기, 드라이어, 모세관 코일, 핀-튜브 증발기, 둘레 액관까지 모든 배관을 연결했고, 운전 표시를 켜면 냉매 흐름과 증발기 팬이 움직입니다. |
| `/reference` | **True T-19-HC** | 제조사 사양서 치수로 만든 외형 모델과, 40개 운전점의 R290 냉동 사이클(P-h 선도), 24시간 냉각 실험. |
| `/models` | **사양서 기반 모델** | 냉장고 사양서(JSON)만으로 3D 모델과 냉매 배관을 자동 생성하고 검사한 결과. HR24B와 T-19-HC 두 형태를 같은 생성기로 만듭니다. |
| `/new` | **새로 만들기** | 형태(언더카운터·후면 응축기 / 리치인·하부 응축 유닛 / 리치인·상부 응축 유닛 / 리치인 2도어)를 고르고 외형 치수만 넣으면 부품 배치와 냉매 배관을 자동으로 만들고 검사합니다. 결과는 편집기로 넘겨 다듬을 수 있습니다. |
| `/editor` | **사양서 편집기** | 브라우저에서 사양서 값을 고치면 바로 3D를 다시 만들고 검사합니다. 도면(그림·PDF)을 배경에 깔고 부품을 도면 위치로 끌어 놓을 수도 있습니다. 압축기는 데이터시트 기반 카탈로그에서 고를 수 있고, STEP·IGES·STL·OBJ CAD 파일을 부품으로 가져와 배관을 연결할 수 있습니다. 작업은 브라우저에 자동 저장되고, JSON·OBJ 파일로 내려받을 수 있습니다. 서버로 보내는 데이터는 없습니다. |
| `/diagnose` | **냉매 회로 고장 진단 연습** | 모세관 방식의 대표 고장 6가지를 운전 경향과 관찰 단서로 판단하는 휴대폰용 연습. 정답 해설과 점수를 제공합니다. |
| `/lab` | **MONO 120** | 120L 가상 설계. 가상 제어기, 문 개방·고장·정전 시험, 배선 하네스와 I/O 참조 기판. |

## 사용하기

설치할 필요 없이 **https://skynaet.github.io/refrigerator-lab/** 에 접속하면 됩니다. PC 브라우저(Chrome, Edge 등)를 권장합니다.

## 직접 실행 (개발용)

코드를 수정하거나 내 PC에서 돌리려면 Git과 Node.js 22.13 이상이 필요합니다.

```bash
git clone https://github.com/skynaet/refrigerator-lab.git
cd refrigerator-lab/refrigerator
npm install
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. Windows에서는 `npm install` 후 저장소 폴더의 `Start-MONO120.cmd`를 더블클릭해도 됩니다.

검사: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`

## 구성

```
refrigerator/
├─ app/            화면 (hr24, new, models, editor, reference, lab, diagnose)
├─ components/     3D 장면, 냉매 회로도
├─ generator/      사양서 → 3D 모델·배관 생성기와 자동 검사
├─ specs/          냉장고 사양서 (JSON) 와 양식 설명
├─ lib/            시뮬레이션 계산, CAD·저장소 보조 코드
├─ public/         3D 모델·배관·물성표 데이터와 생성 스크립트
└─ tests/          계산·모델 검증
.github/workflows/ GitHub Pages 자동 배포
```

모델별 근거, 가정, 한계, 데이터 재생성 방법은 [refrigerator/README.md](refrigerator/README.md)에 있습니다.

## 주의

- 3D 모델은 공개 도면과 일반 부품 치수를 바탕으로 한 **재구성**이며, 제조사 원본 CAD나 실측값이 아닙니다.
- 시뮬레이션 결과는 가정 모델에서 나온 값이며, 제품 성능이나 에너지 등급이 아닙니다.
- 제조사 매뉴얼과 사양서는 저작권 때문에 저장소에 포함하지 않았습니다. 화면에서는 제조사 원본 링크를 안내합니다.
- Hoshizaki, True는 각 회사의 상표이며, 이 프로젝트는 해당 회사와 관련이 없습니다.

## 라이선스

[MIT](LICENSE). 제조사 문서와 상표에는 적용되지 않습니다. 함께 쓰는 라이브러리 중 occt-import-js(OpenCascade)는 LGPL-2.1, pdf.js는 Apache-2.0입니다.
