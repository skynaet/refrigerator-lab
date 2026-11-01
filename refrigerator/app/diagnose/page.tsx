'use client';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {buildChoices, explainOthers, judge, pickScenario} from '@/lib/diagnosis';
import type {CheckId, Choice, Direction, Scenario} from '@/lib/diagnosis';
import {parseDiagnosisRecords, summarizeDiagnosisRecords} from '@/lib/diagnosis-records';
import type {DiagnosisRecord} from '@/lib/diagnosis-records';
import {DIAGNOSIS_RECORDS_KEY} from '@/lib/storage-keys';
import CircuitDiagram from './circuit-diagram';
import '../hr24/style.css';
import './diagnose.css';

type Practice = {
  scenario: Scenario;
  choices: Choice[];
  answerId: string | null;
  solvedCount: number;
  revealedCheckIds: CheckId[];
  records: DiagnosisRecord[];
};
const badges: Record<Direction, {className: string; symbol: string}> = {
  '높음': {className: 'diagnose-high', symbol: '↑'},
  '낮음': {className: 'diagnose-low', symbol: '↓'},
  '정상': {className: 'diagnose-normal', symbol: '＝'},
};

export default function DiagnosePage() {
  const [practice, setPractice] = useState<Practice | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  // 서버와 첫 클라이언트 렌더는 동일하게 유지하고 마운트 후에만 추첨한다.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let records: DiagnosisRecord[] = [];
      try {
        records = parseDiagnosisRecords(localStorage.getItem(DIAGNOSIS_RECORDS_KEY));
      } catch {
        setStorageUnavailable(true);
      }
      setPractice({scenario: pickScenario(), choices: buildChoices(), answerId: null, solvedCount: 0, revealedCheckIds: [], records});
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (practice?.answerId) resultRef.current?.focus();
  }, [practice?.answerId]);
  const records = practice?.records;
  useEffect(() => {
    if (!records) return;
    const frame = requestAnimationFrame(() => {
      try {
        if (records.length) localStorage.setItem(DIAGNOSIS_RECORDS_KEY, JSON.stringify({version: 1, records}));
        else localStorage.removeItem(DIAGNOSIS_RECORDS_KEY);
      } catch {
        setStorageUnavailable(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [records]);

  function revealCheck(id: CheckId) {
    setPractice(current => {
      if (!current || current.answerId !== null || current.revealedCheckIds.includes(id)) return current;
      return {...current, revealedCheckIds: [...current.revealedCheckIds, id]};
    });
  }

  function answer(answerId: string) {
    setPractice(current => {
      if (!current || current.answerId !== null) return current;
      const result = judge(current.scenario.id, answerId);
      return {...current, answerId, solvedCount: current.solvedCount + 1,
        records: [...current.records, {scenarioId: current.scenario.id, correct: result.correct, checkCount: current.revealedCheckIds.length}]};
    });
  }

  function nextQuestion() {
    if (!practice || practice.answerId === null) return;
    const scenario = pickScenario(Math.random, practice.scenario.id);
    const choices = buildChoices();
    setPractice(current => current ? {...current, scenario, choices, answerId: null, revealedCheckIds: []} : current);
    questionRef.current?.focus();
  }

  const result = practice?.answerId ? judge(practice.scenario.id, practice.answerId) : null;
  const score = summarizeDiagnosisRecords(records ?? []);

  // 3D 화면 링크의 자동 미리 불러오기가 진단 화면에서 three.js를 내려받지 않도록 한다.
  return <main className="hr-app diagnose-app">
    <header>
      <div><small>냉동 사이클 학습</small><h1>냉매 회로 <b>고장 진단 연습</b></h1></div>
      <nav aria-label="화면 이동"><Link href="/" prefetch={false}>HR24B 홈</Link><Link href="/models" prefetch={false}>모델 목록</Link><Link href="/reference" prefetch={false}>T-19-HC 시뮬레이터</Link><Link href="/calculator" prefetch={false}>현장 계산기</Link></nav>
    </header>
    <div className="diagnose-content">
      <p className="diagnose-disclaimer">교과서 수준의 모세관 방식 냉동 사이클 연습입니다. 제조사 서비스 데이터나 특정 모델의 실측값이 아닙니다.</p>
      <details className="diagnose-basics">
        <summary>비교 기준 · 과열도와 과냉도란?</summary>
        <p>압축기 운전 중, 주위 온도와 부하가 비슷한 정상 운전 상태와 비교합니다. 한 번에 하나의 고장만 가정합니다.</p>
        <p>과열도는 흡입 냉매 온도가 저압의 포화온도보다 높은 정도, 과냉도는 응축기 출구 액냉매 온도가 고압의 포화온도보다 낮은 정도입니다. 증발기 온도는 저압에 대응하는 냉매 포화온도이며, 코일 전체의 표면 온도는 아닙니다.</p>
        <p>모세관 방식은 냉매량·풍량·부하에 따라 경향이 달라집니다. 문제에 제시된 단서와 함께 판단하세요.</p>
        <p>측정한 게이지 압력과 배관 온도로 과열도·과냉도를 구하려면 <Link href="/calculator" prefetch={false}>현장 계산기</Link>를 쓰세요(R290·R600a).</p>
      </details>
      {!practice ? <output>문제를 준비하고 있습니다…</output> : <>
        <section className="diagnose-score" aria-label="누적 성적">
          <p aria-live="polite">누적 성적: 맞힌 수 <strong>{score.correctCount}</strong> / 푼 수 <strong>{score.solvedCount}</strong>
            {' · '}평균 확인 <strong>{score.averageChecks.toFixed(1)}회</strong></p>
          <button type="button" disabled={!score.solvedCount} onClick={() => setPractice(current => current ? {...current, records: []} : current)}>누적 기록 초기화</button>
          <p className="diagnose-storage-note">{storageUnavailable ? '브라우저 저장소를 사용할 수 없어 이 탭에서만 기록합니다.' : '이 브라우저에 시나리오별 정답 여부와 답하기 전 확인 횟수를 저장합니다.'}</p>
        </section>
        <div className="diagnose-progress">
          <h2 ref={questionRef} tabIndex={-1}>문제 {practice.solvedCount + (practice.answerId === null ? 1 : 0)}</h2>
          <p aria-live="polite">{result ? '답하기 전 확인' : '확인한 항목'} <strong>{practice.revealedCheckIds.length}</strong> / {practice.scenario.checks.length}개</p>
        </div>
        <div className="diagnose-grid">
          <section className="diagnose-panel" aria-labelledby="diagnose-check-title">
            <h2>기본 증상</h2>
            <p>고내 온도: <strong>{practice.scenario.symptoms['고내 온도']}</strong> (정상 대비)</p>
            <h3 id="diagnose-check-title">확인 항목</h3>
            <p className="diagnose-check-help">필요한 항목을 골라 결과를 확인하세요. 확인 없이도 언제든 원인을 고를 수 있습니다. 같은 항목은 한 번만 셉니다.</p>
            <div className="diagnose-checks">{practice.scenario.checks.map(check => {
              const revealed = practice.revealedCheckIds.includes(check.id);
              const expanded = revealed || result !== null;
              const keyCheck = result !== null && practice.scenario.keyCheckIds.includes(check.id);
              const badge = check.direction ? badges[check.direction] : null;
              return <div key={check.id} className={`diagnose-check${keyCheck ? ' diagnose-key-check' : ''}`}>
                <button type="button" aria-expanded={expanded} aria-controls={`diagnose-check-${check.id}`}
                  disabled={expanded} onClick={() => revealCheck(check.id)}>
                  <span>{check.label}</span><span>{expanded ? keyCheck ? '핵심 단서' : '결과' : '확인하기'}</span>
                </button>
                <div id={`diagnose-check-${check.id}`} hidden={!expanded}>
                  {expanded && <>
                    <p>{badge ? <span className={`diagnose-badge ${badge.className}`}><span aria-hidden="true">{badge.symbol}</span> {check.result}</span> : check.result}</p>
                    {result && <p className="diagnose-check-status">{revealed ? '답하기 전 확인함' : '답하기 전 미확인 · 해설에서 공개'}</p>}
                  </>}
                </div>
              </div>;
            })}</div>
          </section>
          <section className="diagnose-panel" aria-labelledby="diagnose-choice-title">
            <h2 id="diagnose-choice-title">가장 알맞은 원인을 고르세요</h2>
            <div className="diagnose-choices">{practice.choices.map(choice => {
              const isCorrect = result?.correctId === choice.id;
              const isSelected = practice.answerId === choice.id;
              return <button key={choice.id} type="button" disabled={result !== null}
                aria-pressed={isSelected}
                className={isCorrect ? 'diagnose-choice-correct' : isSelected ? 'diagnose-choice-wrong' : ''}
                onClick={() => answer(choice.id)}>
                {choice.name}{isCorrect ? ' · 정답' : isSelected ? ' · 선택한 답' : ''}
              </button>;
            })}</div>
            <div aria-live="polite" aria-atomic="true">
              {result && <div className="diagnose-result" ref={resultRef} tabIndex={-1}>
                <h3>{result.correct ? '정답입니다' : '오답입니다'}</h3>
                <p><strong>정답: {result.correctName}</strong></p>
                <p>{result.explanation}</p>
                <section className="diagnose-key-summary" aria-labelledby="diagnose-key-title">
                  <h4 id="diagnose-key-title">핵심 단서 · 답하기 전 확인 여부</h4>
                  <p>이번 문제에서 원인을 가르는 항목입니다. 미확인 결과는 해설에서 공개하며 확인 횟수에는 더하지 않습니다.</p>
                  <ul>{practice.scenario.checks.filter(check => practice.scenario.keyCheckIds.includes(check.id)).map(check => <li key={check.id}>
                    <strong>{check.label}: {check.result}</strong>
                    <span className="diagnose-check-status">{practice.revealedCheckIds.includes(check.id) ? '답하기 전 확인함' : '답하기 전 미확인'}</span>
                  </li>)}</ul>
                </section>
                <section className="diagnose-field-guide" aria-label="고장 위치와 현장 확인 순서">
                  <h4>회로에서 보는 고장 위치</h4>
                  <CircuitDiagram location={practice.scenario.circuitLocation}/>
                  <Link className="diagnose-circuit-link" href="/reference" prefetch={false}>3D 배관에서 보기</Link>
                  <h4>현장 확인 순서</h4>
                  <p>운전 조건을 맞춰 여러 단서를 함께 확인하세요. 지표 하나만으로 고장을 확정하지 않습니다.</p>
                  <ol>{practice.scenario.fieldChecks.map(check => <li key={check}>{check}</li>)}</ol>
                  <Link className="diagnose-circuit-link" href="/calculator" prefetch={false}>측정값으로 과열도·과냉도 계산하기</Link>
                  <p className="diagnose-safety"><strong>안전:</strong> {practice.scenario.safetyNote}</p>
                </section>
                <details className="diagnose-alternatives">
                  <summary>다른 보기가 정답이 아닌 이유</summary>
                  <p>이 연습의 보기별 가정과 다른 항목만 비교합니다. 실제 경향은 운전 조건에 따라 달라질 수 있습니다.</p>
                  {explainOthers(result.correctId).map(alternative => <section key={alternative.id}>
                    <h4>{alternative.name}</h4>
                    <ul>{alternative.differences.map(({parameter, expected, actual}) => <li key={parameter}>
                      {parameter}: 보기 <strong>{expected}</strong> · 이 문제 <strong>{actual}</strong>
                    </li>)}</ul>
                  </section>)}
                </details>
                <button type="button" className="diagnose-next" onClick={nextQuestion}>다음 문제</button>
              </div>}
            </div>
          </section>
        </div>
      </>}
    </div>
  </main>;
}
