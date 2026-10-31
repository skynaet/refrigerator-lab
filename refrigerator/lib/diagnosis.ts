export type Direction = '높음' | '낮음' | '정상';

export const PARAMETERS = [
  '저압(흡입) 압력',
  '고압(토출/응축) 압력',
  '과열도',
  '과냉도',
  '압축기 전류',
  '증발기 온도',
  '고내 온도',
] as const;
export type Parameter = (typeof PARAMETERS)[number];
export type Symptoms = Readonly<Record<Parameter, Direction>>;
export type Scenario = {
  readonly id: string;
  readonly name: string;
  readonly symptoms: Symptoms;
  readonly clues: readonly string[];
  readonly explanation: string;
};
export type Choice = Pick<Scenario, 'id' | 'name'>;
export type RandomSource = () => number;

// 모세관 방식의 단일 고장, 압축기 운전 중, 비슷한 주위 온도·부하를 가정한다.
// 증발기 온도는 코일 표면 평균이 아니라 저압에 대응하는 냉매 포화온도다.
// 방향은 교과서 수준의 일반 경향이며, 모세관 방식은 냉매량·풍량·부하에 따라 달라질 수 있다.
const scenarios: readonly Scenario[] = [
  {
    id: 'undercharge', name: '냉매 부족(누설)',
    symptoms: {
      '저압(흡입) 압력': '낮음', '고압(토출/응축) 압력': '낮음',
      '과열도': '높음', '과냉도': '낮음', '압축기 전류': '낮음',
      '증발기 온도': '낮음', '고내 온도': '높음',
    },
    clues: ['증발기 입구 일부에만 서리가 끼고 나머지는 마른 상태', '배관 이음부 주위에 오일 흔적이 보임'],
    explanation: '모세관으로 공급되는 액냉매가 부족하면 증발기에서 일찍 기화해 과열도가 높아집니다. 응축기 내 액냉매도 줄어 과냉도가 낮아지고, 냉매 유량과 압축기 전류가 줄어듭니다. 저압과 증발 포화온도는 낮아도 냉각 능력이 부족해 고내는 따뜻합니다.',
  },
  {
    id: 'overcharge', name: '냉매 과충전',
    symptoms: {
      '저압(흡입) 압력': '높음', '고압(토출/응축) 압력': '높음',
      '과열도': '낮음', '과냉도': '높음', '압축기 전류': '높음',
      '증발기 온도': '높음', '고내 온도': '높음',
    },
    clues: ['흡입관이 압축기 가까이까지 심하게 결로됨', '냉매 보충 뒤 냉각이 나빠지고 압축기 부하가 커짐'],
    explanation: '과충전하면 응축기에 액냉매가 쌓여 과냉도와 고압이 올라갑니다. 모세관을 통한 공급이 많아져 저압이 높아지고 과열도가 낮아져 액냉매 귀환 가능성이 커집니다. 전류가 증가하며, 이 문제는 과충전으로 냉각 성능까지 나빠져 고내 온도가 오른 경우입니다. 경미한 과충전에서는 고내 온도가 정상일 수도 있습니다.',
  },
  {
    id: 'restriction', name: '모세관/드라이어 막힘(제한)',
    symptoms: {
      '저압(흡입) 압력': '낮음', '고압(토출/응축) 압력': '낮음',
      '과열도': '높음', '과냉도': '높음', '압축기 전류': '낮음',
      '증발기 온도': '낮음', '고내 온도': '높음',
    },
    clues: ['드라이어 출구나 제한 지점에 국부적인 결로·서리가 생김', '제한 지점 앞뒤에 뚜렷한 온도 차이가 있음'],
    explanation: '제한 지점 뒤로 냉매 공급이 줄어 저압이 낮고 과열도가 높아집니다. 제한 지점 앞에는 액냉매가 쌓여 과냉도가 높아지므로 냉매 부족과 구별할 수 있습니다. 유량 감소로 전류는 낮아집니다. 고압은 제한 위치·정도와 운전 시간에 따라 달라지며, 여기서는 모세관 제한으로 유량이 줄어 고압도 낮아진 경우를 가정합니다.',
  },
  {
    id: 'condenser-airflow', name: '응축기 오염 또는 응축기 팬 고장',
    symptoms: {
      '저압(흡입) 압력': '높음', '고압(토출/응축) 압력': '높음',
      '과열도': '정상', '과냉도': '높음', '압축기 전류': '높음',
      '증발기 온도': '높음', '고내 온도': '높음',
    },
    clues: ['응축기 핀에 먼지가 두껍게 쌓였거나 팬이 멈춤', '응축기와 기계실이 평소보다 뜨거움'],
    explanation: '응축기의 방열이 나빠지면 응축 온도와 고압이 상승해 압축기 전류가 커집니다. 모세관 방식에서는 저압도 올라갈 수 있습니다. 여기서는 과열도는 정상 범위, 과냉도는 다소 높은 경우입니다. 과열도·과냉도는 냉매량과 풍량, 응축기 구조에 따라 달라지며, 방열이 심하게 부족하면 과냉도가 낮아질 수도 있습니다.',
  },
  {
    id: 'evaporator-airflow', name: '증발기 팬 고장 또는 증발기 결빙',
    symptoms: {
      '저압(흡입) 압력': '낮음', '고압(토출/응축) 압력': '낮음',
      '과열도': '낮음', '과냉도': '정상', '압축기 전류': '낮음',
      '증발기 온도': '낮음', '고내 온도': '높음',
    },
    clues: ['증발기 전체가 두꺼운 얼음으로 덮였거나 팬이 멈춤', '코일은 차갑지만 고내에 찬 공기가 거의 순환하지 않음'],
    explanation: '증발기 풍량이 줄면 냉매가 흡수할 열이 줄어 저압과 증발 포화온도가 내려갑니다. 모세관 공급에 비해 증발량이 적어 과열도가 낮아지고 액냉매 귀환이 생길 수 있습니다. 전류와 고압은 낮아져도 공기 순환이 부족해 고내는 따뜻합니다. 과냉도는 정상으로 가정했으며 냉매 분포와 결빙 정도에 따라 달라질 수 있습니다.',
  },
  {
    id: 'compressor-inefficiency', name: '압축기 효율 저하',
    symptoms: {
      '저압(흡입) 압력': '높음', '고압(토출/응축) 압력': '낮음',
      '과열도': '정상', '과냉도': '낮음', '압축기 전류': '낮음',
      '증발기 온도': '높음', '고내 온도': '높음',
    },
    clues: ['압축기는 계속 돌지만 흡입·토출의 압력 차이가 작음', '응축기와 증발기 팬은 정상인데 냉각이 약함'],
    explanation: '압축기 내부 밸브 누설 등으로 압축 능력이 떨어지면 충분히 흡입·압축하지 못해 저압은 높고 고압은 낮아집니다. 이 문제는 유효 압축 일이 줄어 전류가 낮은 경우입니다. 모세관 전후 압력 차이가 줄어 냉각 능력도 감소합니다. 과열도는 정상, 과냉도는 낮음으로 가정했으며 고장 정도·부하에 따라 달라질 수 있습니다.',
  },
];

export function listScenarios(): readonly Scenario[] {
  return scenarios;
}

export function symptomKey(symptoms: Symptoms): string {
  return PARAMETERS.map(parameter => symptoms[parameter]).join('|');
}

function randomIndex(length: number, rng: RandomSource): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('난수는 0 이상 1 미만이어야 합니다.');
  }
  return Math.floor(value * length);
}

export function pickScenario(rng: RandomSource = Math.random, previousId?: string): Scenario {
  const pool = scenarios.filter(scenario => scenario.id !== previousId);
  const candidates = pool.length ? pool : scenarios;
  return candidates[randomIndex(candidates.length, rng)];
}

export function buildChoices(rng: RandomSource = Math.random): Choice[] {
  const choices = scenarios.map(({id, name}) => ({id, name}));
  for (let i = choices.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rng);
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

// 잘못된 문제·답안 ID는 오답으로 집계하지 않고 호출 오류로 알린다.
export function judge(scenarioId: string, answerId: string) {
  const scenario = scenarios.find(item => item.id === scenarioId);
  if (!scenario) throw new RangeError(`알 수 없는 문제: ${scenarioId}`);
  if (!scenarios.some(item => item.id === answerId)) {
    throw new RangeError(`알 수 없는 답안: ${answerId}`);
  }
  return {
    correct: scenarioId === answerId,
    correctId: scenario.id,
    correctName: scenario.name,
    explanation: scenario.explanation,
  };
}
