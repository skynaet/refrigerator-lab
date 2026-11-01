'use client';
// Spec editor: edit a refrigerator spec in the browser; the generator runs client-side
// after each change and the 3D preview and checks update without a server.
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import ModelScene,{type SceneData} from '@/components/model-scene';
import {build,toObj} from '@/generator/build.mjs';
import {asset} from '@/lib/asset';
import {Fields,type Change} from './fields';
import DrawingView from './drawing';
import {translateComponent,MOVABLE_TYPES} from '@/generator/transform.mjs';
import {COMPRESSORS,resolveCompressor} from '@/generator/catalog.mjs';
import {CAD_EXTENSIONS,cadToModel,modelToCad} from '@/generator/cad.mjs';
import {parseCadFile,saveCadBytes,loadCadBytes,type CadFile} from '@/lib/cad-browser';
import {WIZARD_KEY,WIZARD_BASE,draftKey} from '@/lib/storage-keys';
import '../hr24/style.css';
import './editor.css';
type Item={id:string;name:string;type?:string;notes?:string;[k:string]:unknown};
type Spec={schema:string;id:string;meta:{model:string;[k:string]:unknown};components:Item[];circuit:Item[];[k:string]:unknown};
type Result={errors:string[];model?:SceneData['model'];routes?:{routes:{id:string;name:string;outerDiameterMm:number;lengthMm:number;points:number[][]}[]};verification?:{failures:string[];overallWithHandleMm:{width:number;depth:number;height:number};partCount:number}};
const readDraft=(id:string)=>{try{return localStorage.getItem(draftKey(id));}catch{return null;}};
const writeDraft=(id:string,text:string|null)=>{try{if(text===null)localStorage.removeItem(draftKey(id));else localStorage.setItem(draftKey(id),text);}catch{/* storage unavailable: drafts are a convenience only */}};
function setIn(obj:unknown,path:(string|number)[],value:unknown):unknown{
 if(!path.length)return value;const [k,...rest]=path;
 const copy=(Array.isArray(obj)?[...obj]:{...(obj as object)}) as Record<string|number,unknown>;copy[k]=setIn(copy[k],rest,value);return copy;}
const mentions=(text:string,id:string)=>new RegExp(`(^|[^a-z0-9_])${id}([^a-z0-9_]|$)`).test(text);
const EMPTY_BASE='empty';
const emptySpec=():Spec=>({schema:'refrigerator-spec/1',id:'cad-model',meta:{model:'새 CAD 모델',method:'가져온 CAD 형상. 부품을 추가하거나 배관을 연결할 수 있습니다.'},components:[],circuit:[]});
function download(name:string,text:string,type:string){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}

export default function EditorPage(){
 const [index,setIndex]=useState<{id:string;model:string}[]>([]),[baseId,setBaseId]=useState('');
 const [original,setOriginal]=useState<Spec|null>(null),[spec,setSpec]=useState<Spec|null>(null),[history,setHistory]=useState<Spec[]>([]);
 const [result,setResult]=useState<Result|null>(null),[scene,setScene]=useState<SceneData|null>(null),[restored,setRestored]=useState(false),[specBase,setSpecBase]=useState('');
 const [selected,setSelected]=useState('compressor'),[view,setView]=useState('rear'),[transparent,setTransparent]=useState(true),[flow,setFlow]=useState(false),[door,setDoor]=useState(false),[pane,setPane]=useState<'3d'|'2d'>('3d');
 const [rawDraft,setRawDraft]=useState<string|null>(null),[rawError,setRawError]=useState(''),[fileError,setFileError]=useState('');
 const fileInput=useRef<HTMLInputElement>(null),cadInput=useRef<HTMLInputElement>(null);
 const [cadFiles,setCadFiles]=useState<Record<string,CadFile>>({}),[cadBusy,setCadBusy]=useState('');
 // Port picking on a CAD part: name to write, and how far the port sits off the clicked surface.
 const [pick,setPick]=useState<{index:number;id:string;name:string;lift:number}|null>(null),[portName,setPortName]=useState(''),[portLift,setPortLift]=useState(15);
 useEffect(()=>{fetch(asset('/models/index.json')).then(r=>r.json() as Promise<{models:{id:string;model:string}[]}>).then(d=>{
  // A spec handed over from the /new wizard is offered as an extra base model.
  let wizard:Spec|null=null;try{const w=localStorage.getItem(WIZARD_KEY);if(w)wizard=JSON.parse(w) as Spec;}catch{wizard=null;}
  const list=[...d.models,...(wizard?[{id:WIZARD_BASE,model:`${wizard.meta.model} (새로 만든 모델)`}]:[]),{id:EMPTY_BASE,model:'빈 모델 (CAD 가져오기용)'}];setIndex(list);
  const fromWizard=wizard&&new URLSearchParams(location.search).get('from')===WIZARD_BASE;setBaseId(fromWizard?WIZARD_BASE:d.models[0]?.id??'');}).catch(()=>setIndex([]));},[]);
 // Load the base spec (or the saved draft for it).
 useEffect(()=>{if(!baseId)return;let live=true;
  const source=baseId===EMPTY_BASE?Promise.resolve(emptySpec()):baseId===WIZARD_BASE?Promise.resolve(JSON.parse(localStorage.getItem(WIZARD_KEY)??'null') as Spec):fetch(asset(`/models/${baseId}/spec.json`)).then(r=>r.json() as Promise<Spec>);
  source.then(s=>{if(!live||!s)return;
   const draft=readDraft(baseId);let start=s,fromDraft=false;
   if(draft){try{const d=JSON.parse(draft) as Spec;if(JSON.stringify(d)!==JSON.stringify(s)){start=d;fromDraft=true;}}catch{writeDraft(baseId,null);}}
   setOriginal(s);setSpec(start);setSpecBase(baseId);setHistory([]);setRestored(fromDraft);setScene(null);setSelected('compressor');}).catch(()=>{if(live)setFileError('사양서를 불러오지 못했습니다.');});
  return()=>{live=false;};},[baseId]);
 // CAD files the spec names but this session has not parsed yet: restore them from IndexedDB.
 const cadNames=[...new Set((spec?.components??[]).filter(c=>c.type==='cad-part'&&typeof c.file==='string').map(c=>c.file as string))].filter(n=>!cadFiles[n]).join('|');
 useEffect(()=>{if(!cadNames)return;let live=true;
  void (async()=>{for(const name of cadNames.split('|')){const bytes=await loadCadBytes(name).catch(()=>undefined);if(!bytes||!live)continue;
   setCadBusy(`${name} 다시 읽는 중…`);try{const f=await parseCadFile(name,bytes);if(live)setCadFiles(m=>({...m,[name]:f}));}catch{/* build() reports the missing file */}}if(live)setCadBusy('');})();
  return()=>{live=false;};},[cadNames]);
 // Rebuild shortly after each edit; keep the last good 3D while the spec is broken.
 useEffect(()=>{if(!spec)return;
  const t=setTimeout(()=>{let out:Result;try{out=build(spec,{cad:cadFiles}) as Result;}catch(e){out={errors:[`생성 중 오류: ${(e as Error).message}`]};}
   setResult(out);if(out.model&&out.routes)setScene({model:out.model,routes:out.routes});
   // Drafts are keyed by the base the spec was loaded from, not the currently selected base.
   if(specBase)writeDraft(specBase,original&&JSON.stringify(spec)===JSON.stringify(original)?null:JSON.stringify(spec));},250);
  return()=>clearTimeout(t);},[spec,specBase,original,cadFiles]);
 const change:Change=(path,value)=>{if(!spec)return;setHistory(h=>[...h.slice(-49),spec]);setSpec(setIn(spec,path,value) as Spec);};
 const undo=()=>{const prev=history.at(-1);if(prev){setHistory(history.slice(0,-1));setSpec(prev);}};
 const problems=result?[...result.errors,...(result.verification?.failures??[])]:[];
 const items=spec?[...spec.components.map(c=>({...c,kind:'component'})),...spec.circuit.map(c=>({...c,kind:'circuit'}))]:[];
 const bad=new Set(items.filter(i=>problems.some(p=>mentions(p,i.id))).map(i=>i.id));
 const listIndex=spec?spec.components.findIndex(c=>c.id===selected):-1,circuitIndex=spec?spec.circuit.findIndex(c=>c.id===selected):-1;
 const current=listIndex>=0?spec!.components[listIndex]:circuitIndex>=0?spec!.circuit[circuitIndex]:null;
 const currentPath=listIndex>=0?['components',listIndex]:['circuit',circuitIndex];
 const v=result?.verification;
 const movable=new Set((spec?.components??[]).filter(c=>c.type&&MOVABLE_TYPES.includes(c.type)&&c.id!=='cabinet'&&!c.id.startsWith('door')).map(c=>c.id));
 const names=Object.fromEntries((spec?.components??[]).map(c=>[c.id,c.name]));
 function moveComponent(id:string,d:[number,number,number]){if(!spec)return;const i=spec.components.findIndex(c=>c.id===id);if(i<0)return;
  try{change(['components',i],translateComponent(spec.components[i],d));}catch(e){setFileError((e as Error).message);}}
 async function upload(file:File){setFileError('');try{const s=JSON.parse(await file.text()) as Spec;
  if(s?.schema!=='refrigerator-spec/1')throw Error('schema가 "refrigerator-spec/1"이 아닙니다');setHistory(h=>spec?[...h.slice(-49),spec]:h);setSpec(s);setRestored(false);}
  catch(e){setFileError(`불러오기 실패: ${(e as Error).message}`);}}
 // Import a CAD file as a new part, standing on the floor at the model centre.
 async function importCad(file:File){if(!spec)return;setFileError('');setCadBusy(`${file.name} 읽는 중…`);
  try{const bytes=new Uint8Array(await file.arrayBuffer()),parsed=await parseCadFile(file.name,bytes);await saveCadBytes(file.name,bytes).catch(()=>undefined);
   setCadFiles(m=>({...m,[file.name]:parsed}));
   const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const m of parsed.meshes)for(let i=0;i<m.positions.length;i++){const a=i%3;lo[a]=Math.min(lo[a],m.positions[i]);hi[a]=Math.max(hi[a],m.positions[i]);}
   const r=(x:number)=>Math.round(x*100)/100,ids=new Set(spec.components.map(c=>c.id));let n=1;while(ids.has(`cad_${n}`))n++;
   const part:Item={id:`cad_${n}`,type:'cad-part',name:file.name.replace(/\.[^.]+$/,''),basis:'drawing',notes:`가져온 CAD (${parsed.triangles.toLocaleString()} 삼각형).`,file:file.name,
    transform:{translate:[r(-(lo[0]+hi[0])/2),r(-(lo[1]+hi[1])/2),r(-lo[2])],rotateDeg:[0,0,0],scale:1},ports:{}};
   setHistory(h=>[...h.slice(-49),spec]);setSpec({...spec,components:[...spec.components,part]});setSelected(part.id);}
  catch(e){setFileError(`CAD 불러오기 실패: ${(e as Error).message}`);}finally{setCadBusy('');}}
 // Clicked point (model mm) + outward normal -> port in the CAD file's own coordinates.
 function placePort(mm:[number,number,number],normal:[number,number,number]){if(!spec||!pick)return;const c=spec.components[pick.index];if(!c||c.id!==pick.id)return;
  const len=Math.hypot(...normal)||1,local=modelToCad(c,mm.map((v,i)=>v+normal[i]/len*pick.lift));
  change(['components',pick.index,'ports'],{...((c.ports??{}) as Record<string,number[]>),[pick.name]:local});setPick(null);}
 const markers=current?.type==='cad-part'?Object.entries((current.ports??{}) as Record<string,number[]>).map(([k,q])=>({label:k,mm:cadToModel(current,q)})):[];
 function removeComponent(i:number){if(!spec)return;setHistory(h=>[...h.slice(-49),spec]);setSpec({...spec,components:spec.components.filter((_,j)=>j!==i)});setSelected('');}
 const raw=rawDraft??(spec?JSON.stringify(spec,null,2):'');
 function applyRaw(){try{const s=JSON.parse(raw) as Spec;setHistory(h=>spec?[...h.slice(-49),spec]:h);setSpec(s);setRawDraft(null);setRawError('');}catch(e){setRawError(`JSON 형식 오류: ${(e as Error).message}`);}}

 return <main className="hr-app"><header><div><small>SPEC EDITOR</small><h1>사양서 <b>편집기</b></h1></div><nav><Link href="/new">새로 만들기</Link><Link href="/models">모델 목록</Link><Link href="/">HR24B 도면 대조</Link><Link href="/diagnose">고장 진단 연습</Link><Link href="/calculator">현장 계산기</Link></nav></header>
 <div className="hr-summary">값을 바꾸면 0.25초 뒤 브라우저에서 모델을 다시 생성하고 검사합니다<span>작업 내용은 이 브라우저에 자동 저장됩니다</span><b>{spec?.meta.model}</b></div>
 <div className="hr-work"><aside className="hr-parts"><h2>기준 모델</h2>
  <select className="ed-base" aria-label="기준 모델" value={baseId} onChange={e=>setBaseId(e.target.value)}>{index.map(m=><option key={m.id} value={m.id}>{m.model}</option>)}</select>
  {restored&&<p className="ed-note">저장된 작업을 불러왔습니다. <button className="ed-link" onClick={()=>{if(original){setHistory(h=>spec?[...h,spec]:h);setSpec(original);setRestored(false);}}}>원본으로 되돌리기</button></p>}
  <h2 style={{marginTop:20}}>부품</h2>{items.filter(i=>i.kind==='component').map(i=><button key={i.id} className={selected===i.id?'active':''} onClick={()=>setSelected(i.id)}>{bad.has(i.id)&&<i className="ed-bad" title="검사 문제"/>}{i.name}</button>)}
  <h2 style={{marginTop:20}}>냉매 회로</h2>{items.filter(i=>i.kind==='circuit').map((i,n)=><button key={i.id} className={selected===i.id?'active':''} onClick={()=>setSelected(i.id)}><span>{String(n+1).padStart(2,'0')}</span>{bad.has(i.id)&&<i className="ed-bad" title="검사 문제"/>}{i.name}</button>)}
 </aside>
 <section className="hr-model"><div className="hr-tools"><select aria-label="시점" value={view} onChange={e=>setView(e.target.value)}><option value="rear">후면 입체</option><option value="back">후면 정면</option><option value="front">전면 입체</option><option value="left">좌측면</option><option value="machine">기계실 확대</option></select><button className={transparent?'active':''} onClick={()=>setTransparent(!transparent)}>외함 투명</button><button onClick={()=>setDoor(!door)}>문 {door?'닫기':'열기'}</button><button onClick={()=>setFlow(!flow)} className={flow?'active':''}>운전 표시</button><button onClick={undo} disabled={!history.length}>되돌리기</button></div>
  <div className="hr-tools ed-pane"><button className={pane==='3d'?'active':''} onClick={()=>setPane('3d')}>3D</button><button className={pane==='2d'?'active':''} onClick={()=>setPane('2d')}>도면 맞춤 (2D)</button></div>
  {pick&&<p className="ed-note ed-pickbar">“{pick.name}” 포트: 3D 화면에서 {names[pick.id]} 표면을 클릭하세요. <button className="ed-link" onClick={()=>setPick(null)}>취소</button></p>}
  {pane==='3d'?<ModelScene data={scene} fitKey={baseId} selected={selected} onSelect={id=>{if(spec&&[...spec.components,...spec.circuit].some(c=>c.id===id))setSelected(id);}} view={view} transparent={transparent} flow={flow} door={door} pickTarget={pick?.id??null} onPick={placePort} markers={markers}/>
  :<DrawingView model={scene?.model??null} routes={scene?.routes??null} movable={movable} names={names} bad={bad} selected={selected} onSelect={id=>{if(spec&&[...spec.components,...spec.circuit].some(c=>c.id===id))setSelected(id);}} onMove={moveComponent}/>}
  <div className="ed-editor">{current?<><h2>{current.name} <small>{String(current.type??'냉매 배관')} · {current.id}</small></h2>
   {typeof current.notes==='string'&&<p className="ed-desc">{current.notes}</p>}
   {current.type==='hermetic-compressor'&&listIndex>=0&&<label className="ed-row ed-wide ed-catalog"><span>카탈로그 모델</span>
    <select value={typeof current.model==='string'?current.model:''} onChange={e=>{const id=e.target.value,{shell:_s,base:_b,stubs:_t,model:_m,...rest}=current;
     if(id)change(['components',listIndex],{...rest,model:id});else change(['components',listIndex],{...rest,...resolveCompressor(current)} as Item);}}>
     <option value="">직접 입력 (아래 치수 사용)</option>{COMPRESSORS.map(c=><option key={c.id} value={c.id}>{c.manufacturer} {c.model} · {c.refrigerant}{c.hp?` · ${c.hp}HP`:''}</option>)}</select></label>}
   {current.type==='hermetic-compressor'&&current.model?<p className="ed-help">{(()=>{const c=COMPRESSORS.find(x=>x.id===current.model);return c?.source?.url?<>데이터시트: <a href={c.source.url} target="_blank" rel="noreferrer">{c.manufacturer} {c.model}</a>{c.source.page?` (${c.source.page}쪽)`:''}. 쉘·받침·연결관 치수는 카탈로그 값을 씁니다. 직접 입력으로 바꾸면 수정할 수 있습니다.</>:'일반값 항목입니다. 직접 입력으로 바꾸면 치수를 수정할 수 있습니다.';})()}</p>:null}
   {current.type==='cad-part'&&!cadFiles[String(current.file)]&&<p className="ed-fail">CAD 파일 “{String(current.file)}”이 이 브라우저에 없습니다. 같은 이름의 파일을 “CAD 불러오기”로 다시 여세요.</p>}
   <Fields value={current} path={currentPath} onChange={change} pathList={circuitIndex>=0}/>
   {listIndex>=0&&<div className="ed-files" style={{marginTop:10}}>
    {current.type==='cad-part'&&<span className="ed-portpick"><input aria-label="포트 이름" placeholder={`p${Object.keys((current.ports??{}) as object).length+1}`} value={portName} onChange={e=>setPortName(e.target.value.replace(/[^A-Za-z0-9_]/g,''))}/>
     <label>표면에서 <input type="number" aria-label="표면에서 띄울 거리" value={portLift} onChange={e=>setPortLift(Number(e.target.value)||0)}/> mm</label>
     <button className={pick?'active':''} disabled={!cadFiles[String(current.file)]} onClick={()=>{const ports=(current.ports??{}) as object;let n=Object.keys(ports).length+1;while(`p${n}` in ports)n++;
      setPane('3d');setPick({index:listIndex,id:current.id,name:portName||`p${n}`,lift:portLift});setPortName('');}}>3D에서 포트 찍기</button></span>}
    <button onClick={()=>removeComponent(listIndex)}>이 부품 삭제</button></div>}
   {current.type==='cad-part'&&<p className="ed-help">포트는 “3D에서 포트 찍기”로 부품 표면을 클릭해 정하거나(같은 이름이면 덮어씀) CAD 원본 좌표(mm)로 직접 적습니다. 노란 점이 현재 포트입니다. 배관 경로에서 “{current.id}.포트이름”으로 연결합니다. 회전은 X→Y→Z 순서(도)입니다.</p>}
   <p className="ed-help">단위 mm. 좌표는 정면 기준 X 오른쪽, Y 뒤쪽, Z 위. 숫자 칸에서 ↑↓는 1mm, Shift+↑↓는 10mm씩 바꿉니다.{circuitIndex>=0&&' 경로의 ＋는 경유점, ⤳는 자동 경로 구간(부품과 다른 배관을 피해 경로를 찾음)을 추가하고 ✕는 삭제합니다. 포트 기준 점(port + offset)은 부품을 옮기면 함께 움직입니다.'}</p></>
   :<p className="ed-desc">왼쪽 목록이나 3D 화면에서 부품을 고르세요.</p>}</div>
 </section>
 <section className="hr-source ed-side"><h2>검사 결과</h2>
  {!result?<p>생성 중…</p>:problems.length===0?<p className="ed-ok">통과: 회로 연결, 배관 간격, 부품 관통, 전체 치수</p>
   :<><p className="ed-fail">문제 {problems.length}건. 고치면 3D가 다시 갱신됩니다.</p><ul className="ed-problems">{problems.map((p,i)=><li key={i}>{p}</li>)}</ul></>}
  {v&&<p>부품 {v.partCount}개 · 전체 {v.overallWithHandleMm.width} × {v.overallWithHandleMm.depth} × {v.overallWithHandleMm.height} mm</p>}
  {result?.routes&&<ol className="hr-circuit">{result.routes.routes.map(r=><li key={r.id}><button className={selected===r.id?'active':''} onClick={()=>setSelected(r.id)}>{r.name}</button><span>Ø{r.outerDiameterMm} · {(r.lengthMm/1000).toFixed(2)} m</span></li>)}</ol>}
  <h2 style={{marginTop:20}}>파일</h2>
  <div className="ed-files"><button onClick={()=>spec&&download(`${spec.id}.json`,JSON.stringify(spec,null,2),'application/json')}>사양서 JSON 저장</button>
   <button disabled={!result?.model} onClick={()=>spec&&result?.model&&download(`${spec.id}.obj`,toObj(result.model,spec.meta.model) as string,'model/obj')}>3D 모델 OBJ 저장</button>
   <button onClick={()=>fileInput.current?.click()}>사양서 JSON 열기</button>
   <button disabled={!!cadBusy} onClick={()=>cadInput.current?.click()}>CAD 불러오기</button>
   <input ref={cadInput} type="file" accept={CAD_EXTENSIONS.map(e=>'.'+e).join(',')} hidden onChange={e=>{const f=e.target.files?.[0];if(f)void importCad(f);e.target.value='';}}/>
   <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></div>
  {fileError&&<p className="ed-fail">{fileError}</p>}
  {cadBusy&&<p className="ed-help">{cadBusy}</p>}
  <p className="ed-help">열기는 파일을 이 브라우저 안에서만 읽습니다. 서버로 보내지 않습니다. CAD는 STEP·IGES·STL·OBJ를 읽고, 원본은 이 브라우저에만 보관합니다.</p>
  <details className="ed-raw"><summary>JSON 직접 편집</summary><textarea aria-label="사양서 JSON" value={raw} spellCheck={false} onChange={e=>setRawDraft(e.target.value)}/><button onClick={applyRaw}>적용</button>{rawDraft!==null&&<button onClick={()=>{setRawDraft(null);setRawError('');}}>편집 취소</button>}{rawError&&<p className="ed-fail">{rawError}</p>}</details>
 </section></div>
 <footer><strong>사양서 양식</strong><p>부품 종류와 항목 설명은 저장소의 refrigerator/specs/README.md에 있습니다. 새 부품 추가나 삭제는 JSON 직접 편집에서 할 수 있습니다.</p></footer></main>;
}
