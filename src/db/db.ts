import Dexie, { type Table } from 'dexie';
import type { Execution, ModelPrice, Project, Prompt, PromptVersion, ProviderCheck, Run, TestCase } from '../domain/types';

/**
 * Persistencia local en IndexedDB (apartado 3.3.6).
 * Las claves de API NO se guardan aquí: viven solo en memoria (ver store/session.ts).
 */
export class PromptLabDB extends Dexie {
  projects!: Table<Project, string>;
  prompts!: Table<Prompt, string>;
  versions!: Table<PromptVersion, string>;
  cases!: Table<TestCase, string>;
  prices!: Table<ModelPrice, string>;
  runs!: Table<Run, string>;
  executions!: Table<Execution, string>;
  checks!: Table<ProviderCheck, string>;

  constructor(name = 'promptlab') {
    super(name);
    this.version(1).stores({
      projects: 'id, createdAt',
      prompts: 'id, projectId',
      versions: 'id, promptId, [promptId+number]',
      cases: 'id, projectId, split',
      prices: 'id, provider',
      runs: 'id, projectId, createdAt',
      executions: 'id, runId, [runId+alternativeId], caseId',
      checks: 'id, provider, checkedAt',
    });
  }
}

export const db = new PromptLabDB();

export const uid = () => crypto.randomUUID();
