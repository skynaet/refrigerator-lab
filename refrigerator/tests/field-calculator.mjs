import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ATMOSPHERE_RANGE_KPA, DEFAULT_CALCULATOR_PREFS, PRESSURE_UNITS, REFRIGERANTS, REFRIGERANT_IDS, SATURATION_LIBRARY, STANDARD_ATMOSPHERE_KPA,
  absoluteKPaToGauge, calculateField, gaugeToAbsoluteKPa, parseCalculatorPrefs, parseDecimal,
  saturationPressureKPa, saturationTemperatureC, serializeCalculatorPrefs, subcoolingK, superheatK, toggleSign,
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
assert.deepEqual(table.fluids.map(f => f.id), ['R290', 'R600a', 'R134a'], '단일 성분 냉매만(혼합 냉매 없음)');
assert.deepEqual(REFRIGERANT_IDS, ['R290', 'R600a', 'R134a']);
const expectedSafety = {R290: 'A3', R600a: 'A3', R134a: 'A1'};
for (const fluid of table.fluids) {
  assert.equal(fluid.pressurePa.length, 111, `${fluid.id}: −40…70 °C 1 K 간격`);
  assert.equal(fluid.ashraeSafetyGroup, expectedSafety[fluid.id]);
  assert.equal(REFRIGERANTS[fluid.id].safetyGroup, expectedSafety[fluid.id]);
  assert.ok(fluid.criticalTemperatureC > 80, `${fluid.id}: 표 상한이 임계온도보다 충분히 낮음`);
  assert.ok(fluid.maxInterpolationErrorK < 0.05, `${fluid.id}: 생성 시 기록한 보간 오차 ${fluid.maxInterpolationErrorK} K`);
  REFRIGERANTS[fluid.id].points.forEach(([t, p], i) => {
    assert.equal(t, -40 + i, `${fluid.id}: ${i}번 온도`);
    close(p * 1000, fluid.pressurePa[i], 1e-6, `${fluid.id} ${t}°C kPa 변환`);
  });
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

for (const id of REFRIGERANT_IDS) {
  const {points} = REFRIGERANTS[id];

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

  // 7. 보간 정확도: 표 점 하나를 건너뛰어(2 K 간격) 가운데 점을 재현한다. 1 K 간격 오차는 이보다 작다.
  for (let i = 1; i < points.length - 1; i++) {
    const [t, p] = points[i];
    close(saturationTemperatureC([points[i - 1], points[i + 1]], p).value, t, 0.002, `${id}: 2 K 간격으로 ${t}°C 재현`);
  }

  // 8. 범위 밖은 외삽하지 않는다.
  const [minT, minP] = points[0];
  const [maxT, maxP] = points.at(-1);
  assert.equal(minT, -40);
  assert.equal(maxT, 70);
  assert.deepEqual(saturationTemperatureC(points, minP - 0.001), {status: 'below', limit: minP});
  assert.deepEqual(saturationTemperatureC(points, maxP + 0.001), {status: 'above', limit: maxP});
  assert.deepEqual(saturationPressureKPa(points, minT - 0.1), {status: 'below', limit: minT});
  assert.deepEqual(saturationPressureKPa(points, maxT + 0.1), {status: 'above', limit: maxT});
  assert.equal(saturationTemperatureC(points, NaN).status, 'below');
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
close(r290Suction.saturation.value, 0, 1e-6, 'R290 흡입 포화온도');
close(r290Suction.differenceK, 6, 1e-6, 'R290 과열도');
const r600aLiquid = calculateField({refrigerant: 'R600a', side: 'liquid', gauge: (tableKPa('R600a', 30) - 101.325) / 100, unit: 'bar', pipeC: 27, atmosphereKPa: 101.325});
close(r600aLiquid.saturation.value, 30, 1e-6, 'R600a 액관 포화온도');
close(r600aLiquid.differenceK, 3, 1e-6, 'R600a 과냉도');
const r134aLiquid = calculateField({refrigerant: 'R134a', side: 'liquid', gauge: (tableKPa('R134a', 40) - 101.325) / 1000, unit: 'MPa', pipeC: 35, atmosphereKPa: 101.325});
close(r134aLiquid.saturation.value, 40, 1e-6, 'R134a 액관 포화온도');
close(r134aLiquid.differenceK, 5, 1e-6, 'R134a 과냉도');
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
assert.deepEqual(parseCalculatorPrefs(JSON.stringify({version: 1, refrigerant: 'R404A', unit: 'inHg', side: 'x'})), DEFAULT_CALCULATOR_PREFS, '알 수 없는 값은 기본값');
// 이전 버전에서 저장한 값(R290·R600a, version 1)은 그대로 복원되고, R134a도 새로 저장·복원된다.
assert.deepEqual(parseCalculatorPrefs('{"version":1,"refrigerant":"R290","unit":"kPa","side":"suction"}'), {refrigerant: 'R290', unit: 'kPa', side: 'suction'});
assert.deepEqual(parseCalculatorPrefs('{"version":1,"refrigerant":"R600a","unit":"bar","side":"liquid"}'), {refrigerant: 'R600a', unit: 'bar', side: 'liquid'});
assert.deepEqual(parseCalculatorPrefs(serializeCalculatorPrefs({refrigerant: 'R134a', unit: 'psi', side: 'suction'})), {refrigerant: 'R134a', unit: 'psi', side: 'suction'});
assert.deepEqual(parseCalculatorPrefs(JSON.stringify({version: 1, refrigerant: 'toString', unit: 'bar'})), {...DEFAULT_CALCULATOR_PREFS, unit: 'bar'}, '프로토타입 키 거부');

console.log('현장 계산기 검사 통과: 생성 포화표(CoolProp 8.0.0, R290·R600a·R134a) 메타데이터와 기존 표 일치, R134a 공개값 확인, 단조성·왕복·보간 정확도, 범위 밖 미외삽, 단위·대기압 환산, 과열도·과냉도 부호, 입력 해석, 선택값 저장.');
