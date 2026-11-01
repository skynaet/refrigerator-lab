import {listScenarios} from './diagnosis.ts';

export type DiagnosisRecord = {
  readonly scenarioId: string;
  readonly correct: boolean;
  readonly checkCount: number;
};

// 저장소 접근은 화면의 마운트 이후에만 수행한다. 손상되거나 구버전인
// 데이터가 학습을 막지 않도록 검증된 기록만 복원한다.
export function parseDiagnosisRecords(raw: string | null): DiagnosisRecord[] {
  if (!raw) return [];
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1
      || !('records' in saved) || !Array.isArray(saved.records)) return [];
    const records: DiagnosisRecord[] = [];
    for (const item of saved.records) {
      if (!item || typeof item !== 'object') continue;
      const scenario = listScenarios().find(scenario => scenario.id === item.scenarioId);
      if (scenario && typeof item.correct === 'boolean' && Number.isInteger(item.checkCount)
        && item.checkCount >= 0 && item.checkCount <= scenario.checks.length) {
        records.push({scenarioId: scenario.id, correct: item.correct, checkCount: item.checkCount});
      }
    }
    return records;
  } catch {
    return [];
  }
}

export function summarizeDiagnosisRecords(records: readonly DiagnosisRecord[]) {
  return {
    correctCount: records.filter(record => record.correct).length,
    solvedCount: records.length,
    averageChecks: records.length ? records.reduce((sum, record) => sum + record.checkCount, 0) / records.length : 0,
  };
}
