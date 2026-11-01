'use client';

import {useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import Link from 'next/link';
import {
  ATMOSPHERE_RANGE_KPA, DEFAULT_CALCULATOR_PREFS, MEASUREMENT_SIDES, PRESSURE_UNITS, PRESSURE_UNIT_IDS, REFRIGERANTS, REFRIGERANT_IDS,
  STANDARD_ATMOSPHERE_KPA, absoluteKPaToGauge, calculateField, parseCalculatorPrefs, parseDecimal, saturationPressureKPa,
  serializeCalculatorPrefs, toggleSign,
} from '@/lib/field-calculator';
import type {CalculatorPrefs, InterpolationResult, MeasurementSide, PressureUnit} from '@/lib/field-calculator';
import {FIELD_CALCULATOR_KEY} from '@/lib/storage-keys';
import '../hr24/style.css';
import './calculator.css';

// 음수 0(-0.0) 표시를 피하고 마이너스 기호를 읽기 쉬운 −로 바꾼다.
function format(value: number, digits: number) {
  const rounded = Number(value.toFixed(digits));
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(digits).replace('-', '−');
}
const formatGauge = (absoluteKPa: number, unit: PressureUnit, atmosphereKPa: number) =>
  `${format(absoluteKPaToGauge(absoluteKPa, unit, atmosphereKPa), PRESSURE_UNITS[unit].digits)} ${PRESSURE_UNITS[unit].label}`;

function Segmented<T extends string>({legend, name, value, options, onChange}: {
  legend: string; name: string; value: T; options: readonly {value: T; label: ReactNode}[]; onChange: (value: T) => void;
}) {
  return <fieldset className="calc-segmented">
    <legend>{legend}</legend>
    <div>{options.map(option => <label key={option.value} className={value === option.value ? 'calc-checked' : ''}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)}/>
      <span>{option.label}</span>
    </label>)}</div>
  </fieldset>;
}

function NumberField({id, label, unit, value, onChange, placeholder, invalid, help}: {
  id: string; label: string; unit: string; value: string; onChange: (value: string) => void;
  placeholder: string; invalid: boolean; help?: ReactNode;
}) {
  return <div className="calc-field">
    <label htmlFor={id}>{label}</label>
    <div className="calc-input-row">
      <input id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done"
        placeholder={placeholder} value={value} aria-invalid={invalid} aria-describedby={`${id}-help`}
        onChange={event => onChange(event.target.value)}/>
      <span className="calc-unit">{unit}</span>
      <button type="button" aria-label={`${label} 부호 바꾸기 (영하·진공 입력)`} onClick={() => onChange(toggleSign(value))}>±</button>
    </div>
    <p id={`${id}-help`} className="calc-help">{invalid ? '숫자로 입력하세요. 예: 3.5, −12' : help}</p>
  </div>;
}

export default function CalculatorPage() {
  const [prefs, setPrefs] = useState<CalculatorPrefs>(DEFAULT_CALCULATOR_PREFS);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [pressureText, setPressureText] = useState('');
  const [pipeText, setPipeText] = useState('');
  const [atmosphereText, setAtmosphereText] = useState(String(STANDARD_ATMOSPHERE_KPA));
  const [reverseText, setReverseText] = useState('');

  // 정적 빌드의 첫 렌더와 같게 기본값으로 그린 뒤, 마운트 후에만 저장소를 읽는다.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setPrefs(parseCalculatorPrefs(localStorage.getItem(FIELD_CALCULATOR_KEY)));
      } catch {
        setStorageUnavailable(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function updatePrefs(patch: Partial<CalculatorPrefs>) {
    const next = {...prefs, ...patch};
    setPrefs(next);
    try {
      localStorage.setItem(FIELD_CALCULATOR_KEY, serializeCalculatorPrefs(next));
    } catch {
      setStorageUnavailable(true);
    }
  }

  const {refrigerant, unit, side} = prefs;
  const data = REFRIGERANTS[refrigerant];
  const unitLabel = PRESSURE_UNITS[unit].label;
  const quantity = MEASUREMENT_SIDES[side].quantity;
  const gauge = parseDecimal(pressureText);
  const pipeC = parseDecimal(pipeText);
  const atmosphereKPa = parseDecimal(atmosphereText);
  const atmosphereOk = atmosphereKPa !== null && atmosphereKPa >= ATMOSPHERE_RANGE_KPA[0] && atmosphereKPa <= ATMOSPHERE_RANGE_KPA[1];
  const atmosphere = atmosphereOk ? atmosphereKPa : STANDARD_ATMOSPHERE_KPA;
  const result = calculateField({refrigerant, side, gauge, unit, pipeC, atmosphereKPa});
  const [minC, minKPa] = data.points[0];
  const [maxC, maxKPa] = data.points[data.points.length - 1];
  const reverseC = parseDecimal(reverseText);
  const reverse: InterpolationResult | null = reverseC === null ? null : saturationPressureKPa(data.points, reverseC);
  const gapNote = <p className="calc-note">0~30 °C 사이는 표에 점이 없어 넓은 간격을 보간한 값입니다. 표의 점을 빼고 더 넓은 간격으로 다시 맞춰 본 오차는 0.3 K 이내였습니다.</p>;

  return <main className="hr-app calc-app">
    <header>
      <div><small>현장 도구</small><h1>과열도·과냉도 <b>현장 계산기</b></h1></div>
      <nav aria-label="화면 이동">
        <Link href="/" prefetch={false}>HR24B 홈</Link>
        <Link href="/diagnose" prefetch={false}>고장 진단 연습</Link>
        <Link href="/reference" prefetch={false}>T-19-HC 시뮬레이터</Link>
      </nav>
    </header>
    <div className="calc-content">
      <p className="calc-intro">게이지 압력으로 냉매의 포화온도를 구하고, 배관 온도와 비교해 과열도(흡입관) 또는 과냉도(액관)를 계산합니다. 입력하는 대로 바로 계산합니다.</p>

      <section className="calc-panel" aria-labelledby="calc-setup-title">
        <h2 id="calc-setup-title">측정 조건</h2>
        <Segmented legend="냉매" name="refrigerant" value={refrigerant} onChange={value => updatePrefs({refrigerant: value})}
          options={REFRIGERANT_IDS.map(id => ({value: id, label: REFRIGERANTS[id].label}))}/>
        <p className="calc-help">계산 범위: 포화온도 {format(minC, 0)}~{format(maxC, 0)} °C ({formatGauge(minKPa, unit, atmosphere)} ~ {formatGauge(maxKPa, unit, atmosphere)}). 범위 밖은 계산하지 않습니다. R134a 등은 이 저장소에 검증된 포화 데이터가 없어 넣지 않았습니다.</p>
        <Segmented legend="측정 위치" name="side" value={side} onChange={(value: MeasurementSide) => updatePrefs({side: value})}
          options={(Object.keys(MEASUREMENT_SIDES) as MeasurementSide[]).map(id => ({value: id, label: <>{MEASUREMENT_SIDES[id].label}<small>{MEASUREMENT_SIDES[id].quantity}</small></>}))}/>
        <Segmented legend="게이지 압력 단위" name="unit" value={unit} onChange={value => updatePrefs({unit: value})}
          options={PRESSURE_UNIT_IDS.map(id => ({value: id, label: PRESSURE_UNITS[id].label}))}/>
        <details className="calc-atmosphere">
          <summary>게이지압 기준 · 대기압 {atmosphereOk ? format(atmosphereKPa, 3) : '확인 필요'} kPa(a)</summary>
          <p>(g)·psig는 대기압을 0으로 하는 게이지압입니다. 절대압 = 게이지압 + 대기압이며, 기본값은 표준 대기압 101.325 kPa입니다. 고지대에서는 현지 대기압으로 바꿀 수 있습니다.</p>
          <NumberField id="calc-atmosphere" label="대기압 (절대)" unit="kPa(a)" value={atmosphereText} onChange={setAtmosphereText}
            placeholder="101.325" invalid={atmosphereText.trim() !== '' && atmosphereKPa === null}
            help={atmosphereOk ? '표준 대기압은 101.325 kPa입니다.' : `${ATMOSPHERE_RANGE_KPA[0]}~${ATMOSPHERE_RANGE_KPA[1]} kPa 사이로 입력하세요.`}/>
          <button type="button" className="calc-reset" disabled={atmosphereText === String(STANDARD_ATMOSPHERE_KPA)}
            onClick={() => setAtmosphereText(String(STANDARD_ATMOSPHERE_KPA))}>표준 대기압으로 되돌리기</button>
        </details>
        <p className="calc-storage-note">{storageUnavailable ? '브라우저 저장소를 사용할 수 없어 선택값을 기억하지 못합니다. 계산은 그대로 됩니다.' : '냉매·측정 위치·단위 선택만 이 브라우저에 기억합니다. 측정값은 저장하지 않습니다.'}</p>
      </section>

      <section className="calc-panel" aria-labelledby="calc-measure-title">
        <h2 id="calc-measure-title">측정값 → {quantity}</h2>
        <NumberField id="calc-pressure" label={side === 'suction' ? '저압 게이지 압력' : '고압 게이지 압력'} unit={unitLabel}
          value={pressureText} onChange={setPressureText} placeholder={unit === 'kPa' ? '예: 250' : unit === 'psi' ? '예: 35' : '예: 2.5'}
          invalid={pressureText.trim() !== '' && gauge === null}
          help={refrigerant === 'R600a' && side === 'suction' ? 'R600a 저압은 대기압보다 낮은(진공) 경우가 많습니다. 음수는 ± 버튼으로 입력하세요.' : '서비스 밸브·게이지로 읽은 값을 그대로 입력합니다.'}/>
        <NumberField id="calc-pipe" label={side === 'suction' ? '흡입관 온도' : '액관 온도'} unit="°C"
          value={pipeText} onChange={setPipeText} placeholder={side === 'suction' ? '예: −5' : '예: 35'}
          invalid={pipeText.trim() !== '' && pipeC === null}
          help={side === 'suction' ? '압력을 잰 곳 가까운 흡입관(증발기 출구~압축기 흡입구)의 표면 온도입니다.' : '응축기 출구~드라이어 앞 액관의 표면 온도입니다. 토출관 온도를 넣으면 과냉도가 아닙니다.'}/>
        <div className="calc-result" aria-live="polite" aria-atomic="true">
          {result.status === 'incomplete' && <p>압력을 입력하면 포화온도를 계산합니다.</p>}
          {result.status === 'invalid-atmosphere' && <p className="calc-warning">대기압을 {ATMOSPHERE_RANGE_KPA[0]}~{ATMOSPHERE_RANGE_KPA[1]} kPa(a) 사이로 입력하세요.</p>}
          {result.status === 'out-of-range' && <p className="calc-warning">
            입력 압력(절대 {format(result.pressureKPaAbs, 1)} kPa)이 {data.id} 표 범위보다 {result.side === 'below' ? '낮습니다' : '높습니다'}
            {' '}(한계 {formatGauge(result.limitKPaAbs, unit, atmosphere)} = {result.side === 'below' ? format(minC, 0) : format(maxC, 0)} °C). 표 밖은 외삽하지 않습니다. 냉매 종류, 압력 단위, 게이지압·절대압 구분을 확인하세요.
          </p>}
          {result.status === 'ok' && <>
            <dl className="calc-metrics">
              <div><dt>포화온도</dt><dd>{format(result.saturation.value, 1)} <small>°C</small></dd></div>
              <div className="calc-main-metric"><dt>{quantity}</dt><dd>{result.differenceK === null ? <span className="calc-pending">온도 입력 필요</span> : <>{format(result.differenceK, 1)} <small>K</small></>}</dd></div>
              <div><dt>절대압력</dt><dd>{format(result.pressureKPaAbs, 1)} <small>kPa(a)</small></dd></div>
            </dl>
            {result.saturation.wideGap && gapNote}
            {result.differenceK !== null && (result.differenceK < 0
              ? <p className="calc-warning">{side === 'suction'
                ? '음수: 흡입관 온도가 포화온도보다 낮습니다. 과열 증기에서는 생길 수 없으므로 온도 센서 접촉·보온, 압력과 온도의 측정 위치, 게이지 영점, 냉매 종류와 단위를 다시 확인하세요.'
                : '음수: 액관 온도가 고압 포화온도보다 높습니다. 액냉매에서는 생길 수 없으므로 측정 위치(토출관이 아닌 액관인지), 센서 접촉, 게이지 영점, 냉매 종류와 단위를 다시 확인하세요.'}</p>
              : <p className="calc-note">{side === 'suction'
                ? '0에 가까우면 그 지점에 아직 액냉매가 섞인 포화 상태일 수 있습니다. '
                : '0에 가까우면 그 지점의 냉매가 완전히 응축되지 않은 포화 상태일 수 있습니다. '}
                높음·정상·낮음 판정은 해당 기기의 서비스 데이터(제조사 기준값과 측정 조건)와 비교하세요. 이 앱에는 기기별 기준값이 없습니다.</p>)}
          </>}
        </div>
        <p className="calc-link-note">{quantity}가 높거나 낮을 때 의심할 고장은 <Link href="/diagnose" prefetch={false}>고장 진단 연습</Link>에서 익힐 수 있습니다.</p>
      </section>

      <section className="calc-panel" aria-labelledby="calc-reverse-title">
        <h2 id="calc-reverse-title">온도 → 포화압력</h2>
        <NumberField id="calc-reverse" label="포화온도" unit="°C" value={reverseText} onChange={setReverseText} placeholder="예: −10"
          invalid={reverseText.trim() !== '' && reverseC === null}
          help={`목표 증발·응축 온도에 해당하는 게이지 압력을 구합니다. ${data.id} 범위 ${format(minC, 0)}~${format(maxC, 0)} °C.`}/>
        <div className="calc-result" aria-live="polite" aria-atomic="true">
          {!reverse && <p>온도를 입력하면 {data.id} 포화압력을 계산합니다.</p>}
          {reverse && reverse.status !== 'ok' && <p className="calc-warning">{data.id} 표 범위({format(minC, 0)}~{format(maxC, 0)} °C) 밖입니다. 외삽하지 않습니다.</p>}
          {reverse?.status === 'ok' && <>
            <dl className="calc-metrics">
              <div className="calc-main-metric"><dt>게이지 압력</dt><dd>{format(absoluteKPaToGauge(reverse.value, unit, atmosphere), PRESSURE_UNITS[unit].digits)} <small>{unitLabel}</small></dd></div>
              <div><dt>절대압력</dt><dd>{format(reverse.value, 1)} <small>kPa(a)</small></dd></div>
            </dl>
            {reverse.value < atmosphere && <p className="calc-note">대기압보다 낮은 압력(진공 영역)입니다.</p>}
            <p className="calc-other-units">다른 단위: {PRESSURE_UNIT_IDS.filter(id => id !== unit).map(id => formatGauge(reverse.value, id, atmosphere)).join(' · ')}</p>
            {reverse.wideGap && gapNote}
          </>}
        </div>
      </section>

      <section className="calc-panel calc-sources" aria-labelledby="calc-source-title">
        <h2 id="calc-source-title">계산 근거와 주의</h2>
        <ul>
          <li>포화 데이터: 이 저장소의 CoolProp 8.0.0 계산표만 씁니다. R290은 <code>{REFRIGERANTS.R290.source.split(' · ')[0]}</code>, R600a는 <code>{REFRIGERANTS.R600a.source.split(' · ')[0]}</code>의 포화압력 점입니다.</li>
          <li>표 점 사이는 로그 압력과 절대온도의 역수를 선형 보간합니다. 표 범위 밖은 외삽하지 않습니다.</li>
          <li>게이지·온도계의 오차, 배관 표면과 냉매의 온도 차이, 운전 안정 여부에 따라 결과가 달라집니다. 운전이 안정된 뒤 측정하세요.</li>
          <li><strong>안전:</strong> R290·R600a는 가연성 냉매입니다. 화기·점화원을 피하고 환기하며, 제조사 서비스 절차를 따르세요.</li>
        </ul>
      </section>
    </div>
  </main>;
}
