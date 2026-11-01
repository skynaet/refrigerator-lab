'use client';
// Wizard: pick a layout, type the catalogue dimensions, get a complete checked model.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import ModelScene,{type SceneData} from '@/components/model-scene';
import {build,toObj} from '@/generator/build.mjs';
import {TEMPLATES,defaults,fromTemplate} from '@/generator/templates.mjs';
import {COMPRESSORS} from '@/generator/catalog.mjs';
import {WIZARD_KEY,WIZARD_BASE,draftKey} from '@/lib/storage-keys';
import '../hr24/style.css';
import '../editor/editor.css';
type Param={key:string;label:string;unit?:string;min?:number;max?:number;step?:number;type?:string;options?:string[];optionLabels?:Record<string,string>};
type Result={errors:string[];model?:SceneData['model'];routes?:SceneData['routes'];verification?:{failures:string[];overallWithHandleMm:{width:number;depth:number;height:number};partCount:number}};
const TEMPLATE_IDS=Object.keys(TEMPLATES);
function download(name:string,text:string,type:string){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}

export default function NewModelPage(){
 const router=useRouter();
 const [tid,setTid]=useState(TEMPLATE_IDS[0]),[input,setInput]=useState<Record<string,string|number>>(()=>defaults(TEMPLATE_IDS[0]));
 const [result,setResult]=useState<Result|null>(null),[scene,setScene]=useState<SceneData|null>(null),[inputError,setInputError]=useState('');
 const [view,setView]=useState('rear'),[flow,setFlow]=useState(false);
 const t=TEMPLATES[tid as keyof typeof TEMPLATES],params=t.params as Param[];
 // Rebuild 300 ms after the last change.
 useEffect(()=>{const timer=setTimeout(()=>{try{const spec=fromTemplate(tid,input);const out=build(spec) as Result;setInputError('');setResult(out);if(out.model&&out.routes)setScene({model:out.model,routes:out.routes});}
  catch(e){setInputError((e as Error).message);}},300);return()=>clearTimeout(timer);},[tid,input]);
 // Changing the refrigerant switches to a compressor built for it.
 function setField(key:string,value:string){const next={...input,[key]:value};
  if(key==='refrigerant'&&COMPRESSORS.find(c=>c.id===input.compressor)?.refrigerant!==value){const c=COMPRESSORS.find(x=>x.refrigerant===value);if(c)next.compressor=c.id;}
  setInput(next);}
 const pick=(id:string)=>{setTid(id);setInput(defaults(id));setScene(null);setResult(null);};
 const problems=result?[...result.errors,...(result.verification?.failures??[])]:[];
 const v=result?.verification;
 function spec(){return fromTemplate(tid,input);}
 function openInEditor(){try{localStorage.setItem(WIZARD_KEY,JSON.stringify(spec()));localStorage.removeItem(draftKey(WIZARD_BASE));}catch{setInputError('브라우저 저장소를 쓸 수 없어 편집기로 넘길 수 없습니다. 사양서 JSON 저장을 이용하세요.');return;}router.push(`/editor?from=${WIZARD_BASE}`);}

 return <main className="hr-app"><header><div><small>NEW MODEL</small><h1>새 냉장고 <b>만들기</b></h1></div><nav><Link href="/models">모델 목록</Link><Link href="/editor">사양서 편집기</Link><Link href="/diagnose">고장 진단 연습</Link><Link href="/calculator">현장 계산기</Link></nav></header>
 <div className="hr-summary">형태를 고르고 사양서의 외형 치수만 넣으면 부품 배치와 냉매 배관을 자동으로 만듭니다<span>계산은 모두 이 브라우저 안에서 합니다</span><b>{String(input.model)}</b></div>
 <div className="hr-work"><aside className="hr-parts"><h2>1. 형태</h2>
  {TEMPLATE_IDS.map(id=><button key={id} className={tid===id?'active':''} onClick={()=>pick(id)}>{TEMPLATES[id as keyof typeof TEMPLATES].name}</button>)}
  <p className="ed-desc" style={{marginTop:12}}>{t.summary}</p>
  <h2 style={{marginTop:20}}>2. 치수·사양</h2>
  <div className="nw-form">{params.map(q=><label key={q.key} className="nw-field"><span>{q.label}{q.unit&&q.unit!=='개'?` (${q.unit})`:''}</span>
   {q.type==='text'?<input type="text" value={String(input[q.key]??'')} onChange={e=>setInput({...input,[q.key]:e.target.value})}/>
   :q.type==='select'?<select value={String(input[q.key])} onChange={e=>setField(q.key,e.target.value)}>{q.options!.filter(o=>q.key!=='compressor'||COMPRESSORS.find(c=>c.id===o)?.refrigerant===input.refrigerant).map(o=><option key={o} value={o}>{q.optionLabels?.[o]??o}</option>)}</select>
   :<><input type="number" min={q.min} max={q.max} step={q.step??.1} value={Number(input[q.key])} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n))setInput({...input,[q.key]:n});}}/><small>{q.min}~{q.max}</small></>}
  </label>)}</div>
  <button className="ed-link" onClick={()=>setInput(defaults(tid))}>기본값으로</button>
 </aside>
 <section className="hr-model"><div className="hr-tools"><select aria-label="시점" value={view} onChange={e=>setView(e.target.value)}><option value="rear">후면 입체</option><option value="front">전면 입체</option><option value="back">후면 정면</option><option value="left">좌측면</option><option value="machine">기계실 확대</option></select><button className={flow?'active':''} onClick={()=>setFlow(!flow)}>운전 표시</button></div>
  <ModelScene data={scene} fitKey={tid} selected="" onSelect={()=>{}} view={view} transparent flow={flow} door={false}/>
  <p className="hr-note">외형 치수 외의 벽 두께, 부품 크기와 위치, 배관 경로는 형태별 업계 일반값과 자동 경로로 채웁니다. 편집기에서 세부를 고칠 수 있습니다.</p></section>
 <section className="hr-source ed-side"><h2>3. 결과</h2>
  {inputError?<p className="ed-fail">{inputError}</p>:!result?<p>생성 중…</p>:problems.length===0?<p className="ed-ok">자동 검사 통과: 회로 연결, 배관 간격, 부품 관통, 전체 치수</p>
   :<><p className="ed-fail">문제 {problems.length}건</p><ul className="ed-problems">{problems.map((p,i)=><li key={i}>{p}</li>)}</ul></>}
  {v&&<p>부품 {v.partCount}개 · 전체 {v.overallWithHandleMm.width} × {v.overallWithHandleMm.depth} × {v.overallWithHandleMm.height} mm</p>}
  <div className="ed-files" style={{marginTop:14}}><button className="active" disabled={!!inputError} onClick={openInEditor}>편집기에서 이어서 수정</button>
   <button disabled={!!inputError} onClick={()=>{const s=spec();download(`${s.id}.json`,JSON.stringify(s,null,2),'application/json');}}>사양서 JSON 저장</button>
   <button disabled={!result?.model} onClick={()=>{if(result?.model)download(`${spec().id}.obj`,toObj(result.model,String(input.model)) as string,'model/obj');}}>3D 모델 OBJ 저장</button></div>
 </section></div>
 <footer><strong>형태 추가</strong><p>새 형태(상부 기계실형, 2도어 등)는 generator/templates.mjs에 배치 규칙을 추가하면 이 목록에 나타납니다.</p></footer></main>;
}
