/**
 * Métricas y regla de comparación descritas en el apartado 3.3.7 de la memoria.
 * Todas las funciones son puras para poder probarlas con casos de resultado conocido.
 */
import type { Alternative, Execution, FieldDef, FieldType, ModelPrice, Requirements, TestCase, Usage } from './types';

// análisis de la salida

export interface ParsedOutput {
  validJson: boolean;
  /** true si el JSON venía dentro de un bloque ```json; se acepta, pero se informa. */
  fenced: boolean;
  value: Record<string, unknown> | null;
}

export function parseOutput(text: string): ParsedOutput {
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text.trim());
  if (direct) return { validJson: true, fenced: false, value: direct };
  const m = text.match(/^\s*```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/i);
  if (m) {
    const inner = tryParse(m[1].trim());
    if (inner) return { validJson: true, fenced: true, value: inner };
  }
  return { validJson: false, fenced: false, value: null };
}

function typeOk(type: FieldType, v: unknown): boolean {
  if (v === null) return true;
  switch (type) {
    case 'amount':
      return typeof v === 'number' && Number.isFinite(v);
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v);
    default:
      return typeof v === 'string';
  }
}

/** Cumple el esquema: todos los campos presentes (pueden ser null), tipos correctos y sin campos adicionales. */
export function schemaCompliant(value: Record<string, unknown> | null, fields: FieldDef[]): boolean {
  if (!value) return false;
  const keys = Object.keys(value);
  if (keys.length !== fields.length) return false;
  return fields.every((f) => f.key in value && typeOk(f.type, value[f.key]));
}

// normalización por tipo

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Normaliza una fecha a AAAA-MM-DD (ISO 8601). Devuelve null si no se reconoce. */
export function normalizeDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function normalizeText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return v.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export function normalizeId(v: unknown): string | null {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return null;
  return v.trim();
}

/** sin_salida: la ejecución falló o el JSON no es válido, así que el campo no se pudo leer. */
export type FieldOutcome = 'correcto' | 'incorrecto' | 'omision' | 'inventado' | 'sin_salida';

/** Compara un campo con su referencia según las reglas del apartado 3.3.7. */
export function compareField(type: FieldType, expected: unknown, actual: unknown): FieldOutcome {
  const missing = actual === undefined || actual === null || (typeof actual === 'string' && actual.trim() === '');
  if (expected === null || expected === undefined) return missing ? 'correcto' : 'inventado';
  if (missing) return 'omision';
  switch (type) {
    case 'amount': {
      const n = typeof actual === 'number' ? actual : Number(String(actual).replace(',', '.'));
      return Number.isFinite(n) && Math.abs(n - Number(expected)) <= 0.01 + 1e-9 ? 'correcto' : 'incorrecto';
    }
    case 'integer':
      return Number(actual) === Number(expected) ? 'correcto' : 'incorrecto';
    case 'date': {
      const a = normalizeDate(actual);
      return a !== null && a === normalizeDate(expected) ? 'correcto' : 'incorrecto';
    }
    case 'id':
      return normalizeId(actual) === normalizeId(expected) ? 'correcto' : 'incorrecto';
    default:
      return normalizeText(actual) === normalizeText(expected) ? 'correcto' : 'incorrecto';
  }
}

export interface ExecutionScore {
  failed: boolean;
  validJson: boolean;
  fenced: boolean;
  schema: boolean;
  /** Proporción de campos correctos (0 si la ejecución falló o el JSON no es válido). */
  accuracy: number;
  outcomes: Record<string, FieldOutcome>;
  /** Firma de los valores extraídos, para detectar resultados distintos entre repeticiones. */
  signature: string;
}

export function scoreExecution(exec: Execution, testCase: TestCase, fields: FieldDef[]): ExecutionScore {
  const outcomes: Record<string, FieldOutcome> = {};
  if (exec.status !== 'ok') {
    for (const f of fields) outcomes[f.key] = 'sin_salida';
    return { failed: true, validJson: false, fenced: false, schema: false, accuracy: 0, outcomes, signature: 'fallo' };
  }
  const parsed = parseOutput(exec.output);
  const value = parsed.value ?? {};
  let correct = 0;
  for (const f of fields) {
    // Si el JSON no es válido, ningún campo se puede leer y ninguno cuenta como correcto.
    const o: FieldOutcome = parsed.validJson ? compareField(f.type, testCase.expected[f.key], value[f.key]) : 'sin_salida';
    outcomes[f.key] = o;
    if (o === 'correcto') correct++;
  }
  const signature = parsed.validJson
    ? fields.map((f) => JSON.stringify(normalizeForSignature(f.type, value[f.key]))).join('|')
    : 'json-invalido';
  return {
    failed: false,
    validJson: parsed.validJson,
    fenced: parsed.fenced,
    schema: schemaCompliant(parsed.value, fields),
    accuracy: parsed.validJson ? correct / fields.length : 0,
    outcomes,
    signature,
  };
}

function normalizeForSignature(type: FieldType, v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (type === 'date') return normalizeDate(v) ?? v;
  if (type === 'text') return normalizeText(v);
  if (type === 'amount') return Math.round(Number(v) * 100) / 100;
  return v;
}

// coste

export function findPrice(prices: ModelPrice[], provider: string, model: string): ModelPrice | undefined {
  return prices.find((p) => p.provider === provider && p.model === model);
}

/** Coste estimado en USD. null si no hay consumo informado o no hay tarifa. */
export function estimateCost(usage: Usage | null, price: ModelPrice | undefined): number | null {
  if (!usage || !price) return null;
  return (
    (usage.input * price.input + usage.cachedInput * price.cachedInput + usage.cacheWrite * price.cacheWrite + usage.output * price.output) /
    1_000_000
  );
}

// agregación por alternativa

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Percentil por el método del rango más cercano. Solo se informa con al menos 20 observaciones. */
export function percentile(values: number[], p: number, minN = 20): number | null {
  if (values.length < minN) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * s.length);
  return s[Math.min(s.length, Math.max(1, rank)) - 1];
}

export type FieldStats = Record<FieldOutcome, number>;

export interface AlternativeSummary {
  alternativeId: string;
  executions: number;
  failures: number;
  validJsonRate: number;
  fencedCount: number;
  schemaRate: number;
  /** Media entre casos de la exactitud media de cada caso. */
  accuracy: number;
  /** Exactitud media por caso (clave: caseId). */
  perCase: Record<string, number>;
  casesEvaluated: number;
  /** Casos cuyas repeticiones produjeron valores distintos. */
  inconsistentCases: number;
  byField: Record<string, FieldStats>;
  /** Suma de coste estimado; null si ninguna ejecución tiene consumo. */
  costTotal: number | null;
  costPerCase: number | null;
  costUnavailable: number;
  ttftMedian: number | null;
  totalMedian: number | null;
  totalP95: number | null;
  meetsSchema: boolean;
}

export function summarizeAlternative(
  alt: Alternative,
  executions: Execution[],
  cases: TestCase[],
  fields: FieldDef[],
  prices: ModelPrice[],
  req: Requirements,
): AlternativeSummary {
  const mine = executions.filter((e) => e.alternativeId === alt.id && e.status !== 'cancelada');
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const price = findPrice(prices, alt.provider, alt.model);
  const byCase = new Map<string, ExecutionScore[]>();
  const byField: Record<string, FieldStats> = Object.fromEntries(fields.map((f) => [f.key, { correcto: 0, incorrecto: 0, omision: 0, inventado: 0, sin_salida: 0 }]));
  let validJson = 0, fenced = 0, schema = 0, failures = 0, costUnavailable = 0;
  let cost: number | null = null;
  const ttft: number[] = [], total: number[] = [];

  for (const e of mine) {
    const tc = caseById.get(e.caseId);
    if (!tc) continue;
    const s = scoreExecution(e, tc, fields);
    if (!byCase.has(e.caseId)) byCase.set(e.caseId, []);
    byCase.get(e.caseId)!.push(s);
    if (s.failed) failures++;
    if (s.validJson) validJson++;
    if (s.fenced) fenced++;
    if (s.schema) schema++;
    for (const f of fields) byField[f.key][s.outcomes[f.key]]++;
    const c = estimateCost(e.usage, price);
    if (c === null) costUnavailable++;
    else cost = (cost ?? 0) + c;
    if (e.status === 'ok') {
      if (e.ttftMs !== null) ttft.push(e.ttftMs);
      if (e.totalMs !== null) total.push(e.totalMs);
    }
  }

  const perCase: Record<string, number> = {};
  let inconsistent = 0;
  for (const [caseId, scores] of byCase) {
    perCase[caseId] = scores.reduce((a, s) => a + s.accuracy, 0) / scores.length;
    if (new Set(scores.map((s) => s.signature)).size > 1) inconsistent++;
  }
  const caseValues = Object.values(perCase);
  const n = mine.length;
  return {
    alternativeId: alt.id,
    executions: n,
    failures,
    validJsonRate: n ? validJson / n : 0,
    fencedCount: fenced,
    schemaRate: n ? schema / n : 0,
    accuracy: caseValues.length ? caseValues.reduce((a, b) => a + b, 0) / caseValues.length : 0,
    perCase,
    casesEvaluated: caseValues.length,
    inconsistentCases: inconsistent,
    byField,
    costTotal: cost,
    costPerCase: cost !== null && caseValues.length ? cost / caseValues.length : null,
    costUnavailable,
    ttftMedian: median(ttft),
    totalMedian: median(total),
    totalP95: percentile(total, 95),
    meetsSchema: n > 0 && schema / n >= req.minSchema,
  };
}

// comparación entre dos alternativas

export interface PairComparison {
  /** Casos evaluados por ambas alternativas. */
  sharedCases: number;
  /** Diferencia media de exactitud (A − B) en esos casos. */
  meanDiff: number;
  aBetter: number;
  bBetter: number;
  ties: number;
  verdict: 'A' | 'B' | 'insuficiente';
  reason: string;
}

export const MIN_CASES_FOR_VERDICT = 10;

/**
 * Comparación descriptiva y pareada por caso. No es una prueba estadística:
 * solo indica qué alternativa fue mejor en estos casos y si la diferencia supera el umbral fijado.
 */
export function comparePair(a: AlternativeSummary, b: AlternativeSummary, relevance: number): PairComparison {
  const shared = Object.keys(a.perCase).filter((id) => id in b.perCase);
  let sum = 0, aBetter = 0, bBetter = 0, ties = 0;
  for (const id of shared) {
    const d = a.perCase[id] - b.perCase[id];
    sum += d;
    if (Math.abs(d) < 1e-9) ties++;
    else if (d > 0) aBetter++;
    else bBetter++;
  }
  const meanDiff = shared.length ? sum / shared.length : 0;
  let verdict: PairComparison['verdict'] = 'insuficiente';
  let reason: string;
  if (shared.length < MIN_CASES_FOR_VERDICT) reason = `Solo hay ${shared.length} casos en común; se necesitan al menos ${MIN_CASES_FOR_VERDICT}.`;
  else if (Math.abs(meanDiff) < relevance) reason = `La diferencia media (${pct(Math.abs(meanDiff))}) es menor que el umbral de relevancia (${pct(relevance)}).`;
  else {
    verdict = meanDiff > 0 ? 'A' : 'B';
    reason = `Diferencia media de ${pct(Math.abs(meanDiff))} en ${shared.length} casos, por encima del umbral de ${pct(relevance)}.`;
  }
  return { sharedCases: shared.length, meanDiff, aBetter, bBetter, ties, verdict, reason };
}

export function pct(x: number, digits = 1): string {
  return `${(x * 100).toLocaleString('es-EC', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

// previsión antes de ejecutar

export interface Forecast {
  calls: number;
  cost: number | null;
  missingPrices: string[];
}

export function forecastRun(
  alternatives: Alternative[],
  promptTokensByVersion: Record<string, number>,
  caseTokens: number[],
  repetitions: number,
  prices: ModelPrice[],
): Forecast {
  let cost = 0;
  const missing: string[] = [];
  for (const alt of alternatives) {
    const price = findPrice(prices, alt.provider, alt.model);
    if (!price) {
      if (alt.provider !== 'mock') missing.push(`${alt.provider}/${alt.model}`);
      continue;
    }
    for (const ct of caseTokens) {
      const inTok = (promptTokensByVersion[alt.versionId] ?? 0) + ct;
      // Se supone que la salida ocupa la mitad del máximo permitido: es una previsión, no una medida.
      const outTok = Math.round(alt.maxOutputTokens / 2);
      cost += (repetitions * (inTok * price.input + outTok * price.output)) / 1_000_000;
    }
  }
  return { calls: alternatives.length * caseTokens.length * repetitions, cost: missing.length ? null : cost, missingPrices: missing };
}
