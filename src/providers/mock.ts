import { roughTokens } from '../domain/prompt';
import { ProviderError, type CallParams, type CallResult, type ProviderAdapter } from './types';

/**
 * Adaptador de API simulada. Genera respuestas a partir de la referencia del caso,
 * con errores deterministas según el «modelo» elegido. Sirve para desarrollar y probar
 * la interfaz sin consumir llamadas reales. Sus resultados NUNCA representan modelos reales.
 */
const PROFILES: Record<string, { errorRate: number; nullMiss: number; fenceRate: number; failRate: number; latency: [number, number] }> = {
  'simulado-preciso': { errorRate: 0.04, nullMiss: 0.1, fenceRate: 0.02, failRate: 0.0, latency: [700, 1600] },
  'simulado-rapido': { errorRate: 0.14, nullMiss: 0.45, fenceRate: 0.15, failRate: 0.02, latency: [250, 650] },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string) {
  let x = hash(seed) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Cancelada', 'AbortError'));
    });
  });
}

export const MOCK_SPEED = { factor: 1 };

export const mockAdapter: ProviderAdapter = {
  id: 'mock',
  name: 'Simulado',
  needsKey: false,
  async call(p: CallParams): Promise<CallResult> {
    const prof = PROFILES[p.model] ?? PROFILES['simulado-preciso'];
    // El segundo prompt de ejemplo tiene restricciones explícitas: el simulador lo premia un poco.
    const strict = /no inventes/i.test(p.prompt.system + p.prompt.user);
    const r = rng(`${p.model}|${p.seed ?? ''}|${strict}`);
    const t0 = performance.now();
    const [lo, hi] = prof.latency;
    const ttft = (lo + r() * (hi - lo)) * 0.35 * MOCK_SPEED.factor;
    await sleep(ttft, p.signal);
    if (r() < prof.failRate) throw new ProviderError('Error simulado del proveedor (503).', true, 503);

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p.mockExpected ?? {})) {
      const errorRate = strict ? prof.errorRate * 0.5 : prof.errorRate;
      if (v === null) {
        out[k] = r() < (strict ? prof.nullMiss * 0.3 : prof.nullMiss) ? 'No especificado' : null;
      } else if (r() < errorRate) {
        out[k] = typeof v === 'number' ? Math.round((v + 1 + r() * 9) * 100) / 100 : `${v}`.slice(0, Math.max(3, `${v}`.length - 4));
      } else out[k] = v;
    }
    let text = JSON.stringify(out, null, 2);
    if (r() < (strict ? prof.fenceRate * 0.3 : prof.fenceRate)) text = '```json\n' + text + '\n```';
    await sleep((lo + r() * (hi - lo)) * 0.65 * MOCK_SPEED.factor, p.signal);
    return {
      text,
      usage: { input: roughTokens(p.prompt.system + p.prompt.user), cachedInput: 0, cacheWrite: 0, output: roughTokens(text) },
      ttftMs: ttft,
      totalMs: performance.now() - t0,
      streaming: false,
    };
  },
};
