'use client';
import {useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ModelScene from '@/components/model-scene';
import {useLocalFile} from '@/components/local-file';
import './style.css';
import {asset} from '@/lib/asset';
const service='https://secure.hoshizakiamerica.com/docs/manuals/HR24B_serv.pdf';
const parts='https://secure.hoshizakiamerica.com/docs/manuals/HR24B_pts.pdf';
const entries:Record<string,{name:string;page:number;note:string;basis:'drawing'|'typical';part?:string}>={
 compressor:{name:'밀폐형 압축기',page:7,basis:'typical',note:'소형 R600a 왕복동 밀폐형(약 1/5HP급)의 일반 형상. 쉘 약 200×155×177mm, 방진고무 4개와 받침판, 왼쪽(전면 기준)에 토출·흡입·충전관. 뒤쪽에 기동 릴레이 커버.',part:'1 · 506001000'},
 discharge:{name:'토출관',page:9,basis:'typical',note:'압축기 토출구 → 응축수 팬. Ø4.76 동도금 강관.'},
 pan:{name:'응축수 증발 팬',page:7,basis:'drawing',note:'압축기 위 받침. 토출 가스관이 팬 바닥을 세 번 왕복해 제상수를 데워 증발시킵니다.',part:'6 · 410820014'},
 pan_loop:{name:'팬 가열 루프',page:9,basis:'typical',note:'팬 바닥을 지나는 고온 토출관. 회로도 9쪽의 Condensate Pan 구간.'},
 condenser_feed:{name:'응축기 입구관',page:9,basis:'typical',note:'팬 루프 출구에서 후면 응축기 첫 열로 올라갑니다.'},
 condenser:{name:'후면 응축기',page:7,basis:'drawing',note:'와이어-온-튜브 방식. Ø4.76 강관 12열 수직 사행, 양면 Ø1.5 강선 7mm 피치. 후면 오목부에 설치.',part:'35 · 761223010'},
 perimeter:{name:'좌측 벽 둘레 액관',page:9,basis:'typical',note:'응축기 출구 → 왼쪽 벽 속 문틀 둘레 → 드라이어. 문 주변 결로를 막는 가열 액관이며 발포 단열재 속에 묻혀 있습니다.'},
 drier:{name:'필터 드라이어',page:7,basis:'drawing',note:'후면에서 볼 때 오른쪽에 수직 설치. Ø19×100mm, 위 입구 · 아래 모세관 출구.',part:'10 · 761221321'},
 capillary:{name:'모세관',page:7,basis:'typical',note:'Ø2.0(내경 약 0.7)mm 동관. 드라이어 출구에서 네 바퀴 감긴 코일을 지나 흡입관에 붙습니다.'},
 capillary_hx:{name:'모세관·흡입관 열교환부',page:9,basis:'typical',note:'모세관을 흡입관에 붙여 후면 단열재 속을 함께 올라갑니다. 액을 더 냉각하고 흡입 가스를 데워 결로를 막습니다.',part:'34 · 761221421'},
 evaporator:{name:'증발기',page:8,basis:'typical',note:'핀-튜브 코일. Ø7.94 동관 2열×4단, 알루미늄 핀 6mm 피치, 300×55×85mm. 아래 물받이.',part:'27 · 765080411'},
 evaporator_fan:{name:'증발기 팬',page:8,basis:'typical',note:'Ø100 축류팬, 모터, 슈라우드. 천장 냉각부의 증발기 앞에 있습니다. 운전 표시를 켜면 돌고, 문을 열면 멈춥니다(서비스 매뉴얼: 문 열림 시 팬 정지).',part:'29 · 765071196'},
 suction:{name:'흡입관',page:9,basis:'typical',note:'Ø6.35 동관. 증발기 출구 → 후면 단열재 속 수직 하강 → 압축기 흡입구.'},
 drain:{name:'응축수 배수호스',page:7,basis:'drawing',note:'증발기 물받이 → 응축수 팬.'},
 start_relay:{name:'기동 릴레이',page:7,basis:'drawing',note:'7쪽 Start Relay 표기 위치. 커버 크기는 일반값입니다.'},
 cabinet:{name:'외함·내함',page:8,basis:'drawing',note:'서비스 도면 기준 폭 595 × 깊이 624 × 높이 805mm. 손잡이 돌출 24mm는 별도.'},
 door:{name:'도어',page:7,basis:'drawing',note:'우측 힌지와 좌측 세로 손잡이.'},
 shelves:{name:'선반',page:7,basis:'drawing',note:'큰 선반 1개와 작은 선반 2개. 내부 단차에 맞춘 배열입니다.'},
};
const list=['compressor','discharge','pan','condenser','perimeter','drier','capillary','capillary_hx','evaporator','evaporator_fan','suction','cabinet'];
const basisLabel={drawing:'위치·형상: 제조사 도면',typical:'위치: 도면 / 형상: 업계 일반 부품'};
export default function HR24Page(){const [selected,setSelected]=useState('compressor'),[view,setView]=useState('rear'),[transparent,setTransparent]=useState(true),[flow,setFlow]=useState(false),[door,setDoor]=useState(false),[page,setPage]=useState(7);const entry=entries[selected]||entries.cabinet;const figure=asset(`/hr24/${page===7?'construction':page===8?'dimensions':'refrigeration'}.png`),hasFigure=useLocalFile(figure);
 function select(id:string){if(entries[id]){setSelected(id);setPage(entries[id].page);}}
 return <main className="hr-app"><header><div><small>MANUFACTURER SERVICE DRAWINGS</small><h1>Hoshizaki <b>HR24B</b></h1></div><nav><Link href="/new">새로 만들기</Link><Link href="/models">모델 목록</Link><Link href="/editor">사양서 편집기</Link><Link href="/reference">T-19-HC 시뮬레이터</Link><a href={asset('/models/hr24b/model.obj')} download>3D 모델(OBJ)</a><a href={asset('/models/hr24b/spec.json')} download>사양서(JSON)</a><Link href="/diagnose">고장 진단 연습</Link></nav></header><div className="hr-summary">1도어 · R600a <span>서비스 매뉴얼 73229 / 2021-04-20 개정 / 7–9쪽</span><b>도면 배치 + 업계 일반 부품 형상</b></div>
 <div className="hr-work"><aside className="hr-parts"><h2>부품 위치 대조</h2>{list.map((id,i)=><button key={id} className={selected===id?'active':''} onClick={()=>select(id)}><span>{String(i+1).padStart(2,'0')}</span>{entries[id].name}</button>)}<section><small>선택 부품 / 근거 {entry.page}쪽</small><h3>{entry.name}</h3><p>{entry.note}</p><p>{basisLabel[entry.basis]}</p>{entry.part&&<p>부품표 번호 {entry.part}</p>}</section><a href={parts} target="_blank" rel="noreferrer">제조사 부품표 ↗</a></aside>
 <section className="hr-model"><div className="hr-tools"><select aria-label="제품 시점" value={view} onChange={e=>setView(e.target.value)}><option value="rear">후면 입체</option><option value="back">후면 정면</option><option value="front">전면 입체</option><option value="left">좌측면</option><option value="machine">기계실 확대</option></select><button className={transparent?'active':''} onClick={()=>setTransparent(!transparent)}>외함 투명</button><button onClick={()=>setDoor(!door)}>문 {door?'닫기':'열기'}</button></div><ModelScene src={asset('/models/hr24b')} selected={selected} onSelect={select} view={view} transparent={transparent} flow={flow} door={door}/><div className="hr-model-footer"><strong>{entry.name}</strong><span>드래그 회전 · 스크롤 확대 · 부품 선택</span></div><div className="hr-options"><label><input type="checkbox" checked={flow} onChange={e=>setFlow(e.target.checked)}/> 운전 표시 (냉매 흐름 · 증발기 팬)</label></div><p className="hr-note">부품 위치와 냉매 회로 순서는 제조사 도면(7~9쪽)을 따르고, 부품 모양·관경은 이 급 R600a 업소용 냉장고에 흔히 쓰는 부품 치수로 만들었습니다. 벽 속에 묻힌 배관(둘레 액관, 열교환부, 흡입관)은 외함을 투명하게 하면 보입니다. 제조사 원본 CAD나 실측값은 아닙니다.</p></section>
 <section className="hr-source"><div><h2>제조사 원본과 비교</h2><nav>{[[7,'실제 설치도'],[8,'치수·단면'],[9,'냉매 회로']].map(([n,label])=><button className={page===n?'active':''} key={n} onClick={()=>setPage(n as number)}>{label}</button>)}</nav></div>{hasFigure?<a href={`${service}#page=${page}`} target="_blank" rel="noreferrer"><Image unoptimized width={1040} height={1350} src={figure} alt={`HR24B 제조사 서비스 매뉴얼 ${page}페이지 원본`}/></a>:hasFigure===false&&<a className="hr-source-missing" href={`${service}#page=${page}`} target="_blank" rel="noreferrer"><strong>서비스 매뉴얼 {page}쪽 ({page===7?'실제 설치도':page===8?'치수·단면':'냉매 회로'})</strong><span>제조사 문서는 저작권 때문에 저장소에 포함하지 않습니다. 제조사 사이트에서 원본을 여세요 ↗</span></a>}<p>{page===9?'9쪽 회로도에서 연결 순서(압축기 → 팬 → 응축기 → 둘레 액관 → 드라이어 → 모세관 → 증발기 → 흡입관)를 가져왔습니다. 3D 경로는 일반적인 설치 방식으로 배관했습니다.':'7쪽 설치도와 8쪽 단면도를 함께 확인하며 부품의 앞뒤·좌우·높이 관계를 재구성했습니다.'}</p><a href={service} target="_blank" rel="noreferrer">제조사 서비스 매뉴얼 원본 ↗</a></section></div>
 <footer><strong>냉매 회로</strong><p>압축기 → 토출관 → 응축수 팬 가열 루프 → 후면 와이어 응축기 → 좌측 벽 둘레 액관 → 필터 드라이어 → 모세관 코일 → 흡입관 열교환부 → 천장 핀-튜브 증발기 → 흡입관 → 압축기. 운전 표시를 켜면 냉매 흐름이 점으로 움직이고 증발기 팬이 돕니다.</p></footer></main>;
}
