import { httpError, networkError, readSSE, type CallParams, type CallResult, type ProviderAdapter } from './types';
import type { Usage } from '../domain/types';

/** OpenAI Chat Completions con respuesta progresiva y consumo al final del flujo. */
export const openaiAdapter: ProviderAdapter = {
  id: 'openai',
  name: 'OpenAI',
  needsKey: true,
  async call(p: CallParams): Promise<CallResult> {
    const body: Record<string, unknown> = {
      model: p.model,
      messages: [
        ...(p.prompt.system ? [{ role: 'system', content: p.prompt.system }] : []),
        { role: 'user', content: p.prompt.user },
      ],
      max_completion_tokens: p.maxOutputTokens,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (p.temperature !== null) body.temperature = p.temperature;

    const t0 = performance.now();
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
        body: JSON.stringify(body),
        signal: p.signal,
      });
    } catch (e) {
      throw networkError(e, 'OpenAI');
    }
    if (!res.ok) throw await httpError(res, 'OpenAI');

    let text = '';
    let ttft: number | null = null;
    let usage: Usage | null = null;
    try {
      await readSSE(res, (data) => {
        if (data === '[DONE]') return;
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          if (ttft === null) ttft = performance.now() - t0;
          text += delta;
        }
        if (chunk.usage) {
          const cached = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
          usage = {
            input: (chunk.usage.prompt_tokens ?? 0) - cached,
            cachedInput: cached,
            cacheWrite: 0,
            output: chunk.usage.completion_tokens ?? 0,
          };
        }
      });
    } catch (e) {
      throw networkError(e, 'OpenAI');
    }
    return { text, usage, ttftMs: ttft, totalMs: performance.now() - t0, streaming: true };
  },
};
