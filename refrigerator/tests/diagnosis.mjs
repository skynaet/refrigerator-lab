import assert from 'node:assert/strict';
import {PARAMETERS, listScenarios, symptomKey, pickScenario, buildChoices, judge} from '../lib/diagnosis.ts';

const scenarios = listScenarios();
const originalIds = scenarios.map(s => s.id);
const directions = new Set(['높음', '낮음', '정상']);
assert.ok(scenarios.length >= 6, '최소 6개 고장 시나리오');
assert.equal(PARAMETERS.length, 7);
assert.equal(new Set(scenarios.map(s => s.id)).size, scenarios.length, '문제 ID 중복 금지');
assert.equal(new Set(scenarios.map(s => symptomKey(s.symptoms))).size, scenarios.length, '증상 조합 중복 금지');
for (const scenario of scenarios) {
  assert.ok(scenario.name.trim());
  assert.deepEqual(Object.keys(scenario.symptoms).sort(), [...PARAMETERS].sort(), `${scenario.id}: 항목 누락·추가 금지`);
  for (const parameter of PARAMETERS) assert.ok(directions.has(scenario.symptoms[parameter]), `${scenario.id}: ${parameter}`);
  assert.ok(scenario.explanation.trim(), '빈 해설 금지');
  assert.ok(scenario.clues.length > 0 && scenario.clues.every(clue => typeof clue === 'string' && clue.trim()), '빈 단서 금지');
  // 객체 속성 순서가 달라도 같은 증상은 같은 서명을 얻는다.
  assert.equal(symptomKey(Object.fromEntries(Object.entries(scenario.symptoms).reverse())), symptomKey(scenario.symptoms));
  for (const answer of scenarios) {
    const result = judge(scenario.id, answer.id);
    assert.equal(result.correct, scenario.id === answer.id, `${scenario.id} / ${answer.id}`);
    assert.equal(result.correctId, scenario.id);
    assert.equal(result.correctName, scenario.name);
    assert.equal(result.explanation, scenario.explanation);
  }
  const choices = buildChoices(() => 0.4);
  assert.equal(choices.length, scenarios.length);
  assert.deepEqual(choices.map(c => c.id).sort(), scenarios.map(s => s.id).sort());
  assert.ok(choices.some(c => c.id === scenario.id && c.name === scenario.name));
  // 모든 이전 문제와 추첨 구간에서 직전 문제를 제외한다.
  const candidates = scenarios.filter(s => s.id !== scenario.id);
  for (let i = 0; i < candidates.length; i++) {
    assert.equal(pickScenario(() => (i + 0.5) / candidates.length, scenario.id).id, candidates[i].id);
  }
}
for (let i = 0; i < scenarios.length; i++) {
  assert.equal(pickScenario(() => (i + 0.5) / scenarios.length).id, scenarios[i].id, '주입한 난수의 각 구간');
}
assert.equal(pickScenario(() => 0).id, scenarios[0].id);
assert.equal(pickScenario(() => 0.999999).id, scenarios.at(-1).id);
assert.equal(pickScenario(() => 0, 'unknown').id, scenarios[0].id, '알 수 없는 이전 ID는 전체 목록에서 추첨');
assert.deepEqual(buildChoices(() => 0.4), buildChoices(() => 0.4), '보기 추첨 재현 가능');
assert.deepEqual(buildChoices(() => 0.999999).map(c => c.id), scenarios.map(s => s.id));
assert.notDeepEqual(buildChoices(() => 0).map(c => c.id), scenarios.map(s => s.id), '보기 섞기');
assert.deepEqual(listScenarios().map(s => s.id), originalIds, '보기 섞기는 원본 순서를 보존');
assert.throws(() => judge('unknown', scenarios[0].id), RangeError);
assert.throws(() => judge(scenarios[0].id, 'unknown'), RangeError);
assert.throws(() => judge('unknown', 'unknown'), RangeError);
for (const invalid of [-0.1, 1, NaN, Infinity]) {
  assert.throws(() => pickScenario(() => invalid), RangeError);
  assert.throws(() => buildChoices(() => invalid), RangeError);
}
console.log('진단 연습 검사 통과: 증상 완전성·고유성, 모든 정오답, 잘못된 ID, 난수 주입, 연속 중복 방지, 보기 구성.');
