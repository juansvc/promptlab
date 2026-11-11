import { describe, expect, it } from 'vitest';
import {
  compareField,
  comparePair,
  estimateCost,
  forecastRun,
  median,
  normalizeDate,
  parseOutput,
  percentile,
  schemaCompliant,
  scoreExecution,
  summarizeAlternative,
  type AlternativeSummary,
} from './metrics';
import type { Alternative, Execution, FieldDef, ModelPrice, TestCase } from './types';

const FIELDS: FieldDef[] = [
  { key: 'numero', label: 'Número', type: 'id' },
  { key: 'fecha', label: 'Fecha', type: 'date' },
  { key: 'total', label: 'Total', type: 'amount' },
  { key: 'cliente', label: 'Cliente', type: 'text' },
];
const CASE: TestCase = {
  id: 'c1', projectId: 'p', code: 'F01', split: 'prueba', kind: 'completa', input: '…',
  expected: { numero: '001-001-000000123', fecha: '2026-03-05', total: 11.5, cliente: null },
};
const exec = (output: string, extra: Partial<Execution> = {}): Execution => ({
  id: 'e', runId: 'r', alternativeId: 'a', caseId: 'c1', repetition: 1, status: 'ok', output,
  usage: { input: 1000, cachedInput: 0, cacheWrite: 0, output: 200 }, ttftMs: 100, totalMs: 500,
  streaming: true, retries: 0, simulated: false, startedAt: 0, ...extra,
});
const PRICE: ModelPrice = { id: 'x', provider: 'openai', model: 'm', label: '', input: 1, cachedInput: 0.1, cacheWrite: 1.25, output: 5, checkedAt: '2026-11-11', source: '' };

describe('parseOutput', () => {
  it('acepta JSON directo', () => expect(parseOutput('{"a":1}')).toMatchObject({ validJson: true, fenced: false }));
  it('acepta JSON en bloque de código e informa de ello', () => expect(parseOutput('```json\n{"a":1}\n```')).toMatchObject({ validJson: true, fenced: true }));
  it('rechaza texto con explicación alrededor', () => expect(parseOutput('Aquí está: {"a":1}').validJson).toBe(false));
  it('rechaza arrays', () => expect(parseOutput('[1,2]').validJson).toBe(false));
});

describe('normalizeDate', () => {
  it.each([
    ['2026-03-05', '2026-03-05'],
    ['05/03/2026', '2026-03-05'],
    ['5 de marzo de 2026', '2026-03-05'],
    ['marzo 2026', null],
  ])('%s → %s', (input, out) => expect(normalizeDate(input)).toBe(out));
});

describe('compareField', () => {
  it('importes con tolerancia de 0,01', () => {
    expect(compareField('amount', 11.5, 11.51)).toBe('correcto');
    expect(compareField('amount', 11.5, 11.52)).toBe('incorrecto');
    expect(compareField('amount', 11.5, '11,50')).toBe('correcto');
  });
  it('identificadores exactos', () => {
    expect(compareField('id', '0912345678', '0912345678')).toBe('correcto');
    expect(compareField('id', '0912345678', '912345678')).toBe('incorrecto');
  });
  it('textos sin distinguir mayúsculas ni espacios sobrantes', () => expect(compareField('text', 'Ana  Pérez', ' ana pérez ')).toBe('correcto'));
  it('nulos, omisiones y valores inventados', () => {
    expect(compareField('text', null, null)).toBe('correcto');
    expect(compareField('text', 'Ana', null)).toBe('omision');
    expect(compareField('text', null, 'Ana')).toBe('inventado');
  });
});

describe('schemaCompliant', () => {
  it('exige todos los campos, tipos correctos y nada adicional', () => {
    const ok = { numero: 'x', fecha: '2026-01-01', total: 1, cliente: null };
    expect(schemaCompliant(ok, FIELDS)).toBe(true);
    expect(schemaCompliant({ ...ok, extra: 1 }, FIELDS)).toBe(false);
    expect(schemaCompliant({ ...ok, total: '1' }, FIELDS)).toBe(false);
    const { cliente: _c, ...missing } = ok;
    void _c;
    expect(schemaCompliant(missing, FIELDS)).toBe(false);
  });
});

describe('scoreExecution', () => {
  it('calcula la exactitud por campo', () => {
    const s = scoreExecution(exec('{"numero":"001-001-000000123","fecha":"05/03/2026","total":11.5,"cliente":"Ana"}'), CASE, FIELDS);
    expect(s.accuracy).toBe(0.75);
    expect(s.outcomes.cliente).toBe('inventado');
    expect(s.schema).toBe(true);
  });
  it('JSON inválido: ningún campo cuenta como correcto', () => {
    const s = scoreExecution(exec('no sé'), CASE, FIELDS);
    expect(s).toMatchObject({ validJson: false, accuracy: 0, schema: false });
    expect(s.outcomes.cliente).toBe('sin_salida');
  });
  it('una ejecución fallida cuenta como fallo y exactitud 0', () => {
    expect(scoreExecution(exec('', { status: 'error' }), CASE, FIELDS)).toMatchObject({ failed: true, accuracy: 0 });
  });
});

describe('coste estimado', () => {
  it('aplica cada categoría de consumo', () => {
    expect(estimateCost({ input: 1_000_000, cachedInput: 1_000_000, cacheWrite: 0, output: 1_000_000 }, PRICE)).toBeCloseTo(6.1);
  });
  it('sin consumo o sin tarifa devuelve null (no cero)', () => {
    expect(estimateCost(null, PRICE)).toBeNull();
    expect(estimateCost({ input: 1, cachedInput: 0, cacheWrite: 0, output: 1 }, undefined)).toBeNull();
  });
});

describe('estadísticos de latencia', () => {
  it('mediana', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('el percentil 95 solo se informa con 20 observaciones o más', () => {
    expect(percentile([1, 2, 3], 95)).toBeNull();
    const v = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(v, 95)).toBe(19);
  });
});

describe('summarizeAlternative', () => {
  const alt: Alternative = { id: 'a', label: 'A', versionId: 'v', provider: 'openai', model: 'm', temperature: 0, maxOutputTokens: 400 };
  const good = '{"numero":"001-001-000000123","fecha":"2026-03-05","total":11.5,"cliente":null}';
  it('promedia primero por caso y detecta repeticiones inconsistentes', () => {
    const execs = [exec(good, { repetition: 1 }), exec('{"numero":"001-001-000000123","fecha":"2026-03-05","total":12,"cliente":null}', { repetition: 2 })];
    const s = summarizeAlternative(alt, execs, [CASE], FIELDS, [PRICE], { minSchema: 0.95, relevance: 0.02 });
    expect(s.accuracy).toBeCloseTo(0.875);
    expect(s.casesEvaluated).toBe(1);
    expect(s.inconsistentCases).toBe(1);
    expect(s.costTotal).toBeCloseTo(2 * (1000 * 1 + 200 * 5) / 1e6);
    expect(s.meetsSchema).toBe(true);
  });
  it('cuenta como no disponible el coste sin consumo', () => {
    const s = summarizeAlternative(alt, [exec(good, { usage: null })], [CASE], FIELDS, [PRICE], { minSchema: 0.95, relevance: 0.02 });
    expect(s.costTotal).toBeNull();
    expect(s.costUnavailable).toBe(1);
  });
});

describe('comparePair', () => {
  const mk = (perCase: Record<string, number>): AlternativeSummary => ({ perCase } as AlternativeSummary);
  const cases = (n: number, v: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, v]));
  it('evidencia insuficiente con menos de 10 casos', () => expect(comparePair(mk(cases(5, 1)), mk(cases(5, 0.5)), 0.02).verdict).toBe('insuficiente'));
  it('evidencia insuficiente si la diferencia no supera el umbral', () => expect(comparePair(mk(cases(12, 0.9)), mk(cases(12, 0.89)), 0.02).verdict).toBe('insuficiente'));
  it('indica la alternativa mejor si supera el umbral', () => {
    const r = comparePair(mk(cases(12, 0.8)), mk(cases(12, 0.9)), 0.02);
    expect(r.verdict).toBe('B');
    expect(r.bBetter).toBe(12);
  });
});

describe('forecastRun', () => {
  it('cuenta llamadas y estima coste; avisa si falta una tarifa', () => {
    const alts: Alternative[] = [
      { id: '1', label: '', versionId: 'v', provider: 'openai', model: 'm', temperature: 0, maxOutputTokens: 400 },
      { id: '2', label: '', versionId: 'v', provider: 'anthropic', model: 'sin-tarifa', temperature: 0, maxOutputTokens: 400 },
    ];
    const f = forecastRun(alts, { v: 300 }, [100, 100], 3, [PRICE]);
    expect(f.calls).toBe(12);
    expect(f.cost).toBeNull();
    expect(f.missingPrices).toEqual(['anthropic/sin-tarifa']);
  });
});
