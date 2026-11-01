'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import ModelScene from '@/components/model-scene';
import {asset} from '@/lib/asset';
import '../hr24/style.css';
type Entry={id:string;model:string;refrigerant:string;summary:string};
type Item={id:string;name:string;notes?:string;basis?:string;group?:string};
type Spec={meta:{model:string;refrigerant:string;summary?:string;source?:string;method?:string};components:Item[];circuit:Item[]};
type Verification={overallWithHandleMm:{width:number;depth:number;height:number};circuitClosed:boolean;failures:string[];pipeLengthsMm:Record<string,number>;partCount:number};
type Routes={routes:{id:string;name:string;outerDiameterMm:number;lengthMm:number}[]};
const basisLabel:Record<string,string>={drawing:'제조사 자료',typical:'업계 일반 형상'};
export default function ModelsPage(){
 const [index,setIndex]=useState<Entry[]>([]),[id,setId]=useState(''),[data,setData]=useState<{spec:Spec;ver:Verification;routes:Routes}|null>(null);
 const [selected,setSelected]=useState('compressor'),[view,setView]=useState('rear'),[transparent,setTransparent]=useState(true),[flow,setFlow]=useState(false),[door,setDoor]=useState(false);
 useEffect(()=>{fetch(asset('/models/index.json')).then(r=>r.json() as Promise<{models:Entry[]}>).then(d=>{setIndex(d.models);setId(d.models[0]?.id??'');}).catch(()=>setIndex([]));},[]);
 useEffect(()=>{if(!id)return;let live=true;const base=asset(`/models/${id}`);
  const get=<J,>(n:string)=>fetch(`${base}/${n}.json`).then(r=>r.json() as Promise<J>);
  Promise.all([get<Spec>('spec'),get<Verification>('verification'),get<Routes>('routes')]).then(([spec,ver,routes])=>{if(live)setData({spec,ver,routes});}).catch(()=>{if(live)setData(null);});return()=>{live=false;};},[id]);
 // Components that stand on their own (handles, displays, feet are grouped into cabinet/door).
 const groups=data?data.spec.components.filter(c=>!c.group):[];
 const current=data&&([...data.spec.components,...data.spec.circuit].find(c=>c.id===selected));
 const base=asset(`/models/${id}`),v=data?.ver;
 return <main className="hr-app"><header><div><small>SPEC-GENERATED MODELS</small><h1>사양서 기반 <b>모델</b></h1></div><nav><Link href="/new">새로 만들기</Link><Link href="/editor">사양서 편집기</Link><Link href="/">HR24B 도면 대조</Link><Link href="/reference">T-19-HC 시뮬레이터</Link><Link href="/diagnose">고장 진단 연습</Link><Link href="/calculator">현장 계산기</Link></nav></header>
 <div className="hr-summary">사양서(JSON) 하나로 외함·부품·냉매 배관을 생성하고 자동 검사합니다<span>{index.length}개 모델</span><b>{data?.spec.meta.model}</b></div>
 <div className="hr-work"><aside className="hr-parts"><h2>모델</h2>{index.map(m=><button key={m.id} className={id===m.id?'active':''} onClick={()=>{setData(null);setId(m.id);setSelected('compressor');}}><span>{m.refrigerant}</span>{m.model}</button>)}
 <h2 style={{marginTop:24}}>부품</h2>{groups.map(g=><button key={g.id} className={selected===g.id?'active':''} onClick={()=>setSelected(g.id)}>{g.name}</button>)}
 {current&&<section><small>{basisLabel[current.basis??'typical']}</small><h3>{current.name}</h3><p>{current.notes}</p></section>}</aside>
 <section className="hr-model"><div className="hr-tools"><select aria-label="시점" value={view} onChange={e=>setView(e.target.value)}><option value="rear">후면 입체</option><option value="back">후면 정면</option><option value="front">전면 입체</option><option value="left">좌측면</option><option value="machine">기계실 확대</option></select><button className={transparent?'active':''} onClick={()=>setTransparent(!transparent)}>외함 투명</button><button onClick={()=>setDoor(!door)}>문 {door?'닫기':'열기'}</button></div>
 {id&&<ModelScene key={id} src={base} selected={selected} onSelect={setSelected} view={view} transparent={transparent} flow={flow} door={door}/>}
 <div className="hr-options"><label><input type="checkbox" checked={flow} onChange={e=>setFlow(e.target.checked)}/> 운전 표시 (냉매 흐름 · 팬)</label></div>
 <p className="hr-note">{data?.spec.meta.method}</p></section>
 <section className="hr-source"><h2>사양서 요약</h2>{data&&v&&<>
 <p>{data.spec.meta.summary}</p>
 <p>냉매 {data.spec.meta.refrigerant} · 부품 {v.partCount}개 · 전체 {v.overallWithHandleMm.width} × {v.overallWithHandleMm.depth} × {v.overallWithHandleMm.height} mm</p>
 <p>자동 검사: {v.failures.length===0?'통과 (회로 연결, 배관 간격, 부품 관통, 전체 치수)':v.failures.join(', ')}</p>
 <h2 style={{marginTop:20}}>냉매 회로</h2><ol className="hr-circuit">{data.routes.routes.map(r=><li key={r.id}><button className={selected===r.id?'active':''} onClick={()=>setSelected(r.id)}>{r.name}</button><span>Ø{r.outerDiameterMm} · {(r.lengthMm/1000).toFixed(2)} m</span></li>)}</ol>
 <p><a href={`${base}/spec.json`} download>사양서(JSON) 받기</a> · <a href={`${base}/model.obj`} download>3D 모델(OBJ) 받기</a></p>
 {data.spec.meta.source&&<p><a href={data.spec.meta.source} target="_blank" rel="noreferrer">근거 자료 원본 ↗</a></p>}</>}</section></div>
 <footer><strong>새 모델 추가</strong><p><Link href="/editor">사양서 편집기</Link>에서 기존 모델을 바탕으로 값을 고쳐 JSON으로 저장할 수 있습니다. 저장소에 반영하려면 specs 폴더에 그 JSON을 넣고 <code>node generator/generate.mjs</code>를 실행하면 이 목록에 나타납니다. 양식은 specs/README.md에 있습니다.</p></footer></main>;
}
