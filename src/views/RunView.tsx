import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db/db';
import { ConfirmButton, EmptyState, Notice, SectionTitle, Term, fmtDate, fmtUsd } from '../components/ui';
import { ADAPTERS, PROVIDER_NAMES } from '../providers';
import { executeRun } from '../domain/engine';
import { forecastRun } from '../domain/metrics';
import { renderPrompt, roughTokens } from '../domain/prompt';
import { getKey, useProgress, useSession } from '../store/session';
import type { Alternative, Project, ProviderId, Run } from '../domain/types';

let activeController: AbortController | null = null;

export function RunView({ project, onDone }: { project: Project; onDone: (runId: string) => void }) {
  const prompt = useLiveQuery(() => db.prompts.where('projectId').equals(project.id).first(), [project.id]);
  const versions = useLiveQuery(async () => (prompt ? (await db.versions.where('promptId').equals(prompt.id).sortBy('number')).reverse() : []), [prompt?.id]);
  const cases = useLiveQuery(() => db.cases.where('projectId').equals(project.id).sortBy('code'), [project.id]);
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const runs = useLiveQuery(() => db.runs.where('projectId').equals(project.id).reverse().sortBy('createdAt'), [project.id]);
  const keys = useSession((s) => s.keys);
  const progress = useProgress();

  const [alts, setAlts] = useState<Alternative[]>([]);
  const [split, setSplit] = useState<'prueba' | 'ajuste' | 'todos'>('prueba');
  const [reps, setReps] = useState(3);
  const [limit, setLimit] = useState(2);
  const [minSchema, setMinSchema] = useState(95);
  const [relevance, setRelevance] = useState(2);
  const [name, setName] = useState('');
  const [overLimitOk, setOverLimitOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = progress.runId !== null;
  const initialized = useRef(false);

  // Una ejecución que quedó «en curso» tras recargar la página ya no puede continuar.
  useEffect(() => {
    if (running) return;
    db.runs.where('projectId').equals(project.id).filter((r) => r.status === 'en curso').modify({ status: 'cancelada' });
  }, [project.id, running]);

  // Propuesta inicial: las dos últimas versiones con dos modelos (simulados si no hay claves).
  useEffect(() => {
    if (initialized.current || !versions || !prices || versions.length === 0) return;
    initialized.current = true;
    const hasReal = (['openai', 'anthropic'] as ProviderId[]).filter((p) => keys[p]);
    const models = hasReal.length
      ? hasReal.map((p) => prices.find((x) => x.provider === p)!).filter(Boolean)
      : prices.filter((p) => p.provider === 'mock').slice(0, 2);
    const vs = versions.slice(0, 2).reverse();
    setAlts(vs.flatMap((v) => models.map((m) => newAlt(v.id, m.provider, m.model, v.number))));
  }, [versions, prices, keys]);

  const selectedCases = useMemo(() => (cases ?? []).filter((c) => split === 'todos' || c.split === split), [cases, split]);
  const versionTokens = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of versions ?? []) {
      const r = renderPrompt(v.sections, { [project.inputVariable]: '' });
      out[v.id] = roughTokens(r.system + r.user);
    }
    return out;
  }, [versions, project.inputVariable]);
  const forecast = useMemo(
    () => forecastRun(alts, versionTokens, selectedCases.map((c) => roughTokens(c.input)), reps, prices ?? []),
    [alts, versionTokens, selectedCases, reps, prices],
  );

  if (!versions || !cases || !prices || !runs) return <p className="hint">Cargando…</p>;
  if (versions.length === 0) return <EmptyState title="No hay versiones de prompt" action={<a className="btn btn-primary" href={`#/p/${project.id}/prompt`}>Ir al paso 1</a>}>Guarda al menos una versión del prompt para poder ejecutarla.</EmptyState>;
  if (cases.length === 0) return <EmptyState title="No hay casos de prueba" action={<a className="btn btn-primary" href={`#/p/${project.id}/casos`}>Ir al paso 2</a>}>Añade casos con sus valores esperados para poder comparar.</EmptyState>;

  const vNum = (id: string) => versions.find((v) => v.id === id)?.number ?? '?';
  const providersUsed = [...new Set(alts.map((a) => a.provider))];
  const missingKeys = providersUsed.filter((p) => ADAPTERS[p].needsKey && !keys[p]);
  const mixed = providersUsed.includes('mock') && providersUsed.some((p) => p !== 'mock');
  const dupLabels = new Set(alts.map((a) => `${a.versionId}|${a.provider}|${a.model}`)).size !== alts.length;
  const overLimit = forecast.cost !== null && limit > 0 && forecast.cost > limit;
  const blockers = [
    alts.length === 0 && 'Añade al menos una alternativa.',
    selectedCases.length === 0 && 'El conjunto elegido no tiene casos.',
    missingKeys.length > 0 && `Falta la clave de ${missingKeys.map((p) => PROVIDER_NAMES[p]).join(' y ')}. Añádela en Ajustes y claves.`,
    mixed && 'No mezcles el proveedor simulado con proveedores reales en una misma ejecución: sus resultados no son comparables.',
    dupLabels && 'Hay dos alternativas idénticas.',
    overLimit && !overLimitOk && 'La previsión supera el límite de gasto: confírmalo o reduce la ejecución.',
  ].filter(Boolean) as string[];

  function update(id: string, patch: Partial<Alternative>) {
    setAlts((as) => as.map((a) => (a.id === id ? relabel({ ...a, ...patch }, vNum) : a)));
  }

  async function start() {
    setError(null);
    const run: Run = {
      id: uid(),
      projectId: project.id,
      name: name.trim() || `Ejecución del ${new Date().toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}`,
      alternatives: alts,
      caseIds: selectedCases.map((c) => c.id),
      repetitions: reps,
      prices: prices!.filter((p) => alts.some((a) => a.provider === p.provider && a.model === p.model)),
      requirements: { minSchema: minSchema / 100, relevance: relevance / 100 },
      spendLimitUsd: limit,
      status: 'en curso',
      simulated: providersUsed.includes('mock'),
      createdAt: Date.now(),
    };
    await db.runs.add(run);
    activeController = new AbortController();
    useProgress.getState().set({ runId: run.id, done: 0, total: forecast.calls, spent: 0, errors: 0, message: 'Iniciando…' });
    try {
      const outcome = await executeRun(
        { run, versions: new Map(versions!.map((v) => [v.id, v])), cases: selectedCases, inputVariable: project.inputVariable, signal: activeController.signal },
        {
          adapters: ADAPTERS,
          getKey: (p) => getKey(p as ProviderId),
          saveExecution: async (e) => void (await db.executions.add(e)),
          onProgress: (p) => useProgress.getState().set(p),
          uid,
        },
      );
      await db.runs.update(run.id, { status: outcome, finishedAt: Date.now() });
      useProgress.getState().set({ runId: null });
      onDone(run.id);
    } catch (e) {
      await db.runs.update(run.id, { status: 'con errores', finishedAt: Date.now() });
      useProgress.getState().set({ runId: null });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      activeController = null;
    }
  }

  return (
    <div>
      <SectionTitle>Ejecutar</SectionTitle>
      {running ? (
        <div className="panel p-5 mb-6" aria-live="polite">
          <h3 className="font-semibold mb-2">Ejecución en curso</h3>
          <progress className="w-full h-3 accent-petrol" max={progress.total} value={progress.done} aria-label="Progreso de la ejecución" />
          <p className="text-sm mt-2">
            {progress.done} de {progress.total} llamadas · gasto estimado {fmtUsd(progress.spent)} · {progress.errors} errores
          </p>
          <p className="hint">{progress.message}</p>
          <button className="btn btn-danger mt-3" onClick={() => activeController?.abort()}>Cancelar ejecución</button>
          <p className="hint mt-2">Al cancelar se conservan los resultados ya obtenidos.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {error && <Notice tone="bad" title="La ejecución no pudo completarse">{error}</Notice>}
          <section className="panel p-4" aria-labelledby="alts-title">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h3 id="alts-title" className="font-semibold mr-auto">Alternativas a comparar</h3>
              <button className="btn btn-ghost" onClick={() => setAlts((a) => [...a, relabel(newAlt(versions[0].id, 'mock', 'simulado-preciso', versions[0].number), vNum)])}>Añadir alternativa</button>
            </div>
            <p className="hint mb-3">
              Cada alternativa es una versión de prompt con un modelo. Para saber qué versión funciona mejor, compara versiones con el mismo modelo; para elegir modelo, compara modelos con la misma versión.
            </p>
            <div className="overflow-x-auto">
              <table className="tbl min-w-[52rem]">
                <thead>
                  <tr>
                    <th>Versión</th><th>Proveedor</th><th>Modelo</th>
                    <th><Term def="Si no se marca, no se envía y el modelo usa su valor por defecto. Algunos modelos no admiten este parámetro.">Temperatura</Term></th>
                    <th>Máx. tokens de salida</th><th><span className="sr-only">Quitar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {alts.map((a) => {
                    const models = prices.filter((p) => p.provider === a.provider);
                    return (
                      <tr key={a.id}>
                        <td>
                          <select aria-label="Versión" className="input min-w-[8.5rem]" value={a.versionId} onChange={(e) => update(a.id, { versionId: e.target.value })}>
                            {versions.map((v) => <option key={v.id} value={v.id}>Versión {v.number}</option>)}
                          </select>
                        </td>
                        <td>
                          <select aria-label="Proveedor" className="input" value={a.provider} onChange={(e) => { const p = e.target.value as ProviderId; update(a.id, { provider: p, model: prices.find((x) => x.provider === p)?.model ?? '' }); }}>
                            {(Object.keys(ADAPTERS) as ProviderId[]).map((p) => <option key={p} value={p}>{PROVIDER_NAMES[p]}{ADAPTERS[p].needsKey && !keys[p] ? ' (sin clave)' : ''}</option>)}
                          </select>
                        </td>
                        <td>
                          <input aria-label="Modelo" className="input mono" list={`models-${a.id}`} value={a.model} onChange={(e) => update(a.id, { model: e.target.value })} />
                          <datalist id={`models-${a.id}`}>{models.map((m) => <option key={m.id} value={m.model} />)}</datalist>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <input type="checkbox" aria-label="Enviar temperatura" checked={a.temperature !== null} onChange={(e) => update(a.id, { temperature: e.target.checked ? 0 : null })} />
                            <input aria-label="Temperatura" type="number" min={0} max={2} step={0.1} className="input w-20" disabled={a.temperature === null} value={a.temperature ?? ''} onChange={(e) => update(a.id, { temperature: Number(e.target.value) })} />
                          </div>
                        </td>
                        <td><input aria-label="Máximo de tokens de salida" type="number" min={64} max={8192} step={64} className="input w-28" value={a.maxOutputTokens} onChange={(e) => update(a.id, { maxOutputTokens: Number(e.target.value) })} /></td>
                        <td><button className="btn btn-ghost" aria-label={`Quitar ${a.label}`} onClick={() => setAlts((as) => as.filter((x) => x.id !== a.id))}>Quitar</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel p-4 grid gap-4 md:grid-cols-3" aria-label="Configuración">
            <div>
              <label className="field-label" htmlFor="run-cases">Casos</label>
              <select id="run-cases" className="input" value={split} onChange={(e) => setSplit(e.target.value as typeof split)}>
                <option value="prueba">Prueba ({cases.filter((c) => c.split === 'prueba').length})</option>
                <option value="ajuste">Ajuste ({cases.filter((c) => c.split === 'ajuste').length})</option>
                <option value="todos">Todos ({cases.length})</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="run-reps">Repeticiones por caso</label>
              <input id="run-reps" type="number" min={1} max={5} className="input" value={reps} onChange={(e) => setReps(Math.min(5, Math.max(1, Number(e.target.value))))} />
              <p className="hint">Permiten ver si un mismo caso da resultados distintos.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="run-limit">Límite de gasto (USD)</label>
              <input id="run-limit" type="number" min={0} step={0.5} className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
              <p className="hint">La ejecución se detiene al alcanzarlo. 0 = sin límite.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="run-schema">Requisito mínimo de esquema (%)</label>
              <input id="run-schema" type="number" min={0} max={100} className="input" value={minSchema} onChange={(e) => setMinSchema(Number(e.target.value))} />
              <p className="hint">Las alternativas por debajo se marcarán como «no cumple».</p>
            </div>
            <div>
              <label className="field-label" htmlFor="run-rel">Umbral de relevancia (puntos de exactitud)</label>
              <input id="run-rel" type="number" min={0} max={50} step={0.5} className="input" value={relevance} onChange={(e) => setRelevance(Number(e.target.value))} />
              <p className="hint">Diferencias menores se mostrarán como evidencia insuficiente.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="run-name">Nombre (opcional)</label>
              <input id="run-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo: v1 frente a v2" />
            </div>
          </section>

          <section className="panel p-4 border-petrol" aria-label="Previsión">
            <h3 className="font-semibold mb-2">Antes de ejecutar</h3>
            <p className="text-sm">
              {alts.length} alternativas × {selectedCases.length} casos × {reps} repeticiones = <strong>{forecast.calls} llamadas</strong>.{' '}
              Coste previsto: <strong>{forecast.cost === null ? 'no disponible' : `≈ ${fmtUsd(forecast.cost)}`}</strong>
              {forecast.missingPrices.length > 0 && <> (sin tarifa para {forecast.missingPrices.join(', ')})</>}.
            </p>
            <p className="hint">La previsión supone que cada respuesta ocupa la mitad del máximo de tokens de salida. El coste real se calcula con el consumo que informa el proveedor.</p>
            {providersUsed.includes('mock') && !mixed && <p className="mt-2"><span className="pill pill-warn">Modo simulado</span> <span className="hint">Los resultados no representan modelos reales.</span></p>}
            {overLimit && (
              <label className="flex gap-2 items-start mt-3 text-sm">
                <input type="checkbox" checked={overLimitOk} onChange={(e) => setOverLimitOk(e.target.checked)} />
                La previsión supera el límite de {fmtUsd(limit, 2)}. Entiendo que la ejecución se detendrá al alcanzarlo.
              </label>
            )}
            {blockers.length > 0 && (
              <ul className="mt-3 space-y-1">
                {blockers.map((b) => <li key={b} className="text-sm text-bad">✕ {b}</li>)}
              </ul>
            )}
            <button className="btn btn-primary mt-4" disabled={blockers.length > 0} onClick={start}>Ejecutar {forecast.calls} llamadas</button>
          </section>
        </div>
      )}

      <section className="mt-8" aria-labelledby="hist-title">
        <h3 id="hist-title" className="font-semibold mb-2">Ejecuciones anteriores</h3>
        {runs.length === 0 ? (
          <p className="hint">Todavía no hay ejecuciones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl panel">
              <thead><tr><th>Nombre</th><th>Fecha</th><th>Estado</th><th className="num">Alternativas</th><th className="num">Casos</th><th></th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name} {r.simulated && <span className="pill pill-warn ml-1">Simulado</span>}</td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td><span className={`pill ${r.status === 'completada' ? 'pill-ok' : r.status === 'en curso' ? 'pill-neutral' : 'pill-warn'}`}>{r.status}</span></td>
                    <td className="num">{r.alternatives.length}</td>
                    <td className="num">{r.caseIds.length} × {r.repetitions}</td>
                    <td className="whitespace-nowrap">
                      <a className="btn btn-ghost mr-2" href={`#/p/${project.id}/comparar/${r.id}`}>Ver comparación</a>
                      <ConfirmButton label="Eliminar" confirmLabel="Eliminar ejecución" disabled={r.status === 'en curso'} onConfirm={async () => { await db.executions.where('runId').equals(r.id).delete(); await db.runs.delete(r.id); }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function newAlt(versionId: string, provider: ProviderId, model: string, vnum: number): Alternative {
  return { id: uid(), label: `v${vnum} · ${model}`, versionId, provider, model, temperature: null, maxOutputTokens: 600 };
}

function relabel(a: Alternative, vNum: (id: string) => number | string): Alternative {
  return { ...a, label: `v${vNum(a.versionId)} · ${a.model}` };
}
