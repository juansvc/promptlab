/**
 * Motor de ejecución (OE4). Una cola por proveedor: dentro de cada proveedor las llamadas
 * van de una en una para que la concurrencia no altere la latencia; proveedores distintos
 * avanzan en paralelo. Admite cancelación, un reintento como máximo y límite de gasto.
 */
import { renderPrompt } from './prompt';
import { estimateCost, findPrice } from './metrics';
import type { Alternative, Execution, ModelPrice, PromptVersion, Run, TestCase } from './types';
import { ProviderError, type ProviderAdapter } from '../providers/types';

export interface EngineDeps {
  adapters: Record<string, ProviderAdapter>;
  getKey: (provider: string) => string;
  saveExecution: (e: Execution) => Promise<void>;
  onProgress: (p: { done: number; total: number; spent: number; errors: number; message: string }) => void;
  uid: () => string;
  now?: () => number;
}

export interface EngineInput {
  run: Run;
  versions: Map<string, PromptVersion>;
  cases: TestCase[];
  inputVariable: string;
  signal: AbortSignal;
}

export type EngineOutcome = 'completada' | 'cancelada' | 'detenida por límite' | 'con errores';

interface Job {
  alt: Alternative;
  tc: TestCase;
  rep: number;
}

export async function executeRun(input: EngineInput, deps: EngineDeps): Promise<EngineOutcome> {
  const { run, versions, cases, inputVariable, signal } = input;
  const now = deps.now ?? Date.now;
  const queues = new Map<string, Job[]>();
  // Orden: repetición → caso → alternativa, para que una cancelación temprana deje resultados comparables.
  for (let rep = 1; rep <= run.repetitions; rep++) {
    for (const tc of cases) {
      for (const alt of run.alternatives) {
        if (!queues.has(alt.provider)) queues.set(alt.provider, []);
        queues.get(alt.provider)!.push({ alt, tc, rep });
      }
    }
  }
  const total = [...queues.values()].reduce((a, q) => a + q.length, 0);
  let done = 0, errors = 0, spent = 0;
  let stoppedByLimit = false;
  const limiter = new AbortController();
  const stop = () => limiter.abort();
  signal.addEventListener('abort', stop);

  const report = (message: string) => deps.onProgress({ done, total, spent, errors, message });
  report('Iniciando…');

  const priceOf = (alt: Alternative): ModelPrice | undefined => findPrice(run.prices, alt.provider, alt.model);

  async function runJob(job: Job) {
    const { alt, tc, rep } = job;
    const version = versions.get(alt.versionId);
    const adapter = deps.adapters[alt.provider];
    const base: Omit<Execution, 'status' | 'output' | 'usage' | 'ttftMs' | 'totalMs' | 'streaming' | 'retries'> = {
      id: deps.uid(),
      runId: run.id,
      alternativeId: alt.id,
      caseId: tc.id,
      repetition: rep,
      simulated: alt.provider === 'mock',
      startedAt: now(),
    };
    if (!version || !adapter) {
      errors++;
      await deps.saveExecution({ ...base, status: 'error', output: '', error: 'Falta la versión de prompt o el proveedor.', usage: null, ttftMs: null, totalMs: null, streaming: false, retries: 0 });
      return;
    }
    const prompt = renderPrompt(version.sections, { [inputVariable]: tc.input });
    let retries = 0;
    for (;;) {
      try {
        const r = await adapter.call({
          model: alt.model,
          prompt,
          temperature: alt.temperature,
          maxOutputTokens: alt.maxOutputTokens,
          apiKey: deps.getKey(alt.provider),
          signal: limiter.signal,
          seed: `${tc.id}|${rep}|${alt.versionId}`,
          mockExpected: alt.provider === 'mock' ? tc.expected : undefined,
        });
        const c = estimateCost(r.usage, priceOf(alt));
        if (c !== null) spent += c;
        await deps.saveExecution({ ...base, status: 'ok', output: r.text, usage: r.usage, ttftMs: r.ttftMs, totalMs: r.totalMs, streaming: r.streaming, retries });
        if (run.spendLimitUsd > 0 && spent >= run.spendLimitUsd && !limiter.signal.aborted) {
          stoppedByLimit = true;
          stop();
        }
        return;
      } catch (e) {
        if (limiter.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
          await deps.saveExecution({ ...base, status: 'cancelada', output: '', usage: null, ttftMs: null, totalMs: null, streaming: false, retries });
          return;
        }
        const retryable = e instanceof ProviderError ? e.retryable : true;
        if (retryable && retries < 1) {
          retries++;
          await new Promise((res) => setTimeout(res, 800));
          continue;
        }
        errors++;
        await deps.saveExecution({
          ...base,
          status: 'error',
          output: '',
          error: e instanceof Error ? e.message : String(e),
          usage: null,
          ttftMs: null,
          totalMs: null,
          streaming: false,
          retries,
        });
        return;
      }
    }
  }

  await Promise.all(
    [...queues.entries()].map(async ([provider, jobs]) => {
      for (const job of jobs) {
        if (limiter.signal.aborted) break;
        await runJob(job);
        done++;
        report(`${provider}: ${job.tc.code}, repetición ${job.rep}`);
      }
    }),
  );
  signal.removeEventListener('abort', stop);

  if (stoppedByLimit) {
    report('Detenida: se alcanzó el límite de gasto.');
    return 'detenida por límite';
  }
  if (signal.aborted) {
    report('Cancelada por el usuario.');
    return 'cancelada';
  }
  report(errors ? `Terminada con ${errors} errores.` : 'Terminada.');
  return errors ? 'con errores' : 'completada';
}
