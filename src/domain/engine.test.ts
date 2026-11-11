import { describe, expect, it } from 'vitest';
import { executeRun, type EngineDeps } from './engine';
import { ProviderError, type ProviderAdapter } from '../providers/types';
import { PROMPT_V2 } from '../data/seed';
import type { Execution, PromptVersion, Run, TestCase } from './types';

const version: PromptVersion = { id: 'v', promptId: 'p', number: 1, note: '', sections: PROMPT_V2, createdAt: 0 };
const cases: TestCase[] = ['A', 'B'].map((c) => ({ id: c, projectId: 'p', code: c, split: 'prueba', kind: 'completa', input: c, expected: {} }));
const baseRun = (over: Partial<Run> = {}): Run => ({
  id: 'r', projectId: 'p', name: '', caseIds: ['A', 'B'], repetitions: 2, requirements: { minSchema: 0.95, relevance: 0.02 },
  spendLimitUsd: 0, status: 'en curso', simulated: false, createdAt: 0,
  prices: [{ id: 'x', provider: 'openai', model: 'm', label: '', input: 1000, cachedInput: 0, cacheWrite: 0, output: 0, checkedAt: '', source: '' }],
  alternatives: [{ id: 'alt', label: '', versionId: 'v', provider: 'openai', model: 'm', temperature: 0, maxOutputTokens: 100 }],
  ...over,
});

function deps(adapter: ProviderAdapter, saved: Execution[]): EngineDeps {
  let i = 0;
  return { adapters: { openai: adapter }, getKey: () => 'k', saveExecution: async (e) => void saved.push(e), onProgress: () => {}, uid: () => `id${i++}` };
}

const okAdapter = (calls: { n: number }): ProviderAdapter => ({
  id: 'openai', name: 'x', needsKey: true,
  call: async () => {
    calls.n++;
    return { text: '{}', usage: { input: 1000, cachedInput: 0, cacheWrite: 0, output: 0 }, ttftMs: 1, totalMs: 2, streaming: true };
  },
});

describe('executeRun', () => {
  it('ejecuta alternativas × casos × repeticiones', async () => {
    const saved: Execution[] = [], calls = { n: 0 };
    const out = await executeRun({ run: baseRun(), versions: new Map([['v', version]]), cases, inputVariable: 'factura', signal: new AbortController().signal }, deps(okAdapter(calls), saved));
    expect(out).toBe('completada');
    expect(saved).toHaveLength(4);
    expect(saved.every((e) => e.status === 'ok')).toBe(true);
  });

  it('se detiene al alcanzar el límite de gasto', async () => {
    const saved: Execution[] = [], calls = { n: 0 };
    // Cada llamada cuesta 1 USD (1000 tokens × 1000 USD/M); el límite es 2 USD.
    const out = await executeRun({ run: baseRun({ spendLimitUsd: 2 }), versions: new Map([['v', version]]), cases, inputVariable: 'factura', signal: new AbortController().signal }, deps(okAdapter(calls), saved));
    expect(out).toBe('detenida por límite');
    expect(calls.n).toBe(2);
  });

  it('reintenta una vez los errores recuperables y luego registra el fallo', async () => {
    const saved: Execution[] = [];
    let n = 0;
    const failing: ProviderAdapter = { id: 'openai', name: 'x', needsKey: true, call: async () => { n++; throw new ProviderError('503', true, 503); } };
    const out = await executeRun({ run: baseRun({ repetitions: 1, caseIds: ['A'] }), versions: new Map([['v', version]]), cases: [cases[0]], inputVariable: 'factura', signal: new AbortController().signal }, deps(failing, saved));
    expect(out).toBe('con errores');
    expect(n).toBe(2);
    expect(saved[0]).toMatchObject({ status: 'error', retries: 1 });
  });

  it('no reintenta errores no recuperables (por ejemplo, clave inválida)', async () => {
    const saved: Execution[] = [];
    let n = 0;
    const failing: ProviderAdapter = { id: 'openai', name: 'x', needsKey: true, call: async () => { n++; throw new ProviderError('401', false, 401); } };
    await executeRun({ run: baseRun({ repetitions: 1 }), versions: new Map([['v', version]]), cases: [cases[0]], inputVariable: 'factura', signal: new AbortController().signal }, deps(failing, saved));
    expect(n).toBe(1);
  });
});
