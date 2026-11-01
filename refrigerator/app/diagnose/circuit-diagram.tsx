/* eslint-disable jsx-a11y/prefer-tag-over-role -- 인라인 SVG 회로도를 하나의 이미지로 읽도록 역할을 지정한다. */
import {useId} from 'react';
import {CIRCUIT_PARTS} from '@/lib/diagnosis';
import type {CircuitLocation, CircuitPartId} from '@/lib/diagnosis';

// 고장별 강조 위치는 진단 데이터에서 받고, 여기서는 회로의 표시 좌표를 정의한다.
const nodes: readonly {id: CircuitPartId; x: number; y: number; fan?: CircuitPartId}[] = [
  {id: 'compressor', x: 8, y: 16},
  {id: 'condenser', x: 154, y: 16, fan: 'condenser-fan'},
  {id: 'drier-liquid-line', x: 154, y: 136},
  {id: 'capillary', x: 154, y: 256},
  {id: 'evaporator', x: 8, y: 256, fan: 'evaporator-fan'},
  {id: 'suction-line', x: 8, y: 136},
];
const connections = [
  {from: 'compressor', to: 'condenser', path: 'M126 56H150'},
  {from: 'condenser', to: 'drier-liquid-line', path: 'M213 96V132'},
  {from: 'drier-liquid-line', to: 'capillary', path: 'M213 216V252'},
  {from: 'capillary', to: 'evaporator', path: 'M154 296H130'},
  {from: 'evaporator', to: 'suction-line', path: 'M67 256V220'},
  {from: 'suction-line', to: 'compressor', path: 'M67 136V100'},
] as const;

export default function CircuitDiagram({location}: {location: CircuitLocation}) {
  const arrowId = useId();
  const highlighted = (id: CircuitPartId) => location.parts.includes(id);
  const partClass = (id: CircuitPartId) => `diagnose-circuit-part${highlighted(id) ? ' diagnose-circuit-highlight' : ''}`;
  const labels = location.parts.map(id => CIRCUIT_PARTS[id]).join(', ');

  return <figure className="diagnose-circuit">
    <svg viewBox="0 0 280 352" role="img"
      aria-label={`모세관 냉동 회로. 흐름: 압축기 → 응축기 → 드라이어·액관 → 모세관 → 증발기 → 흡입관 → 압축기. 강조 위치: ${labels}. ${location.description}`}>
      <defs><marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0L8 4L0 8Z" fill="context-stroke"/>
      </marker></defs>
      <g aria-hidden="true">
        {connections.map(({from, to, path}) => <path key={from} d={path}
          className={`diagnose-circuit-flow${highlighted(from) && highlighted(to) ? ' diagnose-circuit-highlight' : ''}`}
          markerEnd={`url(#${arrowId})`}/>)}
        {nodes.map(({id, x, y, fan}) => <g key={id} transform={`translate(${x} ${y})`} className={partClass(id)} data-part={id}>
          <rect width="118" height="80" rx="8"/>
          <text x="59" y="29">{CIRCUIT_PARTS[id]}</text>
          {fan ? <g transform="translate(10 41)" className={partClass(fan)} data-part={fan}>
            <rect width="98" height="27" rx="5"/>
            <text x="49" y="19">{CIRCUIT_PARTS[fan]}</text>
          </g> : id === 'capillary' ? <path className="diagnose-circuit-symbol" d="M18 55H28L36 44L48 66L60 44L72 66L84 44L92 55H100"/>
            : id === 'compressor' ? <circle className="diagnose-circuit-symbol" cx="59" cy="55" r="15"/>
              : id === 'drier-liquid-line' ? <rect className="diagnose-circuit-symbol" x="28" y="45" width="62" height="21" rx="10"/>
                : <path className="diagnose-circuit-symbol" d="M18 55H100"/>}
        </g>)}
        <g className={partClass('joints')} data-part="joints">
          {[[132, 56], [213, 108], [67, 244]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4"/>)}
        </g>
      </g>
    </svg>
    <figcaption>
      <p><strong>강조 위치: {labels}</strong></p>
      <p>금색 굵은 테두리·배관이 관련 구간입니다. 화살표는 냉매의 흐름입니다.</p>
      <p>{location.description}</p>
    </figcaption>
  </figure>;
}
