// 현장 과열도·과냉도 계산기의 순수 계산 모듈 (화면·저장소와 무관).
//
// 포화 데이터 출처: public/calculator/saturation-table.json
// - public/calculator/generate_saturation.py가 CoolProp 8.0.0의 PropsSI('P','T',T,'Q',0,fluid)로 만든다.
//   −40…70 °C, 1 K 간격, 절대압 Pa(0.1 Pa 반올림). R290·R600a·R134a는 단일 성분이라 기포점(Q=0)과
//   이슬점(Q=1) 압력이 같다(생성 스크립트가 확인). 혼합 냉매(R404A 등)는 넣지 않았다.
// - tests/field-calculator.mjs가 저장소의 기존 CoolProp 표(public/reference/cycle-table.json,
//   public/design/r600a-cycle-grid.json)와 공통 온도에서 일치하는지 검사한다.
//
// 표 점 사이는 ln(P)와 1/T(K)를 선형 보간한다(클라우지우스-클라페이롱 형태). 1 K 간격에서 CoolProp 직접 계산과의
// 최대 오차는 0.0002 K 수준이다(생성 스크립트가 기록·검사). 표 범위 밖은 외삽하지 않고 범위 밖으로 표시한다.
import saturationTable from '../public/calculator/saturation-table.json' with {type: 'json'};

export type RefrigerantId = 'R290' | 'R600a' | 'R134a';
/** [포화온도 °C, 절대 포화압력 kPa(a)] — 온도 오름차순 */
export type SaturationPoint = readonly [temperatureC: number, pressureKPaAbs: number];
export type RefrigerantData = {
  readonly id: RefrigerantId;
  readonly label: string;
  /** ASHRAE 34 안전 등급 (A1 불연, A3 고가연) */
  readonly safetyGroup: string;
  readonly points: readonly SaturationPoint[];
  readonly source: string;
};

export const SATURATION_TABLE_PATH = 'public/calculator/saturation-table.json';
export const SATURATION_LIBRARY = saturationTable.library;
const REFRIGERANT_ORDER: readonly RefrigerantId[] = ['R290', 'R600a', 'R134a'];

function buildRefrigerants(): Record<RefrigerantId, RefrigerantData> {
  const {min, step} = saturationTable.temperatureC;
  const result: Partial<Record<RefrigerantId, RefrigerantData>> = {};
  for (const id of REFRIGERANT_ORDER) {
    const fluid = saturationTable.fluids.find(item => item.id === id);
    if (!fluid) throw new Error(`포화표에 ${id}가 없습니다`);
    const points = fluid.pressurePa.map((pa, i): SaturationPoint => [min + i * step, pa / 1000]);
    result[id] = {id, label: fluid.label, safetyGroup: fluid.ashraeSafetyGroup, points, source: `${SATURATION_TABLE_PATH} · ${saturationTable.library}`};
  }
  return result as Record<RefrigerantId, RefrigerantData>;
}

export const REFRIGERANTS: Readonly<Record<RefrigerantId, RefrigerantData>> = buildRefrigerants();
export const REFRIGERANT_IDS = Object.keys(REFRIGERANTS) as RefrigerantId[];

/** 표준 대기압 (ISO 2533, 101.325 kPa). 게이지압 = 절대압 − 대기압. */
export const STANDARD_ATMOSPHERE_KPA = 101.325;
// 대기압 입력의 허용 범위: 해발 약 5,000 m(≈54 kPa)부터 해수면 고기압(≈108 kPa)을 넉넉히 포함한다.
export const ATMOSPHERE_RANGE_KPA = [50, 110] as const;

// 모두 정의상 정확한 환산 계수다.
// psi = 0.45359237 kg × 9.80665 m/s² / (0.0254 m)², kgf/cm² = 9.80665 N / 1 cm².
export const PRESSURE_UNITS = {
  kPa: {label: 'kPa(g)', kPaPerUnit: 1, digits: 0},
  MPa: {label: 'MPa(g)', kPaPerUnit: 1000, digits: 3},
  bar: {label: 'bar(g)', kPaPerUnit: 100, digits: 2},
  psi: {label: 'psig', kPaPerUnit: 0.45359237 * 9.80665 / 0.0254 ** 2 / 1000, digits: 1},
  kgfcm2: {label: 'kgf/cm²(g)', kPaPerUnit: 98.0665, digits: 2},
} as const;
export type PressureUnit = keyof typeof PRESSURE_UNITS;
export const PRESSURE_UNIT_IDS = Object.keys(PRESSURE_UNITS) as PressureUnit[];

export function gaugeToAbsoluteKPa(gauge: number, unit: PressureUnit, atmosphereKPa = STANDARD_ATMOSPHERE_KPA): number {
  return gauge * PRESSURE_UNITS[unit].kPaPerUnit + atmosphereKPa;
}
export function absoluteKPaToGauge(absoluteKPa: number, unit: PressureUnit, atmosphereKPa = STANDARD_ATMOSPHERE_KPA): number {
  return (absoluteKPa - atmosphereKPa) / PRESSURE_UNITS[unit].kPaPerUnit;
}

/** 휴대폰 입력을 숫자로 바꾼다. 쉼표 소수점과 유니코드 마이너스(−)를 받는다. 해석할 수 없으면 null. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(/[−–]/g, '-').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
/** 부호 바꾸기 버튼용. iOS의 소수 키패드에는 마이너스 키가 없다. */
export function toggleSign(text: string): string {
  const trimmed = text.trim();
  if (/^[-−–]/.test(trimmed)) return trimmed.slice(1);
  return `-${trimmed.replace(/^\+/, '')}`;
}

export type InterpolationResult =
  | {
      readonly status: 'ok';
      readonly value: number;
      /** 보간에 쓴 두 표 점의 온도(°C). 표 점과 같으면 두 값이 같다. */
      readonly bracketC: readonly [number, number];
    }
  | {readonly status: 'below' | 'above'; readonly limit: number};

const KELVIN = 273.15;
const invT = (temperatureC: number) => 1 / (temperatureC + KELVIN);

function bracket(points: readonly SaturationPoint[], key: (point: SaturationPoint) => number, x: number): InterpolationResult | number {
  const first = key(points[0]);
  const last = key(points[points.length - 1]);
  if (Number.isNaN(x)) return {status: 'below', limit: first};
  if (x < first) return {status: 'below', limit: first};
  if (x > last) return {status: 'above', limit: last};
  let i = 0;
  while (i < points.length - 2 && x > key(points[i + 1])) i++;
  return i;
}

/** 절대압력(kPa) → 포화온도(°C). 표 범위 밖이면 외삽하지 않고 범위 밖으로 돌려준다. */
export function saturationTemperatureC(points: readonly SaturationPoint[], pressureKPaAbs: number): InterpolationResult {
  const found = bracket(points, point => point[1], pressureKPaAbs);
  if (typeof found !== 'number') return found;
  const [[t1, p1], [t2, p2]] = [points[found], points[found + 1]];
  if (pressureKPaAbs === p1) return {status: 'ok', value: t1, bracketC: [t1, t1]};
  if (pressureKPaAbs === p2) return {status: 'ok', value: t2, bracketC: [t2, t2]};
  const f = (Math.log(pressureKPaAbs) - Math.log(p1)) / (Math.log(p2) - Math.log(p1));
  const value = 1 / (invT(t1) + f * (invT(t2) - invT(t1))) - KELVIN;
  return {status: 'ok', value, bracketC: [t1, t2]};
}

/** 포화온도(°C) → 절대 포화압력(kPa). 표 범위 밖이면 외삽하지 않고 범위 밖으로 돌려준다. */
export function saturationPressureKPa(points: readonly SaturationPoint[], temperatureC: number): InterpolationResult {
  const found = bracket(points, point => point[0], temperatureC);
  if (typeof found !== 'number') return found;
  const [[t1, p1], [t2, p2]] = [points[found], points[found + 1]];
  if (temperatureC === t1) return {status: 'ok', value: p1, bracketC: [t1, t1]};
  if (temperatureC === t2) return {status: 'ok', value: p2, bracketC: [t2, t2]};
  const f = (invT(temperatureC) - invT(t1)) / (invT(t2) - invT(t1));
  const value = Math.exp(Math.log(p1) + f * (Math.log(p2) - Math.log(p1)));
  return {status: 'ok', value, bracketC: [t1, t2]};
}

/** 저압(흡입)측: 과열도 = 배관 온도 − 포화온도 */
export const superheatK = (pipeC: number, saturationC: number) => pipeC - saturationC;
/** 고압(액관)측: 과냉도 = 포화온도 − 배관 온도 */
export const subcoolingK = (pipeC: number, saturationC: number) => saturationC - pipeC;

export type MeasurementSide = 'suction' | 'liquid';
export const MEASUREMENT_SIDES: Readonly<Record<MeasurementSide, {label: string; quantity: string}>> = {
  suction: {label: '저압 · 흡입관', quantity: '과열도'},
  liquid: {label: '고압 · 액관', quantity: '과냉도'},
};

export type FieldCalculation =
  | {readonly status: 'incomplete'}
  | {readonly status: 'invalid-atmosphere'}
  | {readonly status: 'out-of-range'; readonly side: 'below' | 'above'; readonly pressureKPaAbs: number; readonly limitKPaAbs: number}
  | {
      readonly status: 'ok';
      readonly pressureKPaAbs: number;
      readonly saturation: Extract<InterpolationResult, {status: 'ok'}>;
      /** 온도를 입력하지 않았으면 null */
      readonly differenceK: number | null;
    };

/** 측정 게이지압과 배관 온도로 포화온도와 과열도(흡입) 또는 과냉도(액관)를 계산한다. */
export function calculateField(input: {
  readonly refrigerant: RefrigerantId;
  readonly side: MeasurementSide;
  readonly gauge: number | null;
  readonly unit: PressureUnit;
  readonly pipeC: number | null;
  readonly atmosphereKPa: number | null;
}): FieldCalculation {
  const {atmosphereKPa} = input;
  if (atmosphereKPa === null || atmosphereKPa < ATMOSPHERE_RANGE_KPA[0] || atmosphereKPa > ATMOSPHERE_RANGE_KPA[1]) return {status: 'invalid-atmosphere'};
  if (input.gauge === null) return {status: 'incomplete'};
  const pressureKPaAbs = gaugeToAbsoluteKPa(input.gauge, input.unit, atmosphereKPa);
  const saturation = saturationTemperatureC(REFRIGERANTS[input.refrigerant].points, pressureKPaAbs);
  if (saturation.status !== 'ok') return {status: 'out-of-range', side: saturation.status, pressureKPaAbs, limitKPaAbs: saturation.limit};
  const differenceK = input.pipeC === null ? null
    : input.side === 'suction' ? superheatK(input.pipeC, saturation.value) : subcoolingK(input.pipeC, saturation.value);
  return {status: 'ok', pressureKPaAbs, saturation, differenceK};
}

// 저장소에 남기는 마지막 선택값. 측정값은 저장하지 않는다.
export type CalculatorPrefs = {readonly refrigerant: RefrigerantId; readonly unit: PressureUnit; readonly side: MeasurementSide};
export const DEFAULT_CALCULATOR_PREFS: CalculatorPrefs = {refrigerant: 'R290', unit: 'kPa', side: 'suction'};

export function parseCalculatorPrefs(raw: string | null): CalculatorPrefs {
  if (!raw) return DEFAULT_CALCULATOR_PREFS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_CALCULATOR_PREFS;
  }
  if (!data || typeof data !== 'object' || (data as {version?: unknown}).version !== 1) return DEFAULT_CALCULATOR_PREFS;
  const {refrigerant, unit, side} = data as Record<string, unknown>;
  return {
    refrigerant: typeof refrigerant === 'string' && Object.hasOwn(REFRIGERANTS, refrigerant) ? refrigerant as RefrigerantId : DEFAULT_CALCULATOR_PREFS.refrigerant,
    unit: typeof unit === 'string' && Object.hasOwn(PRESSURE_UNITS, unit) ? unit as PressureUnit : DEFAULT_CALCULATOR_PREFS.unit,
    side: side === 'suction' || side === 'liquid' ? side : DEFAULT_CALCULATOR_PREFS.side,
  };
}
export const serializeCalculatorPrefs = (prefs: CalculatorPrefs) => JSON.stringify({version: 1, ...prefs});
