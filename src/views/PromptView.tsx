import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { saveVersion } from '../db/repo';
import { Editor } from '../components/Editor';
import { SectionDiff } from '../components/Diff';
import { Notice, SectionTitle, fmtDate } from '../components/ui';
import { emptySections, renderPrompt, roughTokens, validateStructure } from '../domain/prompt';
import { SECTION_HINTS, SECTION_KEYS, SECTION_LABELS, type Project, type PromptSections } from '../domain/types';

export function PromptView({ project }: { project: Project }) {
  const prompt = useLiveQuery(() => db.prompts.where('projectId').equals(project.id).first(), [project.id]);
  const versions = useLiveQuery(
    async () => (prompt ? (await db.versions.where('promptId').equals(prompt.id).sortBy('number')).reverse() : []),
    [prompt?.id],
  );
  const sampleCase = useLiveQuery(async () => (await db.cases.where('projectId').equals(project.id).sortBy('code'))[0], [project.id]);

  const [baseId, setBaseId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromptSections>(emptySections());
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'editar' | 'comparar'>('editar');
  const [diffA, setDiffA] = useState<string>('');
  const [diffB, setDiffB] = useState<string>('');
  const [saved, setSaved] = useState<string | null>(null);

  const base = versions?.find((v) => v.id === baseId) ?? versions?.[0];
  useEffect(() => {
    if (base && baseId === null) {
      setBaseId(base.id);
      setDraft(base.sections);
    }
  }, [base, baseId]);
  useEffect(() => {
    if (versions && versions.length >= 2 && !diffA) {
      setDiffA(versions[1].id);
      setDiffB(versions[0].id);
    }
  }, [versions, diffA]);

  const issues = useMemo(() => validateStructure(draft, project.inputVariable), [draft, project.inputVariable]);
  const dirty = base ? JSON.stringify(base.sections) !== JSON.stringify(draft) : SECTION_KEYS.some((k) => draft[k].trim());
  const preview = useMemo(() => renderPrompt(draft, { [project.inputVariable]: sampleCase?.input ?? '(texto del caso)' }), [draft, sampleCase, project.inputVariable]);
  const errors = issues.filter((i) => i.level === 'error');

  if (!prompt || !versions) return <p className="hint">Cargando…</p>;

  async function onSave() {
    if (!prompt || !note.trim()) return;
    const v = await saveVersion(prompt.id, draft, note.trim());
    setBaseId(v.id);
    setNote('');
    setSaved(`Versión ${v.number} guardada.`);
    setTimeout(() => setSaved(null), 4000);
  }

  return (
    <div>
      <SectionTitle
        aside={
          <div role="tablist" aria-label="Modo" className="inline-flex rounded-md border border-rule overflow-hidden">
            {(['editar', 'comparar'] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} className={`px-4 py-1.5 text-sm font-semibold ${mode === m ? 'bg-petrol text-white' : 'bg-sheet text-petrol'}`} onClick={() => setMode(m)}>
                {m === 'editar' ? 'Editar' : 'Comparar versiones'}
              </button>
            ))}
          </div>
        }
      >
        {prompt.name}
      </SectionTitle>

      <div className="grid gap-6 xl:grid-cols-[16rem_1fr]">
        <aside aria-label="Historial de versiones">
          <h3 className="font-semibold mb-2">Versiones</h3>
          {versions.length === 0 && <p className="hint">Todavía no hay versiones. Escribe el prompt y guárdalo como versión 1.</p>}
          <ol className="space-y-2">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (dirty && !window.confirm?.('Tienes cambios sin guardar. ¿Descartarlos?')) return;
                    setBaseId(v.id);
                    setDraft(v.sections);
                    setMode('editar');
                  }}
                  aria-current={base?.id === v.id ? 'true' : undefined}
                  className={`w-full text-left rounded-md border px-3 py-2 ${base?.id === v.id ? 'border-petrol bg-petrol-soft' : 'border-rule bg-sheet hover:border-petrol'}`}
                >
                  <span className="font-semibold text-sm">Versión {v.number}</span>{base?.id === v.id && <span className="pill pill-neutral ml-2">En edición</span>}
                  <span className="block text-xs text-muted">{fmtDate(v.createdAt)}</span>
                  <span className="block text-sm mt-1">{v.note}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {mode === 'comparar' ? (
          <section aria-label="Comparar versiones">
            {versions.length < 2 ? (
              <Notice>Necesitas al menos dos versiones para compararlas.</Notice>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 mb-4">
                  {[
                    ['Versión anterior', diffA, setDiffA, 'diff-a'],
                    ['Versión nueva', diffB, setDiffB, 'diff-b'],
                  ].map(([label, value, set, id]) => (
                    <div key={id as string}>
                      <label className="field-label" htmlFor={id as string}>{label as string}</label>
                      <select id={id as string} className="input" value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}>
                        {versions.map((v) => <option key={v.id} value={v.id}>Versión {v.number}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <SectionDiff before={versions.find((v) => v.id === diffA)?.sections ?? emptySections()} after={versions.find((v) => v.id === diffB)?.sections ?? emptySections()} />
                <p className="hint mt-3">Para saber si el cambio mejora los resultados, ejecuta ambas versiones sobre los mismos casos en el paso 3.</p>
              </>
            )}
          </section>
        ) : (
          <section aria-label="Editor del prompt" className="grid gap-6 2xl:grid-cols-[1fr_24rem]">
            <div className="space-y-4">
              <p className="hint">
                Editando a partir de la versión {base?.number ?? '—'}. {dirty ? <strong className="text-warn">Hay cambios sin guardar.</strong> : 'Sin cambios.'} Las variables se escriben entre llaves dobles, por ejemplo <code className="mono cm-variable px-1">{`{{${project.inputVariable}}}`}</code>.
              </p>
              {SECTION_KEYS.map((k) => (
                <div key={k}>
                  <label className="field-label" htmlFor={`sec-${k}`}>{SECTION_LABELS[k]}</label>
                  <p className="hint mb-1" id={`hint-${k}`}>{SECTION_HINTS[k]}</p>
                  <Editor id={`sec-${k}`} label={SECTION_LABELS[k]} value={draft[k]} onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} />
                </div>
              ))}
              <div className="panel p-4">
                <label className="field-label" htmlFor="version-note">Qué cambió y por qué</label>
                <textarea id="version-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: añado la regla de usar null cuando falta un dato." />
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <button className="btn btn-primary" onClick={onSave} disabled={!dirty || !note.trim() || errors.length > 0}>
                    Guardar como versión {(versions[0]?.number ?? 0) + 1}
                  </button>
                  {!note.trim() && dirty && <span className="hint">Escribe qué cambió para poder guardar.</span>}
                  {errors.length > 0 && <span className="hint">Corrige los errores estructurales para guardar.</span>}
                  {saved && <span role="status" className="pill pill-ok">✓ {saved}</span>}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="panel p-4">
                <h3 className="font-semibold mb-1">Validación estructural</h3>
                <p className="hint mb-3">Comprueba que el prompt tenga sus partes. No indica si sus resultados serán correctos: eso lo dice la comparación.</p>
                {issues.length === 0 ? (
                  <p className="pill pill-ok">✓ Sin observaciones</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {issues.map((i, n) => (
                      <li key={n} className="flex gap-2">
                        <span className={`pill ${i.level === 'error' ? 'pill-bad' : 'pill-warn'} shrink-0`}>{i.level === 'error' ? '✕ Error' : '! Aviso'}</span>
                        <span>{i.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel p-4">
                <h3 className="font-semibold mb-1">Vista previa con el caso {sampleCase?.code ?? ''}</h3>
                <p className="hint mb-3">Así llegarán los mensajes al modelo. Unos {roughTokens(preview.system + preview.user).toLocaleString('es-EC')} tokens de entrada (estimación).</p>
                <p className="text-xs font-semibold text-muted">Mensaje de sistema (instrucciones)</p>
                <pre tabIndex={0} aria-label="Mensaje de sistema" className="mono text-xs whitespace-pre-wrap bg-paper rounded p-2 max-h-56 overflow-auto mb-3">{preview.system || '(vacío)'}</pre>
                <p className="text-xs font-semibold text-muted">Mensaje de usuario (tarea y datos)</p>
                <pre tabIndex={0} aria-label="Mensaje de usuario" className="mono text-xs whitespace-pre-wrap bg-paper rounded p-2 max-h-56 overflow-auto">{preview.user || '(vacío)'}</pre>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
