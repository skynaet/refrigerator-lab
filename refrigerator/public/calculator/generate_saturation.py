"""Saturation pressure table for the field calculator (/calculator).

Requires CoolProp 8.0.0 (Python, not an npm dependency):
    python3 -m venv /tmp/sat-venv && /tmp/sat-venv/bin/pip install CoolProp==8.0.0
    /tmp/sat-venv/bin/python refrigerator/public/calculator/generate_saturation.py
Writes saturation-table.json next to this script. Pure refrigerants only (bubble = dew);
zeotropic blends need separate bubble/dew columns and are intentionally not included.
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
    fluids.append(dict(id=ident, coolPropName=coolprop_name, label=label, ashraeSafetyGroup=safety,
                       criticalTemperatureC=round(PropsSI('Tcrit', coolprop_name) - K, 3),
                       maxInterpolationErrorK=float(f'{worst:.2g}'), pressurePa=pressures))

out = dict(
    description='Saturation pressure of pure refrigerants for the /calculator field tool.',
    library='CoolProp ' + CoolProp.__version__,
    generator='public/calculator/generate_saturation.py',
    generated=datetime.date.today().isoformat(),
    call="PropsSI('P','T',T,'Q',0,fluid); Q=1 checked equal (pure fluids, bubble = dew)",
    units=dict(temperature='degC (CoolProp K - 273.15)', pressure='Pa absolute, rounded to 0.1 Pa'),
    interpolation='ln(P) linear in 1/T(K) between adjacent points; no extrapolation',
    temperatureC=dict(min=T_MIN, max=T_MAX, step=STEP),
    sources=['https://coolprop.org/fluid_properties/PurePseudoPure.html',
             'https://coolprop.org/coolprop/HighLevelAPI.html'],
    fluids=fluids,
)
path = Path(__file__).with_name('saturation-table.json')
path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(path, {f['id']: f['maxInterpolationErrorK'] for f in fluids})
