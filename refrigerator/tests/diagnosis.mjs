import assert from 'node:assert/strict';
import {CHECK_PARAMETERS, CIRCUIT_PARTS, PARAMETERS, listScenarios, symptomKey, pickScenario, buildChoices, explainOthers, judge} from '../lib/diagnosis.ts';
import {parseDiagnosisRecords, summarizeDiagnosisRecords} from '../lib/diagnosis-records.ts';

const scenarios = listScenarios();
const originalIds = scenarios.map(s => s.id);
const directions = new Set(['높음', '낮음', '정상']);
const circuitPartIds = new Set(Object.keys(CIRCUIT_PARTS));
assert.ok(circuitPartIds.size > 0);
assert.ok(Object.values(CIRCUIT_PARTS).every(label => typeof label === 'string' && label.trim()), '회로 부품 이름은 비어 있지 않음');
assert.equal(scenarios.length, 6, '추가 후보는 지표 불확실성·기존 결빙과의 중복으로 제외하여 6개 유지');
assert.equal(PARAMETERS.length, 7);
assert.equal(new Set(scenarios.map(s => s.id)).size, scenarios.length, '문제 ID 중복 금지');
assert.equal(new Set(scenarios.map(s => symptomKey(s.symptoms))).size, scenarios.length, '증상 조합 중복 금지');
for (const scenario of scenarios) {
  assert.ok(scenario.name.trim());
  assert.deepEqual(Object.keys(scenario.symptoms).sort(), [...PARAMETERS].sort(), `${scenario.id}: 항목 누락·추가 금지`);
  for (const parameter of PARAMETERS) assert.ok(directions.has(scenario.symptoms[parameter]), `${scenario.id}: ${parameter}`);
  assert.ok(scenario.explanation.trim(), '빈 해설 금지');
  assert.ok(scenario.clues.length > 0 && scenario.clues.every(clue => typeof clue === 'string' && clue.trim()), '빈 단서 금지');
  assert.ok(scenario.checks.length > 0, `${scenario.id}: 선택할 확인 항목 필수`);
  const checkIds = new Set(scenario.checks.map(check => check.id));
  assert.equal(checkIds.size, scenario.checks.length, `${scenario.id}: 확인 항목 ID 중복 금지`);
  assert.ok(scenario.checks.every(check => typeof check.id === 'string' && check.id.trim()
    && typeof check.label === 'string' && check.label.trim()
    && typeof check.result === 'string' && check.result.trim()), `${scenario.id}: 확인 항목 ID·이름·결과 필수`);
  assert.ok(scenario.keyCheckIds.length > 0, `${scenario.id}: 핵심 확인 항목 필수`);
  assert.equal(new Set(scenario.keyCheckIds).size, scenario.keyCheckIds.length, `${scenario.id}: 핵심 ID 중복 금지`);
  for (const id of scenario.keyCheckIds) assert.ok(checkIds.has(id), `${scenario.id}: 존재하는 확인 항목만 핵심 단서로 지정 (${id})`);
  assert.deepEqual(scenario.checks.map(({id, label}) => ({id, label})), scenarios[0].checks.map(({id, label}) => ({id, label})), '열기 전 메뉴로 정답이 노출되지 않음');
  for (const [id, parameter] of Object.entries(CHECK_PARAMETERS)) {
    const check = scenario.checks.find(check => check.id === id);
    assert.equal(check.result, scenario.symptoms[parameter], `${scenario.id}: 기존 지표의 경향 재사용`);
    assert.equal(check.direction, scenario.symptoms[parameter], `${scenario.id}: 배지와 결과 일치`);
  }
  const observations = scenario.checks.filter(check => !Object.hasOwn(CHECK_PARAMETERS, check.id));
  assert.deepEqual(observations.map(check => check.result), scenario.clues, `${scenario.id}: 기존 관찰 단서를 빠짐없이 재사용`);
  assert.ok(!scenario.checks.some(check => check.label === '고내 온도'), '기본 증상은 확인 횟수에서 제외');
  const {parts, description} = scenario.circuitLocation;
  assert.ok(parts.length > 0, `${scenario.id}: 회로 강조 위치가 하나 이상`);
  assert.equal(new Set(parts).size, parts.length, `${scenario.id}: 회로 강조 위치 중복 금지`);
  for (const part of parts) assert.ok(circuitPartIds.has(part), `${scenario.id}: 알 수 없는 회로 부품 ${part}`);
  assert.ok(typeof description === 'string' && description.trim(), `${scenario.id}: 회로 강조 설명 필수`);
  assert.ok(scenario.fieldChecks.length >= 3 && scenario.fieldChecks.length <= 5, `${scenario.id}: 현장 확인 순서는 3~5개`);
  assert.ok(scenario.fieldChecks.every(check => typeof check === 'string' && check.trim()), `${scenario.id}: 빈 현장 확인 항목 금지`);
  assert.ok(typeof scenario.safetyNote === 'string' && scenario.safetyNote.trim(), `${scenario.id}: 안전 안내 필수`);
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
  const alternatives = explainOthers(scenario.id);
  const otherScenarios = scenarios.filter(s => s.id !== scenario.id);
  assert.equal(alternatives.length, otherScenarios.length, '정답을 제외한 모든 보기 해설');
  assert.deepEqual(alternatives.map(item => item.id).sort(), otherScenarios.map(s => s.id).sort(), '정답 제외·오답 누락 및 중복 금지');
  for (const alternative of alternatives) {
    const other = otherScenarios.find(s => s.id === alternative.id);
    assert.equal(alternative.name, other.name);
    assert.ok(alternative.differences.length > 0, '오답 보기마다 차이가 하나 이상');
    const expectedDifferences = PARAMETERS.filter(parameter => other.symptoms[parameter] !== scenario.symptoms[parameter])
      .map(parameter => ({parameter, expected: other.symptoms[parameter], actual: scenario.symptoms[parameter]}));
    assert.deepEqual(alternative.differences, expectedDifferences, `${scenario.id} / ${other.id}: 차이 항목과 양쪽 방향 일치`);
  }
  assert.deepEqual(explainOthers(scenario.id), alternatives, '같은 문제의 비교 결과 재현 가능');
  const comparisonSnapshot = structuredClone(alternatives);
  const scenarioSnapshot = structuredClone(scenarios);
  // 반환값을 바꾸어도 원본 데이터나 이후 비교 결과에 영향을 주지 않는다.
  alternatives[0].differences[0].actual = '변경';
  alternatives[0].name = '변경';
  alternatives.pop();
  assert.deepEqual(explainOthers(scenario.id), comparisonSnapshot, '반환값 변경은 이후 결과에 영향 없음');
  assert.deepEqual(scenarios, scenarioSnapshot, '비교 함수는 원본 데이터를 보존');
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
assert.throws(() => explainOthers('unknown'), RangeError);
for (const invalid of [-0.1, 1, NaN, Infinity]) {
  assert.throws(() => pickScenario(() => invalid), RangeError);
  assert.throws(() => buildChoices(() => invalid), RangeError);
}
// 실제 재시도도 각각 한 번의 풀이로 남기고, 미확인 제출(0회)도 평균에 포함한다.
const records = [
  {scenarioId: scenarios[0].id, correct: true, checkCount: 0},
  {scenarioId: scenarios[1].id, correct: false, checkCount: scenarios[1].checks.length},
  {scenarioId: scenarios[0].id, correct: true, checkCount: 1},
];
assert.deepEqual(parseDiagnosisRecords(JSON.stringify({version: 1, records})), records, '시나리오별 정오답·확인 횟수 왕복');
assert.deepEqual(summarizeDiagnosisRecords(records), {correctCount: 2, solvedCount: 3, averageChecks: 3}, '반복 풀이·오답·0회 제출의 누적과 평균');
assert.deepEqual(summarizeDiagnosisRecords([]), {correctCount: 0, solvedCount: 0, averageChecks: 0}, '초기화 후 평균은 0');
for (const invalid of [null, '', '{', 'null', '[]', '1', '{}', '{"version":2,"records":[]}', '{"version":1,"records":{}}']) {
  assert.deepEqual(parseDiagnosisRecords(invalid), [], `손상·구버전 기록은 안전하게 무시: ${invalid}`);
}
const invalidRecords = [null, {}, {scenarioId: 'unknown', correct: true, checkCount: 1},
  {...records[0], correct: 'true'}, ...[-1, 0.5, scenarios[0].checks.length + 1, '1', null].map(checkCount => ({...records[0], checkCount}))];
assert.deepEqual(parseDiagnosisRecords(JSON.stringify({version: 1, records: [...invalidRecords, records[0]]})), [records[0]], '잘못된 레코드만 제외하고 유효한 기록 복원');
console.log('진단 연습 검사 통과: 증상 완전성·고유성, 단계별 확인·핵심 단서 ID, 기존 단서 재사용, 회로 위치·현장 확인 순서·안전 안내, 모든 정오답·오답 비교, 추첨·보기 구성, 기록 복원·손상 방어·누적 성적.');
