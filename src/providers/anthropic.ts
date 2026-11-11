import { httpError, networkError, readSSE, type CallParams, type CallResult, type ProviderAdapter } from './types';
import type { Usage } from '../domain/types';

/**
 * Anthropic Messages API desde el navegador. Requiere la cabecera
 * anthropic-dangerous-direct-browser-access, que Anthropic exige para aceptar llamadas con CORS.
 */
export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  name: 'Anthropic',
  needsKey: true,
  async call(p: CallParams): Promise<CallResult> {
    const body: Record<string, unknown> = {
      model: p.model,
      max_tokens: p.maxOutputTokens,
      messages: [{ role: 'user', content: p.prompt.user }],
      stream: true,
    };
    if (p.prompt.system) body.system = p.prompt.system;
    if (p.temperature !== null) body.temperature = p.temperature;

    const t0 = performance.now();
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': p.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal: p.signal,
      });
    } catch (e) {
      throw networkError(e, 'Anthropic');
    }
    if (!res.ok) throw await httpError(res, 'Anthropic');

    let text = '';
    let ttft: number | null = null;
    const usage: Usage = { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 };
    let sawUsage = false;
    try {
      await readSSE(res, (data, event) => {
        const ev = JSON.parse(data);
        const type = event ?? ev.type;
        if (type === 'message_start' && ev.message?.usage) {
          const u = ev.message.usage;
          usage.input = u.input_tokens ?? 0;
          usage.cachedInput = u.cache_read_input_tokens ?? 0;
          usage.cacheWrite = u.cache_creation_input_tokens ?? 0;
          usage.output = u.output_tokens ?? 0;
          sawUsage = true;
        } else if (type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          if (ttft === null) ttft = performance.now() - t0;
          text += ev.delta.text;
        } else if (type === 'message_delta' && ev.usage) {
          usage.output = ev.usage.output_tokens ?? usage.output;
          sawUsage = true;
        } else if (type === 'error') {
          throw new Error(ev.error?.message ?? 'Error durante la respuesta de Anthropic.');
        }
      });
    } catch (e) {
      throw networkError(e, 'Anthropic');
    }
    return { text, usage: sawUsage ? usage : null, ttftMs: ttft, totalMs: performance.now() - t0, streaming: true };
  },
};
