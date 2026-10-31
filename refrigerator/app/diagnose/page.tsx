'use client';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {PARAMETERS, buildChoices, judge, pickScenario} from '@/lib/diagnosis';
import type {Choice, Direction, Scenario} from '@/lib/diagnosis';
import '../hr24/style.css';
import './diagnose.css';

type Practice = {
  scenario: Scenario;
  choices: Choice[];
  answerId: string | null;
  correctCount: number;
  solvedCount: number;
};
const badges: Record<Direction, {className: string; symbol: string}> = {
  '높음': {className: 'diagnose-high', symbol: '↑'},
  '낮음': {className: 'diagnose-low', symbol: '↓'},
  '정상': {className: 'diagnose-normal', symbol: '＝'},
};

export default function DiagnosePage() {
  const [practice, setPractice] = useState<Practice | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  // 서버와 첫 클라이언트 렌더는 동일하게 유지하고 마운트 후에만 추첨한다.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPractice({scenario: pickScenario(), choices: buildChoices(), answerId: null, correctCount: 0, solvedCount: 0});
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (practice?.answerId) resultRef.current?.focus();
  }, [practice?.answerId]);

  function answer(answerId: string) {
    setPractice(current => {
      if (!current || current.answerId !== null) return current;
      const result = judge(current.scenario.id, answerId);
      return {...current, answerId, correctCount: current.correctCount + Number(result.correct), solvedCount: current.solvedCount + 1};
    });
  }

  function nextQuestion() {
    if (!practice || practice.answerId === null) return;
    const scenario = pickScenario(Math.random, practice.scenario.id);
    const choices = buildChoices();
    setPractice(current => current ? {...current, scenario, choices, answerId: null} : current);
    questionRef.current?.focus();
  }

  const result = practice?.answerId ? judge(practice.scenario.id, practice.answerId) : null;

  return <main className="hr-app diagnose-app">
    <header>
      <div><small>냉동 사이클 학습</small><h1>냉매 회로 <b>고장 진단 연습</b></h1></div>
      <nav aria-label="화면 이동"><Link href="/">HR24B 홈</Link><Link href="/models">모델 목록</Link><Link href="/reference">T-19-HC 시뮬레이터</Link></nav>
    </header>
    <div className="diagnose-content">
      <p className="diagnose-disclaimer">교과서 수준의 모세관 방식 냉동 사이클 연습입니다. 제조사 서비스 데이터나 특정 모델의 실측값이 아닙니다.</p>
      <details className="diagnose-basics">
        <summary>비교 기준 · 과열도와 과냉도란?</summary>
        <p>압축기 운전 중, 주위 온도와 부하가 비슷한 정상 운전 상태와 비교합니다. 한 번에 하나의 고장만 가정합니다.</p>
        <p>과열도는 흡입 냉매 온도가 저압의 포화온도보다 높은 정도, 과냉도는 응축기 출구 액냉매 온도가 고압의 포화온도보다 낮은 정도입니다. 증발기 온도는 저압에 대응하는 냉매 포화온도이며, 코일 전체의 표면 온도는 아닙니다.</p>
        <p>모세관 방식은 냉매량·풍량·부하에 따라 경향이 달라집니다. 문제에 제시된 단서와 함께 판단하세요.</p>
      </details>
      {!practice ? <output>문제를 준비하고 있습니다…</output> : <>
        <div className="diagnose-progress">
          <h2 ref={questionRef} tabIndex={-1}>문제 {practice.solvedCount + (practice.answerId === null ? 1 : 0)}</h2>
          <p aria-live="polite">맞힌 수 <strong>{practice.correctCount}</strong> / 푼 문제 수 <strong>{practice.solvedCount}</strong></p>
        </div>
        <div className="diagnose-grid">
          <section className="diagnose-panel" aria-label="운전 상태와 관찰 단서">
            <table className="diagnose-readings">
              <caption>운전 상태 · 정상 대비</caption>
              <thead><tr><th scope="col">항목</th><th scope="col">경향</th></tr></thead>
              <tbody>{PARAMETERS.map(parameter => {
                const direction = practice.scenario.symptoms[parameter];
                const badge = badges[direction];
                return <tr key={parameter}><th scope="row">{parameter}</th><td><span className={`diagnose-badge ${badge.className}`}><span aria-hidden="true">{badge.symbol}</span> {direction}</span></td></tr>;
              })}</tbody>
            </table>
            <h3>관찰 단서</h3>
            <ul>{practice.scenario.clues.map(clue => <li key={clue}>{clue}</li>)}</ul>
          </section>
          <section className="diagnose-panel" aria-labelledby="diagnose-choice-title">
            <h2 id="diagnose-choice-title">가장 알맞은 원인을 고르세요</h2>
            <div className="diagnose-choices">{practice.choices.map(choice => {
              const isCorrect = result?.correctId === choice.id;
              const isSelected = practice.answerId === choice.id;
              return <button key={choice.id} type="button" disabled={result !== null}
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
                <button type="button" className="diagnose-next" onClick={nextQuestion}>다음 문제</button>
              </div>}
            </div>
          </section>
        </div>
      </>}
    </div>
  </main>;
}
