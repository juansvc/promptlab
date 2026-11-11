import invoices from './invoices.json';
import type { FieldDef, ModelPrice, PromptSections, TestCase } from '../domain/types';

export const INVOICE_FIELDS: FieldDef[] = [
  { key: 'numero_factura', label: 'Número de factura', type: 'id' },
  { key: 'fecha_emision', label: 'Fecha de emisión', type: 'date' },
  { key: 'ruc_emisor', label: 'RUC del emisor', type: 'id' },
  { key: 'razon_social_emisor', label: 'Razón social del emisor', type: 'text' },
  { key: 'identificacion_comprador', label: 'Identificación del comprador', type: 'id' },
  { key: 'nombre_comprador', label: 'Nombre del comprador', type: 'text' },
  { key: 'subtotal', label: 'Subtotal (base imponible tras descuentos)', type: 'amount' },
  { key: 'iva', label: 'IVA', type: 'amount' },
  { key: 'total', label: 'Total', type: 'amount' },
  { key: 'forma_pago', label: 'Forma de pago', type: 'text' },
];

type RawInvoice = { code: string; split: TestCase['split']; kind: TestCase['kind']; input: string; expected: TestCase['expected'] };

export function invoiceCases(projectId: string, makeId: () => string): TestCase[] {
  return (invoices as RawInvoice[]).map((inv) => ({ id: makeId(), projectId, ...inv }));
}

const schemaLines = INVOICE_FIELDS.map((f) => {
  const t = f.type === 'amount' ? 'número' : f.type === 'date' ? 'texto AAAA-MM-DD' : 'texto';
  return `  "${f.key}": ${t} o null`;
}).join(',\n');

export const PROMPT_V1: PromptSections = {
  role: '',
  context: '',
  task: 'Extrae los datos de la siguiente factura y devuélvelos en JSON.',
  constraints: '',
  outputFormat: `Devuelve un objeto JSON con estos campos:\n{\n${schemaLines}\n}`,
  examples: '',
  input: 'Factura:\n{{factura}}',
};

export const PROMPT_V2: PromptSections = {
  role: 'Eres un asistente que extrae datos contables de facturas ecuatorianas con precisión.',
  context: 'Las facturas están en texto plano. El IVA es del 15 %. Los importes pueden usar coma o punto como separador decimal.',
  task: 'Extrae los campos indicados de la factura.',
  constraints: [
    '- Si un dato no aparece en la factura, usa null. No inventes valores.',
    '- La fecha de emisión no es la fecha de vencimiento.',
    '- El subtotal es la base imponible después de descuentos.',
    '- Escribe los importes como números con punto decimal, sin símbolo de moneda.',
    '- Responde solo con el JSON, sin texto adicional ni bloques de código.',
  ].join('\n'),
  outputFormat: `Objeto JSON con exactamente estos campos:\n{\n${schemaLines}\n}`,
  examples: [
    'Entrada: "FACTURA No. 001-001-000000123 · Fecha de emisión: 05/03/2026 · ... VALOR TOTAL: $ 11,50"',
    'Salida: {"numero_factura": "001-001-000000123", "fecha_emision": "2026-03-05", ..., "total": 11.5}',
  ].join('\n'),
  input: 'Factura:\n{{factura}}',
};

/** Tarifas por defecto. Se deben verificar antes de cada experimento: los precios cambian. */
export const DEFAULT_PRICES: ModelPrice[] = [
  { id: 'p-openai-luna', provider: 'openai', model: 'gpt-6-luna', label: 'OpenAI · gpt-6-luna', input: 0.1, cachedInput: 0.01, cacheWrite: 0, output: 0.5, checkedAt: '2026-11-11', source: 'https://developers.openai.com/api/docs/pricing' },
  { id: 'p-openai-terra', provider: 'openai', model: 'gpt-6.1-terra', label: 'OpenAI · gpt-6.1-terra', input: 1, cachedInput: 0.05, cacheWrite: 0, output: 5, checkedAt: '2026-11-11', source: 'https://developers.openai.com/api/docs/pricing' },
  { id: 'p-anthropic-haiku', provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Anthropic · claude-haiku-5-5', input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5, checkedAt: '2026-11-11', source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { id: 'p-anthropic-sonnet', provider: 'anthropic', model: 'claude-sonnet-5-5', label: 'Anthropic · claude-sonnet-5-5', input: 2, cachedInput: 0.1, cacheWrite: 2.5, output: 10, checkedAt: '2026-11-11', source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { id: 'p-gemini-flash-lite', provider: 'gemini', model: 'gemini-3.1-flash-lite', label: 'Google · gemini-3.1-flash-lite', input: 0.25, cachedInput: 0.025, cacheWrite: 0, output: 1.5, checkedAt: '2026-11-11', source: 'https://ai.google.dev/gemini-api/docs/pricing' },
  { id: 'p-mock-a', provider: 'mock', model: 'simulado-preciso', label: 'Simulado · preciso', input: 0.1, cachedInput: 0.01, cacheWrite: 0, output: 0.5, checkedAt: '2026-11-11', source: 'Tarifa ficticia del adaptador simulado' },
  { id: 'p-mock-b', provider: 'mock', model: 'simulado-rapido', label: 'Simulado · rápido', input: 0.05, cachedInput: 0.005, cacheWrite: 0, output: 0.25, checkedAt: '2026-11-11', source: 'Tarifa ficticia del adaptador simulado' },
];
