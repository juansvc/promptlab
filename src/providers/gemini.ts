import { httpError, networkError, readSSE, type CallParams, type CallResult, type ProviderAdapter } from './types';
import type { Usage } from '../domain/types';

/** Google Gemini API (tercer proveedor, condicionado a tiempo y presupuesto). */
export const geminiAdapter: ProviderAdapter = {
  id: 'gemini',
  name: 'Google Gemini',
  needsKey: true,
  async call(p: CallParams): Promise<CallResult> {
    const generationConfig: Record<string, unknown> = { maxOutputTokens: p.maxOutputTokens };
    if (p.temperature !== null) generationConfig.temperature = p.temperature;
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: p.prompt.user }] }],
      generationConfig,
    };
    if (p.prompt.system) body.systemInstruction = { parts: [{ text: p.prompt.system }] };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse`;
    const t0 = performance.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.apiKey },
        body: JSON.stringify(body),
        signal: p.signal,
      });
    } catch (e) {
      throw networkError(e, 'Google Gemini');
    }
    if (!res.ok) throw await httpError(res, 'Google Gemini');

    let text = '';
    let ttft: number | null = null;
    let usage: Usage | null = null;
    try {
      await readSSE(res, (data) => {
        const chunk = JSON.parse(data);
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.text && !part.thought) {
            if (ttft === null) ttft = performance.now() - t0;
            text += part.text;
          }
        }
        const u = chunk.usageMetadata;
        if (u) {
          const cached = u.cachedContentTokenCount ?? 0;
          usage = {
            input: (u.promptTokenCount ?? 0) - cached,
            cachedInput: cached,
            cacheWrite: 0,
            // Gemini factura los tokens de razonamiento como salida.
            output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
          };
        }
      });
    } catch (e) {
      throw networkError(e, 'Google Gemini');
    }
    return { text, usage, ttftMs: ttft, totalMs: performance.now() - t0, streaming: true };
  },
};
