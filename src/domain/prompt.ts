import { SECTION_KEYS, SECTION_LABELS, type PromptSections, type SectionKey } from './types';

const VAR_RE = /\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g;

export function emptySections(): PromptSections {
  return { role: '', context: '', task: '', constraints: '', outputFormat: '', examples: '', input: '' };
}

/** Devuelve los nombres de variables usados en todas las secciones. */
export function findVariables(sections: PromptSections): string[] {
  const out = new Set<string>();
  for (const key of SECTION_KEYS) {
    for (const m of sections[key].matchAll(VAR_RE)) out.add(m[1]);
  }
  return [...out];
}

export function fillVariables(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (whole, name: string) => (name in values ? values[name] : whole));
}

export interface StructureIssue {
  level: 'error' | 'aviso';
  section?: SectionKey;
  message: string;
}

/**
 * Validación estructural (apartado 2.3.2): comprueba que el prompt tenga sus partes.
 * No dice si el prompt produce buenos resultados; eso solo lo dice la evaluación.
 */
export function validateStructure(sections: PromptSections, inputVariable: string): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const required: SectionKey[] = ['task', 'outputFormat', 'input'];
  for (const key of required) {
    if (!sections[key].trim()) issues.push({ level: 'error', section: key, message: `Falta la sección «${SECTION_LABELS[key]}».` });
  }
  for (const key of ['role', 'constraints', 'examples'] as SectionKey[]) {
    if (!sections[key].trim()) issues.push({ level: 'aviso', section: key, message: `La sección «${SECTION_LABELS[key]}» está vacía.` });
  }
  const vars = findVariables(sections);
  if (sections.input.trim() && !vars.includes(inputVariable)) {
    issues.push({ level: 'error', section: 'input', message: `La entrada no usa la variable {{${inputVariable}}}, así que los casos no llegarían al modelo.` });
  }
  for (const v of vars) {
    if (v !== inputVariable) issues.push({ level: 'error', message: `La variable {{${v}}} no tiene valor: los casos solo aportan {{${inputVariable}}}.` });
  }
  return issues;
}

export interface RenderedPrompt {
  system: string;
  user: string;
}

/**
 * Convierte las secciones en mensajes. Las instrucciones van en el mensaje de sistema
 * y la tarea con la entrada en el mensaje de usuario, separando instrucciones y datos.
 */
export function renderPrompt(sections: PromptSections, values: Record<string, string>): RenderedPrompt {
  const block = (key: SectionKey) => {
    const text = sections[key].trim();
    return text ? `## ${SECTION_LABELS[key]}\n${fillVariables(text, values)}` : '';
  };
  const system = (['role', 'context', 'constraints', 'outputFormat', 'examples'] as SectionKey[])
    .map(block)
    .filter(Boolean)
    .join('\n\n');
  const user = [sections.task.trim(), fillVariables(sections.input.trim(), values)].filter(Boolean).join('\n\n');
  return { system, user };
}

/** Texto plano de una versión completa, usado para el diff entre versiones. */
export function sectionsToText(sections: PromptSections): string {
  return SECTION_KEYS.map((k) => `## ${SECTION_LABELS[k]}\n${sections[k].trim()}`).join('\n\n');
}

/** Estimación gruesa de tokens para la previsión de coste (aprox. 4 caracteres por token). */
export function roughTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
