import type { ProviderId, Usage } from '../domain/types';
import type { RenderedPrompt } from '../domain/prompt';

export interface CallParams {
  model: string;
  prompt: RenderedPrompt;
  temperature: number | null;
  maxOutputTokens: number;
  apiKey: string;
  signal: AbortSignal;
  /** Semilla para el adaptador simulado (caso + repetición). */
  seed?: string;
  /** Referencia del caso, solo para el adaptador simulado. */
  mockExpected?: Record<string, string | number | null>;
}

export interface CallResult {
  text: string;
  usage: Usage | null;
  ttftMs: number | null;
  totalMs: number;
  streaming: boolean;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export interface ProviderAdapter {
  id: ProviderId;
  name: string;
  needsKey: boolean;
  call(p: CallParams): Promise<CallResult>;
}

/**
 * Lee un cuerpo SSE y llama a onEvent por cada bloque `data:`.
 * Registra el instante del primer fragmento con texto mediante onText.
 */
export async function readSSE(res: Response, onData: (data: string, event?: string) => void) {
  if (!res.body) throw new ProviderError('La respuesta no tiene cuerpo.', true);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      let event: string | undefined;
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) onData(data.join('\n'), event);
    }
  }
}

export async function httpError(res: Response, provider: string): Promise<ProviderError> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.message ?? JSON.stringify(body).slice(0, 200);
  } catch {
    detail = res.statusText;
  }
  const retryable = res.status === 429 || res.status >= 500;
  const hint = res.status === 401 || res.status === 403 ? ' Revisa la clave de API.' : res.status === 404 ? ' Revisa el nombre exacto del modelo.' : '';
  return new ProviderError(`${provider} respondió ${res.status}: ${detail}.${hint}`, retryable, res.status);
}

export function networkError(e: unknown, provider: string): ProviderError {
  if (e instanceof DOMException && e.name === 'AbortError') throw e;
  if (e instanceof ProviderError) return e;
  if (e instanceof Error && !(e instanceof TypeError)) return new ProviderError(`${provider}: ${e.message}`, false);
  return new ProviderError(
    `No se pudo conectar con ${provider}. Puede ser un problema de red o que el proveedor no admita llamadas desde el navegador (CORS).`,
    true,
  );
}
