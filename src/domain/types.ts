/** Tipos del dominio de PromptLab. Ver capítulo 3 de la memoria (apartados 3.3.6 y 3.3.7). */

export type FieldType = 'text' | 'id' | 'date' | 'amount' | 'integer';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Campos que debe devolver el modelo (esquema de salida). */
  fields: FieldDef[];
  /** Nombre de la variable del prompt que recibe el texto de cada caso. */
  inputVariable: string;
  createdAt: number;
}

export const SECTION_KEYS = ['role', 'context', 'task', 'constraints', 'outputFormat', 'examples', 'input'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type PromptSections = Record<SectionKey, string>;

export const SECTION_LABELS: Record<SectionKey, string> = {
  role: 'Rol',
  context: 'Contexto',
  task: 'Tarea',
  constraints: 'Restricciones',
  outputFormat: 'Formato de salida',
  examples: 'Ejemplos',
  input: 'Entrada (variable)',
};

export const SECTION_HINTS: Record<SectionKey, string> = {
  role: 'Perspectiva desde la que responde el modelo.',
  context: 'Información de fondo necesaria para la tarea.',
  task: 'La acción principal, en una frase.',
  constraints: 'Reglas y límites: qué hacer si falta un dato, qué no inventar.',
  outputFormat: 'Estructura exacta del resultado (por ejemplo, un JSON con los campos).',
  examples: 'Una o dos entradas con su salida esperada.',
  input: 'Dónde se inserta cada caso de prueba. Usa la variable, por ejemplo {{factura}}.',
};

export interface Prompt {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  number: number;
  /** Qué cambió y por qué (se pide al guardar). */
  note: string;
  sections: PromptSections;
  createdAt: number;
}

export type CaseSplit = 'ajuste' | 'prueba';
export type CaseKind = 'completa' | 'incompleta' | 'ambigua';

export interface TestCase {
  id: string;
  projectId: string;
  code: string;
  split: CaseSplit;
  kind: CaseKind;
  input: string;
  /** Valores esperados por campo; null significa que el dato no aparece en el documento. */
  expected: Record<string, string | number | null>;
}

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'mock';

export interface ModelPrice {
  id: string;
  provider: ProviderId;
  model: string;
  label: string;
  /** USD por millón de tokens. */
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
  /** Fecha (AAAA-MM-DD) en que se consultó la tarifa. */
  checkedAt: string;
  source: string;
}

export interface Alternative {
  id: string;
  label: string;
  versionId: string;
  provider: ProviderId;
  model: string;
  /** null = no enviar el parámetro (algunos modelos no lo admiten). */
  temperature: number | null;
  maxOutputTokens: number;
}

export interface Requirements {
  /** Proporción mínima de salidas que cumplen el esquema (0–1). */
  minSchema: number;
  /** Diferencia mínima de exactitud para considerar relevante una diferencia (0–1). */
  relevance: number;
}

export type RunStatus = 'pendiente' | 'en curso' | 'completada' | 'cancelada' | 'detenida por límite' | 'con errores';

export interface Run {
  id: string;
  projectId: string;
  name: string;
  alternatives: Alternative[];
  caseIds: string[];
  repetitions: number;
  /** Copia de las tarifas usadas, para que la ejecución sea trazable aunque cambien. */
  prices: ModelPrice[];
  requirements: Requirements;
  spendLimitUsd: number;
  status: RunStatus;
  simulated: boolean;
  createdAt: number;
  finishedAt?: number;
}

export interface Usage {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
}

export type ExecStatus = 'ok' | 'error' | 'cancelada';

export interface Execution {
  id: string;
  runId: string;
  alternativeId: string;
  caseId: string;
  repetition: number;
  status: ExecStatus;
  output: string;
  error?: string;
  /** null = el proveedor no informó del consumo. */
  usage: Usage | null;
  ttftMs: number | null;
  totalMs: number | null;
  streaming: boolean;
  retries: number;
  simulated: boolean;
  startedAt: number;
}

export interface ProviderCheck {
  id: string;
  provider: ProviderId;
  model: string;
  origin: string;
  ok: boolean;
  detail: string;
  checkedAt: number;
}
