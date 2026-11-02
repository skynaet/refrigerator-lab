import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ATMOSPHERE_RANGE_KPA, DEFAULT_CALCULATOR_PREFS, PRESSURE_UNITS, REFRIGERANTS, REFRIGERANT_IDS, SATURATION_LIBRARY, STANDARD_ATMOSPHERE_KPA,
  absoluteKPaToGauge, calculateField, gaugeToAbsoluteKPa, measurementPoints, negativeDifferenceKind, parseCalculatorPrefs, parseDecimal,
  saturationPressureKPa, saturationPressuresKPa, saturationTemperatureC, serializeCalculatorPrefs, subcoolingK, superheatK, toggleSign,
} from '../lib/field-calculator.ts';
import {FIELD_CALCULATOR_KEY} from '../lib/storage-keys.ts';

const close = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected} (±${tolerance})`);
const json = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));

// 1. 생성 포화표의 메타데이터·형식
const table = json('../public/calculator/saturation-table.json');
assert.equal(table.library, 'CoolProp 8.0.0', 'CoolProp 버전 고정');
assert.equal(SATURATION_LIBRARY, table.library);
assert.equal(table.generator, 'public/calculator/generate_saturation.py');
assert.ok(fs.existsSync(new URL('../public/calculator/generate_saturation.py', import.meta.url)), '생성 스크립트 커밋');
assert.match(table.generated, /^\d{4}-\d{2}-\d{2}$/);
assert.match(table.units.pressure, /^Pa absolute/);
assert.match(table.units.temperature, /^degC/);
assert.deepEqual(table.temperatureC, {min: -40, max: 70, step: 1});
const expectedIds = ['R290', 'R600a', 'R134a', 'R32', 'R22', 'R410A', 'R404A', 'R407C'];
const pureIds = ['R290', 'R600a', 'R134a', 'R32', 'R22'];
assert.deepEqual(table.fluids.map(f => f.id), expectedIds);
assert.deepEqual(REFRIGERANT_IDS, expectedIds);
assert.deepEqual(table.excludedFluids.ids, ['R448A', 'R449A']);
assert.match(table.excludedFluids.reason, /CoolProp 8\.0\.0에 없어 제외/);
assert.match(table.blendTemperatureRule, /floor/);
assert.match(table.pureTemperatureRule, /floor/);
for (const id of table.excludedFluids.ids) assert.ok(!REFRIGERANT_IDS.includes(id), `${id}: 미지원 냉매 제외`);
// ASHRAE 34: R32 = A2L(약가연), R22 = A1
const expectedSafety = {R290: 'A3', R600a: 'A3', R134a: 'A1', R32: 'A2L', R22: 'A1', R410A: 'A1', R404A: 'A1', R407C: 'A1'};
const expectedMaxC = {R290: 70, R600a: 70, R134a: 70, R32: 70, R22: 70, R410A: 66, R404A: 67, R407C: 70};
// 새 단일 성분은 CoolProp 이름이 냉매 번호와 같다. 임계온도는 공개값(R32 약 78.1 °C, R22 약 96.1 °C)과 맞아야 한다.
for (const [id, criticalC] of [['R32', 78.1], ['R22', 96.1]]) {
  const fluid = table.fluids.find(f => f.id === id);
  assert.equal(fluid.coolPropName, id);
  close(fluid.criticalTemperatureC, criticalC, 0.1, `${id} 임계온도`);
}
// 단일 성분은 이전 points API 유지, 혼합 냉매는 두 열을 명시한다.
const columns = data => data.kind === 'pure' ? {pressurePa: data.points}
  : {bubblePressurePa: data.bubblePoints, dewPressurePa: data.dewPoints};
for (const fluid of table.fluids) {
  const data = REFRIGERANTS[fluid.id];
  const pure = pureIds.includes(fluid.id);
  assert.equal(fluid.kind, pure ? 'pure' : 'blend');
  assert.equal(data.kind, fluid.kind);
  assert.deepEqual(fluid.temperatureC, {min: -40, max: expectedMaxC[fluid.id], step: 1});
  assert.deepEqual(data.temperatureC, fluid.temperatureC);
  assert.equal(fluid.ashraeSafetyGroup, expectedSafety[fluid.id]);
  assert.equal(data.safetyGroup, expectedSafety[fluid.id]);
  // 단일 성분·혼합 모두 같은 범위 규칙과 임계 여유(R32는 약 8 K, 나머지 단일 성분은 기존처럼 10 K 넘게)
  assert.equal(fluid.temperatureC.max, Math.min(70, Math.floor(fluid.criticalTemperatureC - 5)));
  assert.ok(fluid.criticalTemperatureC - fluid.temperatureC.max >= 5, `${fluid.id}: 임계 여유 5 K 이상`);
  if (pure) {
    assert.equal(Object.hasOwn(fluid, 'bubblePressurePa'), false);
    assert.equal(Object.hasOwn(fluid, 'dewPressurePa'), false);
  } else {
    assert.equal(fluid.coolPropName, fluid.id);
    assert.equal(fluid.model, 'Lemmon pseudo-pure');
    assert.equal(Object.hasOwn(fluid, 'pressurePa'), false, '혼합 냉매를 단일 열로 표현하지 않음');
    fluid.bubblePressurePa.forEach((p, i) => {
      assert.ok(p >= fluid.dewPressurePa[i], `${fluid.id}: 기포점 ≥ 이슬점`);
      assert.ok(p > fluid.dewPressurePa[i], `${fluid.id}: 지오트로픽·R410A 근사 공비도 실제 > 확인`);
    });
    assert.equal(fluid.maxInterpolationErrorK, Math.max(...Object.values(fluid.interpolationErrorK)));
  }
  assert.ok(fluid.maxInterpolationErrorK < 0.05, `${fluid.id}: 보간 오차 < 0.05 K`);
  for (const [column, points] of Object.entries(columns(data))) {
    assert.equal(fluid[column].length, expectedMaxC[fluid.id] + 41, `${fluid.id} ${column}: 냉매별 길이`);
    assert.equal(points.length, fluid[column].length);
    if (!pure) assert.ok(fluid.interpolationErrorK[column] < 0.05, `${fluid.id} ${column}: 열별 보간 오차`);
    points.forEach(([t, p], i) => {
      assert.equal(t, -40 + i, `${fluid.id}: ${i}번 온도`);
      close(p * 1000, fluid[column][i], 1e-6, `${fluid.id} ${column} ${t}°C kPa 변환`);
    });
  }
}

// 2. 생성 표 ↔ 저장소의 기존 CoolProp 8.0.0 표: 공통 온도에서 일치(생성 표는 0.1 Pa 반올림이라 0.05 Pa + 여유)
function tablePoints(rows, low, high) {
  const map = new Map();
  for (const row of rows) {
    map.set(row[low[0]], row[low[1]]);
    map.set(row[high[0]], row[high[1]]);
  }
  return [...map].sort((a, b) => a[0] - b[0]);
}
const r290Table = json('../public/reference/cycle-table.json');
assert.equal(r290Table.refrigerant, 'R290');
assert.equal(r290Table.library, 'CoolProp 8.0.0');
const r600aGrid = json('../public/design/r600a-cycle-grid.json');
assert.equal(r600aGrid.fluid, 'R600a');
assert.equal(r600aGrid.version, '8.0.0');
const crossChecks = {
  R290: tablePoints(r290Table.points, ['te', 'pLowPa'], ['tc', 'pHighPa']),
  R600a: tablePoints(r600aGrid.rows, ['evaporatingC', 'pLowPa'], ['condensingC', 'pHighPa']),
};
for (const [id, expected] of Object.entries(crossChecks)) {
  assert.ok(expected.length >= 13, `${id}: 비교 점 수`);
  for (const [t, pa] of expected) {
    const point = REFRIGERANTS[id].points.find(x => x[0] === t);
    assert.ok(point, `${id} ${t}°C 공통 온도`);
    close(point[1] * 1000, pa, 0.06, `${id} ${t}°C 기존 표와 일치(Pa)`);
  }
}

// 3. R134a 독립 확인: CoolProp 8.0.0 출력으로 직접 확인한 값만 단언한다.
//    0 °C 292.80 kPa(a), 40 °C 1016.59 kPa(a)는 작업 요청에 제시된 ASHRAE·NIST 값(292.8, 1016.6 kPa)과 맞는다.
//    25 °C는 CoolProp 665.38 kPa(a)로, 제시값 665.8 kPa와 0.4 kPa(0.06 %) 다르다. 문헌 원본을 확인하지 못해
//    665.8은 단언하지 않고 CoolProp 출력값만 검사한다.
const r134a = REFRIGERANTS.R134a.points;
for (const [t, kPa, tolerance] of [[0, 292.8, 0.05], [40, 1016.6, 0.05], [25, 665.38, 0.01]]) {
  close(saturationPressureKPa(r134a, t).value, kPa, tolerance, `R134a ${t}°C 포화압력`);
}
close(saturationTemperatureC(r134a, 292.8).value, 0, 0.005, 'R134a 292.8 kPa(a) → 0 °C');
// −26.07 °C 근처가 표준 대기압 비등점(R134a 정상 비등점 약 −26.1 °C)
close(saturationTemperatureC(r134a, 101.325).value, -26.07, 0.05, 'R134a 정상 비등점');

// 혼합 냉매 독립 확인: /tmp/sat-venv의 CoolProp 8.0.0 PropsSI 직접 출력(Pa).
// 정수 온도의 허용오차 0.06 Pa = 표 반올림 0.05 Pa + 여유 0.01 Pa.
const blendSpots = {
  R410A: [[-20, 400685.069374, 399304.643982], [0, 800705.377832, 798082.979307], [40, 2425641.795582, 2418608.527965], [60, 3842649.258555, 3834827.699371]],
  R404A: [[-20, 307103.241180, 300179.688054], [0, 610180.786964, 600273.025705], [40, 1829542.771131, 1814949.020801], [60, 2885000.077602, 2871219.422131]],
  R407C: [[-20, 279937.645232, 214712.701350], [0, 567889.809964, 460724.064362], [40, 1748864.323911, 1541186.027116], [60, 2769448.288129, 2528577.122691]],
};
for (const [id, spots] of Object.entries(blendSpots)) {
  for (const [t, bubble, dew] of spots) {
    const pair = saturationPressuresKPa(REFRIGERANTS[id], t);
    assert.deepEqual(pair.map(row => row.basis), ['bubble', 'dew']);
    pair.forEach(({pressure}, i) => {
      assert.equal(pressure.status, 'ok');
      close(pressure.value * 1000, [bubble, dew][i], 0.06, `${id} ${t}°C ${i}: 직접 압력(Pa)`);
    });
  }
}
// 보간 중간점도 PropsSI 직접값을 압력 → 온도로 바꾸어 0.001 K 이내인지 확인.
for (const [id, t, bubble, dew] of [
  ['R410A', -9.5, 584594.968317, 582635.645815],
  ['R404A', 25.5, 1271204.191967, 1257803.028682],
  ['R407C', 45.5, 1995592.506557, 1775903.264333],
]) {
  for (const [points, p] of [[REFRIGERANTS[id].bubblePoints, bubble], [REFRIGERANTS[id].dewPoints, dew]]) {
    close(saturationTemperatureC(points, p / 1000).value, t, 0.001, `${id} ${t}°C 중간점 직접값`);
  }
}

// R32·R22 독립 확인: CoolProp 8.0.0 PropsSI('P','T',T+273.15,'Q',0,id) 직접 출력(Pa).
// 정수 온도(−20·0·40·60 °C)는 ±0.06 Pa(표 반올림 0.05 Pa + 여유), 비정수 온도는 압력 → 온도 ±0.001 K.
// 값은 /tmp/sat-venv의 CoolProp 8.0.0으로 직접 뽑았다. 비어 있으면 실패한다(임의 값 금지).
const pureSpots = {
  R32: {
    integer: [[-20, 405752.612907], [0, 813101.261181], [40, 2478313.211938], [60, 3933230.524280]],
    midpoint: [[-9.5, 592805.083659], [25.5, 1712356.434412]],
  },
  R22: {
    integer: [[-20, 245312.648631], [0, 497987.891645], [40, 1533579.711603], [60, 2427487.440167]],
    midpoint: [[-9.5, 361096.254266], [25.5, 1058066.262485]],
  },
};
for (const [id, {integer, midpoint}] of Object.entries(pureSpots)) {
  assert.deepEqual(integer.map(([t]) => t), [-20, 0, 40, 60], `${id}: CoolProp 직접값 스폿 체크(−20·0·40·60 °C) 필요`);
  assert.ok(midpoint.length >= 1, `${id}: 비정수 온도 CoolProp 직접값 필요`);
  const points = REFRIGERANTS[id].points;
  for (const [t, pa] of integer) {
    const pressure = saturationPressureKPa(points, t);
    assert.equal(pressure.status, 'ok');
    close(pressure.value * 1000, pa, 0.06, `${id} ${t}°C 직접 압력(Pa)`);
  }
  for (const [t, pa] of midpoint) close(saturationTemperatureC(points, pa / 1000).value, t, 0.001, `${id} ${t}°C 중간점 직접값`);
}
// 냉매 사이의 압력 관계: R32는 R410A(기포점)보다 약간 높고, R22는 R410A(이슬점)보다 훨씬 낮다.
for (const t of [0, 40]) {
  const r32 = saturationPressureKPa(REFRIGERANTS.R32.points, t).value;
  const r410a = saturationPressureKPa(REFRIGERANTS.R410A.bubblePoints, t).value;
  assert.ok(r32 > r410a && r32 < r410a * 1.05, `${t}°C: R32가 R410A보다 약간 높음`);
}
for (const [t] of REFRIGERANTS.R410A.dewPoints) {
  assert.ok(saturationPressureKPa(REFRIGERANTS.R22.points, t).value < saturationPressureKPa(REFRIGERANTS.R410A.dewPoints, t).value, `${t}°C: R22 < R410A`);
}

for (const refrigerantId of REFRIGERANT_IDS) {
  for (const [column, points] of Object.entries(columns(REFRIGERANTS[refrigerantId]))) {
    const id = `${refrigerantId} ${column}`;

    // 4. 단조성: 온도·압력 모두 엄격히 증가
    points.forEach(([t, p], i) => {
      if (i) assert.ok(t > points[i - 1][0] && p > points[i - 1][1], `${id}: 온도·압력 오름차순`);
    });

    // 5. 표 점 왕복: 압력 → 온도, 온도 → 압력이 정확히 표 값을 돌려준다.
    for (const [t, p] of points) {
      const temperature = saturationTemperatureC(points, p);
      assert.equal(temperature.status, 'ok');
      assert.equal(temperature.value, t, `${id} ${p} kPa → ${t}°C`);
      assert.equal(Object.hasOwn(temperature, 'wideGap'), false, '넓은 간격 표시 없음');
      const pressure = saturationPressureKPa(points, t);
      assert.equal(pressure.status, 'ok');
      assert.equal(pressure.value, p, `${id} ${t}°C → ${p} kPa`);
    }

    // 6. 보간: 단조 증가, 역함수 왕복, 모든 구간이 1 K 간격(0~30 °C 공백 없음)
    for (let t = points[0][0]; t <= points.at(-1)[0]; t += 0.37) {
      const pressure = saturationPressureKPa(points, t);
      assert.equal(pressure.status, 'ok');
      assert.ok(pressure.bracketC[1] - pressure.bracketC[0] <= 1, `${id} ${t}°C 보간 구간 1 K 이하`);
      const back = saturationTemperatureC(points, pressure.value);
      close(back.value, t, 1e-9, `${id} ${t}°C 왕복`);
      const next = saturationPressureKPa(points, t + 0.2);
      if (next.status === 'ok') assert.ok(next.value > pressure.value, `${id}: 압력 단조 증가`);
    }
    const mid = saturationPressureKPa(points, 12.5);
    assert.deepEqual(mid.bracketC, [12, 13]);

    // 7. 보간 정확도: 2 K 간격으로 가운데 점 재현(단일 성분 기존 0.002 K, 혼합 0.003 K).
    // 실제 1 K 표는 위 중간점 직접값 검사와 생성기의 전 구간 검사로 검증한다.
    for (let i = 1; i < points.length - 1; i++) {
      const [t, p] = points[i];
      close(saturationTemperatureC([points[i - 1], points[i + 1]], p).value, t, REFRIGERANTS[refrigerantId].kind === 'pure' ? 0.002 : 0.003, `${id}: 2 K 간격으로 ${t}°C 재현`);
    }

    // 8. 범위 밖은 외삽하지 않는다.
    const [minT, minP] = points[0];
    const [maxT, maxP] = points.at(-1);
    assert.equal(minT, -40);
    assert.equal(maxT, expectedMaxC[refrigerantId]);
    assert.deepEqual(saturationTemperatureC(points, minP - 0.001), {status: 'below', limit: minP});
    assert.deepEqual(saturationTemperatureC(points, maxP + 0.001), {status: 'above', limit: maxP});
    assert.deepEqual(saturationPressureKPa(points, minT - 0.1), {status: 'below', limit: minT});
    assert.deepEqual(saturationPressureKPa(points, maxT + 0.1), {status: 'above', limit: maxT});
    assert.equal(saturationTemperatureC(points, NaN).status, 'below');
  }
}

// 9. 단위 환산(게이지 ↔ 절대, 표준 대기압 101.325 kPa)
assert.equal(STANDARD_ATMOSPHERE_KPA, 101.325);
close(PRESSURE_UNITS.psi.kPaPerUnit, 6.894757293168361, 1e-12, 'psi 정의');
close(gaugeToAbsoluteKPa(0, 'kPa'), 101.325, 1e-12, '0 kPa(g) = 대기압');
close(gaugeToAbsoluteKPa(1, 'MPa'), 1101.325, 1e-9, 'MPa');
close(gaugeToAbsoluteKPa(2.5, 'bar'), 351.325, 1e-9, 'bar');
close(gaugeToAbsoluteKPa(14.6959487755, 'psi'), 202.65, 1e-6, '1 atm(psi) 게이지');
close(gaugeToAbsoluteKPa(1, 'kgfcm2'), 199.3915, 1e-9, 'kgf/cm²');
close(gaugeToAbsoluteKPa(-0.5, 'bar', 90), 40, 1e-9, '진공 게이지와 사용자 대기압');
for (const unit of Object.keys(PRESSURE_UNITS)) close(absoluteKPaToGauge(gaugeToAbsoluteKPa(3.21, unit, 95), unit, 95), 3.21, 1e-12, `${unit} 왕복`);

// 10. 과열도·과냉도 부호
assert.equal(superheatK(-5, -10), 5, '흡입관이 포화온도보다 따뜻하면 과열도 양수');
assert.equal(superheatK(-12, -10), -2, '포화온도보다 낮으면 음수(측정 확인)');
assert.equal(subcoolingK(35, 40), 5, '액관이 포화온도보다 차가우면 과냉도 양수');
assert.equal(subcoolingK(45, 40), -5, '포화온도보다 뜨거우면 음수');

// 11. 통합 계산
const tableKPa = (id, t) => REFRIGERANTS[id].points.find(x => x[0] === t)[1];
const r290Suction = calculateField({refrigerant: 'R290', side: 'suction', gauge: tableKPa('R290', 0) - 101.325, unit: 'kPa', pipeC: 6, atmosphereKPa: 101.325});
assert.equal(r290Suction.status, 'ok');
assert.equal(r290Suction.basis, 'pure');
assert.equal(r290Suction.glideK, 0, '단일 성분 글라이드 0');
close(r290Suction.saturation.value, 0, 1e-6, 'R290 흡입 포화온도');
close(r290Suction.differenceK, 6, 1e-6, 'R290 과열도');
const r600aLiquid = calculateField({refrigerant: 'R600a', side: 'liquid', gauge: (tableKPa('R600a', 30) - 101.325) / 100, unit: 'bar', pipeC: 27, atmosphereKPa: 101.325});
close(r600aLiquid.saturation.value, 30, 1e-6, 'R600a 액관 포화온도');
close(r600aLiquid.differenceK, 3, 1e-6, 'R600a 과냉도');
const r134aLiquid = calculateField({refrigerant: 'R134a', side: 'liquid', gauge: (tableKPa('R134a', 40) - 101.325) / 1000, unit: 'MPa', pipeC: 35, atmosphereKPa: 101.325});
close(r134aLiquid.saturation.value, 40, 1e-6, 'R134a 액관 포화온도');
close(r134aLiquid.differenceK, 5, 1e-6, 'R134a 과냉도');
// R32·R22: 단일 성분이라 흡입·액관 모두 포화온도 기준, 글라이드 0, 음수는 측정 확인 안내.
for (const id of ['R32', 'R22']) {
  const suction = calculateField({refrigerant: id, side: 'suction', gauge: tableKPa(id, 5) - 101.325, unit: 'kPa', pipeC: 12, atmosphereKPa: 101.325});
  assert.equal(suction.status, 'ok');
  assert.equal(suction.basis, 'pure');
  assert.equal(suction.glideK, 0, `${id}: 단일 성분 글라이드 0`);
  close(suction.saturation.value, 5, 1e-6, `${id} 흡입 포화온도`);
  close(suction.differenceK, 7, 1e-6, `${id} 과열도`);
  const liquid = calculateField({refrigerant: id, side: 'liquid', gauge: (tableKPa(id, 45) - 101.325) / 1000, unit: 'MPa', pipeC: 40, atmosphereKPa: 101.325});
  close(liquid.saturation.value, 45, 1e-6, `${id} 액관 포화온도`);
  close(liquid.differenceK, 5, 1e-6, `${id} 과냉도`);
  const negative = calculateField({refrigerant: id, side: 'suction', gauge: tableKPa(id, 5) - 101.325, unit: 'kPa', pipeC: 4, atmosphereKPa: 101.325});
  assert.equal(negativeDifferenceKind(negative.differenceK, negative.basis, negative.glideK), 'measurement-error', `${id} 음수 과열도`);
  const above = calculateField({refrigerant: id, side: 'liquid', gauge: tableKPa(id, 70) + 0.001 - 101.325, unit: 'kPa', pipeC: 30, atmosphereKPa: 101.325});
  assert.equal(above.status, 'out-of-range');
  assert.equal(above.side, 'above');
  assert.equal(above.limitKPaAbs, tableKPa(id, 70));
  const reverse = saturationPressuresKPa(REFRIGERANTS[id], 70.1);
  assert.deepEqual(reverse.map(row => [row.basis, row.pressure.status]), [['pure', 'above']], `${id} 70 °C 초과 외삽 금지`);
}
// 예전 0~30 °C 공백 구간: 이제 1 K 간격 표 안에서 계산된다.
const midRange = calculateField({refrigerant: 'R290', side: 'liquid', gauge: (tableKPa('R290', 15) + tableKPa('R290', 16)) / 2 - 101.325, unit: 'kPa', pipeC: 10, atmosphereKPa: 101.325});
assert.equal(midRange.status, 'ok');
assert.deepEqual(midRange.saturation.bracketC, [15, 16]);
assert.ok(midRange.saturation.value > 15 && midRange.saturation.value < 16);
const noTemperature = calculateField({refrigerant: 'R600a', side: 'suction', gauge: -0.4, unit: 'bar', pipeC: null, atmosphereKPa: 101.325});
assert.equal(noTemperature.status, 'ok', 'R600a 진공 흡입압도 계산');
assert.equal(noTemperature.differenceK, null, '온도 없이 포화온도만');
assert.ok(noTemperature.saturation.value > -25 && noTemperature.saturation.value < -20);
assert.deepEqual(calculateField({refrigerant: 'R290', side: 'suction', gauge: null, unit: 'kPa', pipeC: 5, atmosphereKPa: 101.325}), {status: 'incomplete'});
const low = calculateField({refrigerant: 'R290', side: 'suction', gauge: 0, unit: 'psi', pipeC: null, atmosphereKPa: 101.325});
assert.equal(low.status, 'out-of-range');
assert.equal(low.side, 'below');
assert.equal(low.limitKPaAbs, REFRIGERANTS.R290.points[0][1]);
assert.equal(calculateField({refrigerant: 'R290', side: 'liquid', gauge: 400, unit: 'psi', pipeC: 30, atmosphereKPa: 101.325}).side, 'above');
for (const atmosphereKPa of [null, ATMOSPHERE_RANGE_KPA[0] - 1, ATMOSPHERE_RANGE_KPA[1] + 1]) {
  assert.deepEqual(calculateField({refrigerant: 'R290', side: 'suction', gauge: 300, unit: 'kPa', pipeC: 0, atmosphereKPa}), {status: 'invalid-atmosphere'});
}

// R407C 800 kPa(a): PropsSI('T','P',800000,'Q',0/1,'R407C') 직접값.
// 같은 압력에서 약 5.8481 K 글라이드. 열을 뒤바꾸면 과열도·과냉도가 이만큼 틀린다.
const bubbleC = 10.998521530757, dewC = 16.846642964865;
for (const side of ['suction', 'liquid']) {
  const calc = calculateField({refrigerant: 'R407C', side, gauge: 800 - 101.325, unit: 'kPa', pipeC: side === 'suction' ? 22 : 6, atmosphereKPa: 101.325});
  assert.equal(calc.status, 'ok');
  assert.equal(calc.basis, side === 'suction' ? 'dew' : 'bubble');
  close(calc.saturation.value, side === 'suction' ? dewC : bubbleC, 0.001, `R407C ${side}: 기준 온도`);
  close(calc.differenceK, side === 'suction' ? 22 - dewC : bubbleC - 6, 0.001, `R407C ${side}: 올바른 과열도·과냉도`);
  close(calc.glideK, dewC - bubbleC, 0.002, `R407C ${side}: 같은 압력의 온도 글라이드`);
}
for (const id of ['R410A', 'R404A', 'R407C']) {
  const data = REFRIGERANTS[id];
  for (const side of ['suction', 'liquid']) {
    const points = measurementPoints(data, side);
    assert.equal(points, side === 'suction' ? data.dewPoints : data.bubblePoints);
    const calcAt = p => calculateField({refrigerant: id, side, gauge: p - 101.325, unit: 'kPa', pipeC: null, atmosphereKPa: 101.325});
    const calc = calcAt(saturationPressureKPa(points, 20).value);
    assert.equal(calc.status, 'ok');
    close(calc.saturation.value, 20, 1e-9, `${id} ${side}: 20 °C`);
    assert.ok(calc.glideK > 0, `${id}: R410A의 작은 글라이드도 유지`);
    assert.equal(calc.differenceK, null);
    const below = calcAt(points[0][1] - 0.001), above = calcAt(points.at(-1)[1] + 0.001);
    assert.equal(below.status, 'out-of-range');
    assert.equal(below.side, 'below');
    assert.equal(below.limitKPaAbs, points[0][1]);
    assert.equal(above.status, 'out-of-range');
    assert.equal(above.side, 'above');
    assert.equal(above.limitKPaAbs, points.at(-1)[1]);
    // 선택한 열 끝점은 계산 가능해도 반대 열 온도는 범위 밖일 수 있다. 글라이드만 null.
    const edge = calcAt(side === 'suction' ? data.dewPoints[0][1] : data.bubblePoints.at(-1)[1]);
    assert.equal(edge.status, 'ok');
    assert.equal(edge.glideK, null, `${id} ${side}: 반대 열을 외삽해 글라이드를 만들지 않음`);
  }
  // 두 열 압력 한계 사이: 한쪽만 범위 밖이며 각 열의 범위를 독립적으로 적용한다.
  for (const [p, validSide] of [
    [(data.bubblePoints[0][1] + data.dewPoints[0][1]) / 2, 'suction'],
    [(data.bubblePoints.at(-1)[1] + data.dewPoints.at(-1)[1]) / 2, 'liquid'],
  ]) {
    for (const side of ['suction', 'liquid']) {
      const calc = calculateField({refrigerant: id, side, gauge: p - 101.325, unit: 'kPa', pipeC: 10, atmosphereKPa: 101.325});
      assert.equal(calc.status, side === validSide ? 'ok' : 'out-of-range', `${id}: ${side} 열 압력 범위`);
      if (calc.status === 'ok') assert.equal(calc.glideK, null);
    }
  }
  assert.ok(saturationPressuresKPa(data, data.temperatureC.max + 0.1).every(row => row.pressure.status === 'above'));
}
assert.ok(saturationPressuresKPa(REFRIGERANTS.R410A, 68).every(row => row.pressure.status === 'above'), 'R410A 68 °C 외삽 금지');

// 음수 과열도·과냉도 안내: 혼합 냉매는 −글라이드 이상이면 2상 가능, 그 아래는 측정 오류, 글라이드를 모르면 두 안내 모두.
assert.equal(negativeDifferenceKind(null, 'dew', 5), 'none', '온도 미입력');
for (const basis of ['pure', 'dew', 'bubble']) {
  assert.equal(negativeDifferenceKind(0, basis, basis === 'pure' ? 0 : 5), 'none', `${basis}: 0은 음수 아님`);
  assert.equal(negativeDifferenceKind(-0, basis, basis === 'pure' ? 0 : 5), 'none', `${basis}: −0은 음수 아님`);
  assert.equal(negativeDifferenceKind(3, basis, basis === 'pure' ? 0 : 5), 'none');
}
for (const basis of ['dew', 'bubble']) {
  assert.equal(negativeDifferenceKind(-0.01, basis, 5), 'possible-two-phase', `${basis}: 0 바로 아래`);
  assert.equal(negativeDifferenceKind(-5, basis, 5), 'possible-two-phase', `${basis}: −글라이드 경계 포함`);
  assert.equal(negativeDifferenceKind(-5.01, basis, 5), 'measurement-error', `${basis}: −글라이드 아래`);
  assert.equal(negativeDifferenceKind(-0.01, basis, null), 'glide-unknown', `${basis}: 글라이드 모름`);
  assert.equal(negativeDifferenceKind(-50, basis, null), 'glide-unknown', `${basis}: 글라이드 모르면 크게 음수여도 두 안내`);
  assert.equal(negativeDifferenceKind(0, basis, null), 'none');
}
// 단일 성분은 글라이드 0이라 0 미만은 모두 측정 오류 안내(기존 동작).
assert.equal(negativeDifferenceKind(-0.01, 'pure', 0), 'measurement-error');
assert.equal(negativeDifferenceKind(-10, 'pure', 0), 'measurement-error');
// 통합: R407C 800 kPa(a)에서 배관 온도가 기포점~이슬점 사이이면 2상 가능, 밖이면 측정 오류.
for (const [side, pipeC, kind] of [
  ['suction', (bubbleC + dewC) / 2, 'possible-two-phase'], ['suction', bubbleC - 0.1, 'measurement-error'],
  ['liquid', (bubbleC + dewC) / 2, 'possible-two-phase'], ['liquid', dewC + 0.1, 'measurement-error'],
]) {
  const calc = calculateField({refrigerant: 'R407C', side, gauge: 800 - 101.325, unit: 'kPa', pipeC, atmosphereKPa: 101.325});
  assert.ok(calc.differenceK < 0);
  assert.equal(negativeDifferenceKind(calc.differenceK, calc.basis, calc.glideK), kind, `R407C ${side} ${pipeC}°C`);
}
const r290Negative = calculateField({refrigerant: 'R290', side: 'suction', gauge: tableKPa('R290', 0) - 101.325, unit: 'kPa', pipeC: -0.5, atmosphereKPa: 101.325});
assert.equal(negativeDifferenceKind(r290Negative.differenceK, r290Negative.basis, r290Negative.glideK), 'measurement-error', 'R290 음수 과열도');
assert.equal(saturationPressuresKPa(REFRIGERANTS.R290, 0)[0].basis, 'pure', '단일 성분 역계산은 한 압력');

// 12. 휴대폰 입력 해석
assert.equal(parseDecimal('3.5'), 3.5);
assert.equal(parseDecimal(' 3,5 '), 3.5, '쉼표 소수점');
assert.equal(parseDecimal('−12.5'), -12.5, '유니코드 마이너스');
assert.equal(parseDecimal('.5'), 0.5);
assert.equal(parseDecimal('4.'), 4);
for (const bad of ['', '-', '.', 'abc', '1e3', '1.2.3', '--1', 'Infinity']) assert.equal(parseDecimal(bad), null, `잘못된 입력 ${bad}`);
assert.equal(toggleSign('12'), '-12');
assert.equal(toggleSign('-12'), '12');
assert.equal(toggleSign('−12'), '12');
assert.equal(toggleSign(''), '-');

// 13. 마지막 선택값 저장
assert.equal(FIELD_CALCULATOR_KEY, 'refrigerator-field-calculator');
const prefs = {refrigerant: 'R600a', unit: 'psi', side: 'liquid'};
assert.deepEqual(parseCalculatorPrefs(serializeCalculatorPrefs(prefs)), prefs);
for (const raw of [null, '', '{broken', '[]', 'null', JSON.stringify({version: 2, ...prefs})]) assert.deepEqual(parseCalculatorPrefs(raw), DEFAULT_CALCULATOR_PREFS);
assert.deepEqual(parseCalculatorPrefs(JSON.stringify({version: 1, refrigerant: 'R999', unit: 'inHg', side: 'x'})), DEFAULT_CALCULATOR_PREFS, '알 수 없는 값은 기본값');
// 이전 단일 성분 저장값(version 1)을 모두 복원하고, 새 혼합 냉매도 같은 형식으로 저장·복원한다.
assert.deepEqual(parseCalculatorPrefs('{"version":1,"refrigerant":"R290","unit":"kPa","side":"suction"}'), {refrigerant: 'R290', unit: 'kPa', side: 'suction'});
assert.deepEqual(parseCalculatorPrefs('{"version":1,"refrigerant":"R600a","unit":"bar","side":"liquid"}'), {refrigerant: 'R600a', unit: 'bar', side: 'liquid'});
assert.deepEqual(parseCalculatorPrefs(serializeCalculatorPrefs({refrigerant: 'R134a', unit: 'psi', side: 'suction'})), {refrigerant: 'R134a', unit: 'psi', side: 'suction'});
assert.deepEqual(parseCalculatorPrefs(JSON.stringify({version: 1, refrigerant: 'toString', unit: 'bar'})), {...DEFAULT_CALCULATOR_PREFS, unit: 'bar'}, '프로토타입 키 거부');

assert.deepEqual(parseCalculatorPrefs('{"version":1,"refrigerant":"R134a","unit":"MPa","side":"liquid"}'), {refrigerant: 'R134a', unit: 'MPa', side: 'liquid'});
for (const refrigerant of ['R32', 'R22', 'R410A', 'R404A', 'R407C']) {
  for (const side of ['suction', 'liquid']) {
    const prefs = {refrigerant, unit: 'bar', side};
    assert.equal(JSON.parse(serializeCalculatorPrefs(prefs)).version, 1);
    assert.deepEqual(parseCalculatorPrefs(serializeCalculatorPrefs(prefs)), prefs);
  }
}
assert.deepEqual(parseCalculatorPrefs('{"version":1,"refrigerant":"R448A","unit":"bar","side":"liquid"}'), {...DEFAULT_CALCULATOR_PREFS, unit: 'bar', side: 'liquid'});
// 새 냉매를 손으로 쓴 version 1 저장값도 복원하고, 소문자 등 다른 표기는 기본값으로 둔다.
assert.deepEqual(parseCalculatorPrefs('{"version":1,"refrigerant":"R32","unit":"kgfcm2","side":"liquid"}'), {refrigerant: 'R32', unit: 'kgfcm2', side: 'liquid'});
assert.deepEqual(parseCalculatorPrefs('{"version":1,"refrigerant":"R22","unit":"psi","side":"suction"}'), {refrigerant: 'R22', unit: 'psi', side: 'suction'});
assert.deepEqual(parseCalculatorPrefs('{"version":1,"refrigerant":"r32","unit":"bar","side":"suction"}'), {...DEFAULT_CALCULATOR_PREFS, unit: 'bar'});

console.log('현장 계산기 검사 통과: 생성 포화표(CoolProp 8.0.0, R290·R600a·R134a·R32·R22·R410A·R404A·R407C) 메타데이터와 기존 표 일치, R134a 공개값 확인, 단조성·왕복·보간 정확도, 범위 밖 미외삽, 단위·대기압 환산, 과열도·과냉도 부호와 기포점·이슬점 기준·글라이드, 음수 안내 경계, 입력 해석, 선택값 저장.');
