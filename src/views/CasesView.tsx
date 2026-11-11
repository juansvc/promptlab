import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db/db';
import { ConfirmButton, EmptyState, Notice, SectionTitle } from '../components/ui';
import type { CaseKind, CaseSplit, Project, TestCase } from '../domain/types';

const KIND_LABEL: Record<CaseKind, string> = { completa: 'Completa', incompleta: 'Incompleta', ambigua: 'Ambigua' };

export function CasesView({ project }: { project: Project }) {
  const cases = useLiveQuery(() => db.cases.where('projectId').equals(project.id).sortBy('code'), [project.id]);
  const [split, setSplit] = useState<'todos' | CaseSplit>('todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const shown = useMemo(() => (cases ?? []).filter((c) => split === 'todos' || c.split === split), [cases, split]);
  const selected = cases?.find((c) => c.id === (selectedId ?? shown[0]?.id));

  if (!cases) return <p className="hint">Cargando…</p>;

  async function addCase() {
    const n = (cases?.length ?? 0) + 1;
    const c: TestCase = {
      id: uid(), projectId: project.id, code: `N${String(n).padStart(2, '0')}`, split: 'prueba', kind: 'completa', input: '',
      expected: Object.fromEntries(project.fields.map((f) => [f.key, null])),
    };
    await db.cases.add(c);
    setSelectedId(c.id);
  }

  const bySplit = (s: CaseSplit) => cases!.filter((c) => c.split === s).length;

  return (
    <div>
      <SectionTitle aside={<button className="btn btn-ghost" onClick={addCase}>Añadir caso</button>}>Casos de prueba</SectionTitle>
      <p className="hint mb-4 max-w-[70ch]">
        Usa los casos de <strong>ajuste</strong> para iterar el prompt y reserva los de <strong>prueba</strong> para la comparación final, así la comparación no se hace con los mismos casos con los que ajustaste el prompt.
        Hay {bySplit('ajuste')} de ajuste y {bySplit('prueba')} de prueba.
      </p>
      {cases.length === 0 ? (
        <EmptyState title="Sin casos de prueba" action={<button className="btn btn-primary" onClick={addCase}>Añadir el primer caso</button>}>
          Cada caso es un documento con el valor esperado de cada campo. Sin casos no se puede comparar.
        </EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
          <div>
            <label className="field-label" htmlFor="split-filter">Mostrar</label>
            <select id="split-filter" className="input mb-3" value={split} onChange={(e) => setSplit(e.target.value as typeof split)}>
              <option value="todos">Todos ({cases.length})</option>
              <option value="ajuste">Ajuste ({bySplit('ajuste')})</option>
              <option value="prueba">Prueba ({bySplit('prueba')})</option>
            </select>
            <ul className="panel divide-y divide-rule max-h-[70vh] overflow-auto" aria-label="Lista de casos">
              {shown.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    aria-current={selected?.id === c.id ? 'true' : undefined}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 ${selected?.id === c.id ? 'bg-petrol-soft' : 'hover:bg-paper'}`}
                  >
                    <span className="mono font-semibold w-10">{c.code}</span>
                    <span className="flex-1 truncate text-sm text-muted">{c.input.split('\n')[0] || '(sin texto)'}</span>
                    <span className={`pill ${c.kind === 'completa' ? 'pill-neutral' : 'pill-warn'}`}>{KIND_LABEL[c.kind]}</span>
                    <span className="text-xs text-muted w-12 text-right">{c.split}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {selected && <CaseEditor key={selected.id} project={project} testCase={selected} />}
        </div>
      )}
    </div>
  );
}

function CaseEditor({ project, testCase }: { project: Project; testCase: TestCase }) {
  const [c, setC] = useState(testCase);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(c) !== JSON.stringify(testCase);

  function setExpected(key: string, raw: string, type: string) {
    let v: string | number | null = raw.trim() === '' ? null : raw;
    if (v !== null && (type === 'amount' || type === 'integer')) {
      const n = Number(raw.replace(',', '.'));
      v = Number.isFinite(n) ? n : raw;
    }
    setC({ ...c, expected: { ...c.expected, [key]: v } });
  }
  const invalidNumbers = project.fields.filter((f) => (f.type === 'amount' || f.type === 'integer') && typeof c.expected[f.key] === 'string');

  return (
    <section className="panel p-4" aria-label={`Caso ${c.code}`}>
      <div className="flex flex-wrap gap-4 items-end mb-4">
        <h3 className="text-lg font-bold mono mr-auto">{c.code}</h3>
        <div>
          <label className="field-label" htmlFor="case-split">Conjunto</label>
          <select id="case-split" className="input" value={c.split} onChange={(e) => setC({ ...c, split: e.target.value as CaseSplit })}>
            <option value="ajuste">Ajuste</option>
            <option value="prueba">Prueba</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="case-kind">Tipo</label>
          <select id="case-kind" className="input" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as CaseKind })}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 2xl:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="case-input">Texto del documento</label>
          <textarea id="case-input" className="input mono text-xs" rows={22} value={c.input} onChange={(e) => setC({ ...c, input: e.target.value })} />
        </div>
        <div>
          <p className="field-label">Valores esperados</p>
          <p className="hint mb-2">Deja vacío un campo si el dato no aparece en el documento: la salida correcta será null.</p>
          <div className="space-y-2">
            {project.fields.map((f) => (
              <div key={f.key} className="grid grid-cols-[1fr_1.2fr] gap-2 items-center">
                <label className="text-sm" htmlFor={`exp-${f.key}`}>
                  {f.label}
                  <span className="block text-xs text-muted mono">{f.key} · {f.type === 'amount' ? 'importe' : f.type === 'date' ? 'fecha AAAA-MM-DD' : f.type === 'id' ? 'identificador exacto' : 'texto'}</span>
                </label>
                <input id={`exp-${f.key}`} className="input mono" value={c.expected[f.key] === null || c.expected[f.key] === undefined ? '' : String(c.expected[f.key])} placeholder="null" onChange={(e) => setExpected(f.key, e.target.value, f.type)} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {invalidNumbers.length > 0 && <div className="mt-3"><Notice tone="bad">Revisa {invalidNumbers.map((f) => f.label).join(', ')}: debe ser un número.</Notice></div>}
      <div className="flex flex-wrap gap-3 mt-4 items-center">
        <button className="btn btn-primary" disabled={!dirty || invalidNumbers.length > 0} onClick={async () => { await db.cases.put(c); setSaved(true); setTimeout(() => setSaved(false), 3000); }}>Guardar caso</button>
        {dirty && <button className="btn btn-ghost" onClick={() => setC(testCase)}>Descartar cambios</button>}
        {saved && <span role="status" className="pill pill-ok">✓ Caso guardado</span>}
        <span className="ml-auto"><ConfirmButton label="Eliminar caso" confirmLabel="Eliminar definitivamente" onConfirm={() => db.cases.delete(c.id)} /></span>
      </div>
    </section>
  );
}
