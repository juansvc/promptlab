import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { mockAdapter } from './mock';
import { openaiAdapter } from './openai';
import type { ProviderAdapter } from './types';
import type { ProviderId } from '../domain/types';

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  mock: mockAdapter,
};

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini (opcional)',
  mock: 'Simulado',
};

/** Proveedores reales en el orden de la versión mínima. */
export const REAL_PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'gemini'];
