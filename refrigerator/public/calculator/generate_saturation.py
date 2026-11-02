"""현장 계산기(/calculator)의 단일 성분·혼합 냉매 포화압력 표.

Requires CoolProp 8.0.0 (Python, not an npm dependency):
    python3 -m venv /tmp/sat-venv && /tmp/sat-venv/bin/pip install CoolProp==8.0.0
    /tmp/sat-venv/bin/python refrigerator/public/calculator/generate_saturation.py
같은 폴더에 saturation-table.json을 쓴다. 혼합 냉매는 CoolProp의 Lemmon
의사순수(pseudo-pure) 모델로 기포점(Q=0)·이슬점(Q=1)을 따로 계산한다.
R448A/R449A는 CoolProp 8.0.0에 없어 제외한다. HEOS 혼합물로 임의 합성하지 않는다.
"""
from pathlib import Path
import datetime, json, math
import CoolProp
from CoolProp.CoolProp import PropsSI

PINNED = '8.0.0'
assert CoolProp.__version__ == PINNED, f'CoolProp {PINNED} required, found {CoolProp.__version__}'
FLUIDS = [
    ('R290', 'Propane', 'R290 (프로판)', 'A3'),
    ('R600a', 'IsoButane', 'R600a (이소부탄)', 'A3'),
    ('R134a', 'R134a', 'R134a', 'A1'),
]
BLENDS = [('R410A', 'R410A', 'R410A', 'A1'),
          ('R404A', 'R404A', 'R404A', 'A1'),
          ('R407C', 'R407C', 'R407C', 'A1')]
T_MIN, T_MAX, STEP = -40, 70, 1
K = 273.15
temps = list(range(T_MIN, T_MAX + 1, STEP))
fluids = []
for ident, coolprop_name, label, safety in FLUIDS:
    assert PropsSI('Tcrit', coolprop_name) - K > T_MAX + 10, ident
    pressures = []
    for t in temps:
        bubble = PropsSI('P', 'T', t + K, 'Q', 0, coolprop_name)
        dew = PropsSI('P', 'T', t + K, 'Q', 1, coolprop_name)
        assert abs(bubble - dew) <= 1e-6 * bubble, f'{ident} {t} C: not a pure fluid'
        pressures.append(round(bubble, 1))
    assert all(b > a for a, b in zip(pressures, pressures[1:])), ident
    # Worst-case ln(P)-1/T interpolation error at mid-steps, checked against CoolProp directly.
    worst = 0.0
    for i in range(len(temps) - 1):
        for k in range(1, 10):
            t = temps[i] + STEP * k / 10
            p = PropsSI('P', 'T', t + K, 'Q', 0, coolprop_name)
            f = (math.log(p) - math.log(pressures[i])) / (math.log(pressures[i + 1]) - math.log(pressures[i]))
            inv = 1 / (temps[i] + K) + f * (1 / (temps[i + 1] + K) - 1 / (temps[i] + K))
            worst = max(worst, abs(1 / inv - K - t))
    assert worst < 0.05, (ident, worst)
    fluids.append(dict(id=ident, kind='pure', coolPropName=coolprop_name, label=label, ashraeSafetyGroup=safety,
                       temperatureC=dict(min=T_MIN, max=T_MAX, step=STEP),
                       criticalTemperatureC=round(PropsSI('Tcrit', coolprop_name) - K, 3),
                       maxInterpolationErrorK=float(f'{worst:.2g}'), pressurePa=pressures))

# 단일 성분의 생성·검사 경로는 유지하고 혼합 냉매의 두 열을 별도로 검증한다.
for ident, coolprop_name, label, safety in BLENDS:
    critical_c = PropsSI('Tcrit', coolprop_name) - K
    t_max = min(T_MAX, math.floor(critical_c - 5))
    assert critical_c - t_max >= 5, (ident, '임계온도 여유')
    blend_temps = list(range(T_MIN, t_max + 1, STEP))
    columns, errors = {}, {}
    for column, quality in [('bubblePressurePa', 0), ('dewPressurePa', 1)]:
        pressures = [round(PropsSI('P', 'T', t + K, 'Q', quality, coolprop_name), 1)
                     for t in blend_temps]
        assert all(b > a for a, b in zip(pressures, pressures[1:])), (ident, column)
        worst = 0.0
        for i in range(len(blend_temps) - 1):
            for k in range(1, 10):
                t = blend_temps[i] + STEP * k / 10
                p = PropsSI('P', 'T', t + K, 'Q', quality, coolprop_name)
                f = (math.log(p) - math.log(pressures[i])) / (math.log(pressures[i + 1]) - math.log(pressures[i]))
                inv = 1 / (blend_temps[i] + K) + f * (1 / (blend_temps[i + 1] + K) - 1 / (blend_temps[i] + K))
                worst = max(worst, abs(1 / inv - K - t))
        assert worst < 0.05, (ident, column, worst)
        columns[column] = pressures
        # 오차 상한을 기록하도록 올림한다.
        errors[column] = math.ceil(worst * 1e8) / 1e8
    for bubble, dew in zip(columns['bubblePressurePa'], columns['dewPressurePa']):
        assert bubble >= dew, (ident, '기포점 ≥ 이슬점')
        # R410A도 이번 표의 모든 점에서는 엄격히 크다(근사 공비).
        assert bubble > dew, (ident, '기포점 > 이슬점 직접 확인')
    fluids.append(dict(id=ident, kind='blend', coolPropName=coolprop_name, label=label,
                       model='Lemmon pseudo-pure', ashraeSafetyGroup=safety,
                       temperatureC=dict(min=T_MIN, max=t_max, step=STEP),
                       criticalTemperatureC=round(critical_c, 3),
                       maxInterpolationErrorK=max(errors.values()),
                       interpolationErrorK=errors, **columns))

out = dict(
    description='현장 계산기의 단일 성분 포화압력 및 혼합 냉매 기포점·이슬점 압력.',
    library='CoolProp ' + CoolProp.__version__,
    generator='public/calculator/generate_saturation.py',
    generated=datetime.date.today().isoformat(),
    call="PropsSI('P','T',T,'Q',0,fluid) bubble; PropsSI('P','T',T,'Q',1,fluid) dew; pure fluids checked equal",
    units=dict(temperature='degC (CoolProp K - 273.15)', pressure='Pa absolute, rounded to 0.1 Pa'),
    interpolation='ln(P) linear in 1/T(K) between adjacent points; no extrapolation',
    temperatureC=dict(min=T_MIN, max=T_MAX, step=STEP),
    blendTemperatureRule='하한 −40 °C, 1 K 간격; 상한 min(70, floor(Tcrit[°C] − 5 K)); 냉매별 temperatureC 적용',
    excludedFluids=dict(ids=['R448A', 'R449A'], reason='CoolProp 8.0.0에 없어 제외. HEOS 혼합물로 임의 합성하지 않음.'),
    sources=['https://coolprop.org/fluid_properties/PurePseudoPure.html',
             'https://coolprop.org/coolprop/HighLevelAPI.html'],
    fluids=fluids,
)
path = Path(__file__).with_name('saturation-table.json')
path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(path, {f['id']: f['maxInterpolationErrorK'] for f in fluids})
