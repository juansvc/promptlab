import { db, uid } from './db';
import { DEFAULT_PRICES, INVOICE_FIELDS, PROMPT_V1, PROMPT_V2, invoiceCases } from '../data/seed';
import type { Project, PromptSections, PromptVersion } from '../domain/types';

export async function ensurePrices() {
  if ((await db.prices.count()) === 0) await db.prices.bulkPut(DEFAULT_PRICES);
}

/** Crea el proyecto de ejemplo del caso de estudio: 30 facturas sintéticas y dos versiones de prompt. */
export async function createSampleProject(): Promise<string> {
  const projectId = uid();
  const project: Project = {
    id: projectId,
    name: 'Extracción de facturas (caso de estudio)',
    description: '30 facturas sintéticas en texto con valores de referencia por campo. 10 casos de ajuste y 20 de prueba.',
    fields: INVOICE_FIELDS,
    inputVariable: 'factura',
    createdAt: Date.now(),
  };
  const promptId = uid();
  await db.transaction('rw', [db.projects, db.prompts, db.versions, db.cases], async () => {
    await db.projects.add(project);
    await db.prompts.add({ id: promptId, projectId, name: 'Extractor de facturas', createdAt: Date.now() });
    await db.versions.bulkAdd([
      { id: uid(), promptId, number: 1, note: 'Primera versión: tarea y formato de salida.', sections: PROMPT_V1, createdAt: Date.now() - 1000 },
      { id: uid(), promptId, number: 2, note: 'Añade rol, contexto, restricciones sobre nulos y fechas, y un ejemplo.', sections: PROMPT_V2, createdAt: Date.now() },
    ]);
    await db.cases.bulkAdd(invoiceCases(projectId, uid));
  });
  await ensurePrices();
  return projectId;
}

export async function createEmptyProject(name: string): Promise<string> {
  const projectId = uid();
  await db.projects.add({ id: projectId, name, description: '', fields: INVOICE_FIELDS, inputVariable: 'factura', createdAt: Date.now() });
  await db.prompts.add({ id: uid(), projectId, name: 'Prompt principal', createdAt: Date.now() });
  await ensurePrices();
  return projectId;
}

export async function saveVersion(promptId: string, sections: PromptSections, note: string): Promise<PromptVersion> {
  const last = await db.versions.where('promptId').equals(promptId).reverse().sortBy('number');
  const v: PromptVersion = { id: uid(), promptId, number: (last[0]?.number ?? 0) + 1, note, sections, createdAt: Date.now() };
  await db.versions.add(v);
  return v;
}

export async function deleteProject(projectId: string) {
  const prompts = await db.prompts.where('projectId').equals(projectId).toArray();
  const runs = await db.runs.where('projectId').equals(projectId).toArray();
  await db.transaction('rw', [db.projects, db.prompts, db.versions, db.cases, db.runs, db.executions], async () => {
    for (const p of prompts) await db.versions.where('promptId').equals(p.id).delete();
    for (const r of runs) await db.executions.where('runId').equals(r.id).delete();
    await db.runs.where('projectId').equals(projectId).delete();
    await db.cases.where('projectId').equals(projectId).delete();
    await db.prompts.where('projectId').equals(projectId).delete();
    await db.projects.delete(projectId);
  });
}

// exportación e importación

export const EXPORT_FORMAT = 'promptlab-export';
export const EXPORT_VERSION = 1;

/** Exporta todos los datos locales. Las claves de API nunca forman parte de la exportación. */
export async function exportAll() {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    note: 'Este archivo no contiene claves de API.',
    projects: await db.projects.toArray(),
    prompts: await db.prompts.toArray(),
    versions: await db.versions.toArray(),
    cases: await db.cases.toArray(),
    prices: await db.prices.toArray(),
    runs: await db.runs.toArray(),
    executions: await db.executions.toArray(),
    checks: await db.checks.toArray(),
  };
}

const KEY_LIKE = /(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,})/;

export async function importAll(text: string): Promise<{ projects: number }> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (data.format !== EXPORT_FORMAT || data.version !== EXPORT_VERSION) throw new Error('El archivo no es una exportación de PromptLab compatible.');
  if (KEY_LIKE.test(text)) throw new Error('El archivo parece contener una clave de API. Por seguridad no se ha importado.');
  const tables = ['projects', 'prompts', 'versions', 'cases', 'prices', 'runs', 'executions', 'checks'] as const;
  for (const t of tables) if (!Array.isArray(data[t])) throw new Error(`Falta la sección «${t}» en el archivo.`);
  await db.transaction('rw', tables.map((t) => db[t]), async () => {
    for (const t of tables) await (db[t] as unknown as { bulkPut: (rows: unknown[]) => Promise<unknown> }).bulkPut(data[t] as unknown[]);
  });
  return { projects: (data.projects as unknown[]).length };
}

export async function wipeAll() {
  await db.transaction('rw', [db.projects, db.prompts, db.versions, db.cases, db.prices, db.runs, db.executions, db.checks], async () => {
    await Promise.all([db.projects, db.prompts, db.versions, db.cases, db.prices, db.runs, db.executions, db.checks].map((t) => t.clear()));
  });
}
