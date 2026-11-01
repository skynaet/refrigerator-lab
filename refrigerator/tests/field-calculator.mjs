import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ATMOSPHERE_RANGE_KPA, DEFAULT_CALCULATOR_PREFS, PRESSURE_UNITS, REFRIGERANTS, STANDARD_ATMOSPHERE_KPA,
  absoluteKPaToGauge, calculateField, gaugeToAbsoluteKPa, parseCalculatorPrefs, parseDecimal,
  saturationPressureKPa, saturationTemperatureC, serializeCalculatorPrefs, subcoolingK, superheatK, toggleSign,
} from '../lib/field-calculator.ts';
import {FIELD_CALCULATOR_KEY} from '../lib/storage-keys.ts';

const close = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected} (±${tolerance})`);
const json = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));

// 1. 내장 포화점은 저장소의 CoolProp 계산표와 같아야 한다(새 물성값을 만들지 않음).
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
const r600aGrid = json('../public/design/r600a-cycle-grid.json');
assert.equal(r600aGrid.fluid, 'R600a');
const sources = {
  R290: tablePoints(r290Table.points, ['te', 'pLowPa'], ['tc', 'pHighPa']),
  R600a: tablePoints(r600aGrid.rows, ['evaporatingC', 'pLowPa'], ['condensingC', 'pHighPa']),
};
assert.deepEqual(Object.keys(REFRIGERANTS).sort(), Object.keys(sources).sort(), '근거 자료가 있는 냉매만 포함');
for (const [id, expected] of Object.entries(sources)) {
  const {points} = REFRIGERANTS[id];
  assert.equal(points.length, expected.length, `${id}: 표 점 개수`);
  points.forEach(([t, p], i) => {
    assert.equal(t, expected[i][0], `${id}: ${i}번 온도`);
    close(p * 1000, expected[i][1], 0.5, `${id} ${t}°C 압력(Pa)`);
    if (i) assert.ok(t > points[i - 1][0] && p > points[i - 1][1], `${id}: 온도·압력 오름차순`);
  });

  // 2. 표 점 왕복: 압력 → 온도, 온도 → 압력이 정확히 표 값을 돌려준다.
  for (const [t, p] of points) {
    const temperature = saturationTemperatureC(points, p);
    assert.equal(temperature.status, 'ok');
    assert.equal(temperature.value, t, `${id} ${p} kPa → ${t}°C`);
    assert.equal(temperature.wideGap, false);
    const pressure = saturationPressureKPa(points, t);
    assert.equal(pressure.status, 'ok');
    assert.equal(pressure.value, p, `${id} ${t}°C → ${p} kPa`);
  }

  // 3. 보간: 두 점 사이 단조 증가, 역함수 왕복, 0~30 °C 넓은 간격 표시
  for (let t = points[0][0]; t <= points.at(-1)[0]; t += 0.7) {
    const pressure = saturationPressureKPa(points, t);
    assert.equal(pressure.status, 'ok');
    const back = saturationTemperatureC(points, pressure.value);
    close(back.value, t, 1e-9, `${id} ${t}°C 왕복`);
    assert.equal(pressure.wideGap, t > 0 && t < 30, `${id} ${t}°C 넓은 간격 표시`);
    const next = saturationPressureKPa(points, t + 0.35);
    if (next.status === 'ok') assert.ok(next.value > pressure.value, `${id}: 압력 단조 증가`);
  }
  const mid = saturationPressureKPa(points, -12.5);
  assert.deepEqual(mid.bracketC, [-15, -10]);
  assert.ok(mid.value > points.find(x => x[0] === -15)[1] && mid.value < points.find(x => x[0] === -10)[1]);

  // 4. 보간 정확도: 표 점 하나를 빼고 더 넓은 간격으로 보간해 다시 맞춘다.
  //    0~30 °C 공백(30 K)보다 넓은 50 K 간격(−20↔30 °C)으로 0 °C를 예측한 오차가 상한이다.
  const at = temperature => points.find(x => x[0] === temperature);
  const holdouts = [[-20, 30, 0, id === 'R290' ? 0.13 : 0.26], [0, 40, 30, 0.1], [-20, 0, -10, 0.06], [30, 60, 45, 0.04]];
  for (const [a, b, held, tolerance] of holdouts) {
    const reduced = [at(a), at(b)];
    close(saturationTemperatureC(reduced, at(held)[1]).value, held, tolerance, `${id}: ${a}↔${b}°C 보간으로 ${held}°C 재현`);
  }

  // 5. 범위 밖은 외삽하지 않는다.
  const [minT, minP] = points[0];
  const [maxT, maxP] = points.at(-1);
  assert.deepEqual(saturationTemperatureC(points, minP - 0.001), {status: 'below', limit: minP});
  assert.deepEqual(saturationTemperatureC(points, maxP + 0.001), {status: 'above', limit: maxP});
  assert.deepEqual(saturationPressureKPa(points, minT - 0.1), {status: 'below', limit: minT});
  assert.deepEqual(saturationPressureKPa(points, maxT + 0.1), {status: 'above', limit: maxT});
  assert.equal(saturationTemperatureC(points, NaN).status, 'below');
}

// 알려진 CoolProp 표 값으로 독립 확인(왕복 이외): R290 0 °C 474.458 kPa(a), R600a 30 °C 404.723 kPa(a).
close(saturationTemperatureC(REFRIGERANTS.R290.points, r290Table.points.find(p => p.te === 0).pLowPa / 1000).value, 0, 1e-3, 'R290 0°C(원본 Pa, 1 Pa 반올림 영향 0.001 K 이내)');
close(saturationPressureKPa(REFRIGERANTS.R600a.points, 30).value * 1000, r600aGrid.rows.find(r => r.condensingC === 30).pHighPa, 0.5, 'R600a 30°C');

// 6. 단위 환산(게이지 ↔ 절대, 표준 대기압 101.325 kPa)
assert.equal(STANDARD_ATMOSPHERE_KPA, 101.325);
close(PRESSURE_UNITS.psi.kPaPerUnit, 6.894757293168361, 1e-12, 'psi 정의');
close(gaugeToAbsoluteKPa(0, 'kPa'), 101.325, 1e-12, '0 kPa(g) = 대기압');
close(gaugeToAbsoluteKPa(1, 'MPa'), 1101.325, 1e-9, 'MPa');
close(gaugeToAbsoluteKPa(2.5, 'bar'), 351.325, 1e-9, 'bar');
close(gaugeToAbsoluteKPa(14.6959487755, 'psi'), 202.65, 1e-6, '1 atm(psi) 게이지');
close(gaugeToAbsoluteKPa(1, 'kgfcm2'), 199.3915, 1e-9, 'kgf/cm²');
close(gaugeToAbsoluteKPa(-0.5, 'bar', 90), 40, 1e-9, '진공 게이지와 사용자 대기압');
for (const unit of Object.keys(PRESSURE_UNITS)) close(absoluteKPaToGauge(gaugeToAbsoluteKPa(3.21, unit, 95), unit, 95), 3.21, 1e-12, `${unit} 왕복`);

// 7. 과열도·과냉도 부호
assert.equal(superheatK(-5, -10), 5, '흡입관이 포화온도보다 따뜻하면 과열도 양수');
assert.equal(superheatK(-12, -10), -2, '포화온도보다 낮으면 음수(측정 확인)');
assert.equal(subcoolingK(35, 40), 5, '액관이 포화온도보다 차가우면 과냉도 양수');
assert.equal(subcoolingK(45, 40), -5, '포화온도보다 뜨거우면 음수');

// 8. 통합 계산
const r290Suction = calculateField({refrigerant: 'R290', side: 'suction', gauge: (474.458 - 101.325), unit: 'kPa', pipeC: 6, atmosphereKPa: 101.325});
assert.equal(r290Suction.status, 'ok');
close(r290Suction.saturation.value, 0, 1e-6, 'R290 흡입 포화온도');
close(r290Suction.differenceK, 6, 1e-6, 'R290 과열도');
const r600aLiquid = calculateField({refrigerant: 'R600a', side: 'liquid', gauge: (404.723 - 101.325) / 100, unit: 'bar', pipeC: 27, atmosphereKPa: 101.325});
close(r600aLiquid.saturation.value, 30, 1e-6, 'R600a 액관 포화온도');
close(r600aLiquid.differenceK, 3, 1e-6, 'R600a 과냉도');
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

// 9. 휴대폰 입력 해석
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

// 10. 마지막 선택값 저장
assert.equal(FIELD_CALCULATOR_KEY, 'refrigerator-field-calculator');
const prefs = {refrigerant: 'R600a', unit: 'psi', side: 'liquid'};
assert.deepEqual(parseCalculatorPrefs(serializeCalculatorPrefs(prefs)), prefs);
for (const raw of [null, '', '{broken', '[]', 'null', JSON.stringify({version: 2, ...prefs})]) assert.deepEqual(parseCalculatorPrefs(raw), DEFAULT_CALCULATOR_PREFS);
assert.deepEqual(parseCalculatorPrefs(JSON.stringify({version: 1, refrigerant: 'R134a', unit: 'inHg', side: 'x'})), DEFAULT_CALCULATOR_PREFS, '알 수 없는 값은 기본값');
assert.deepEqual(parseCalculatorPrefs(JSON.stringify({version: 1, refrigerant: 'toString', unit: 'bar'})), {...DEFAULT_CALCULATOR_PREFS, unit: 'bar'}, '프로토타입 키 거부');

console.log('현장 계산기 검사 통과: R290·R600a 포화점의 원본 표 일치, 표 점 왕복·보간·넓은 간격 정확도, 범위 밖 미외삽, 단위·대기압 환산, 과열도·과냉도 부호, 입력 해석, 선택값 저장.');
