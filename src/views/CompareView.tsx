import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CartesianGrid, Label, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { db } from '../db/db';
import { EmptyState, Notice, SectionTitle, Term, downloadText, fmtDate, fmtMs, fmtUsd } from '../components/ui';
import { comparePair, parseOutput, pct, scoreExecution, summarizeAlternative, type AlternativeSummary, type FieldOutcome } from '../domain/metrics';
import { PROVIDER_NAMES } from '../providers';
import type { Alternative, Execution, Project, Run, TestCase } from '../domain/types';

const OUTCOME_LABEL: Record<FieldOutcome, string> = { correcto: 'Correcto', incorrecto: 'Incorrecto', omision: 'Omisión', inventado: 'Valor inventado', sin_salida: 'Sin salida legible' };
const OUTCOME_MARK: Record<FieldOutcome, string> = { correcto: '✓', incorrecto: '✕', omision: '∅', inventado: '+', sin_salida: '—' };

export function CompareView({ project, runId }: { project: Project; runId?: string }) {
  const runs = useLiveQuery(() => db.runs.where('projectId').equals(project.id).reverse().sortBy('createdAt'), [project.id]);
  const run = runs?.find((r) => r.id === runId) ?? runs?.find((r) => r.status !== 'en curso');
  const executions = useLiveQuery(() => (run ? db.executions.where('runId').equals(run.id).toArray() : []), [run?.id]);
  const cases = useLiveQuery(() => (run ? db.cases.bulkGet(run.caseIds) : []), [run?.id]);

  if (!runs) return <p className="hint">Cargando…</p>;
  if (!run) {
    return (
      <EmptyState title="Todavía no hay resultados" action={<a className="btn btn-primary" href={`#/p/${project.id}/ejecutar`}>Ir a ejecutar</a>}>
        Ejecuta al menos dos alternativas sobre los mismos casos para poder compararlas.
      </EmptyState>
    );
  }
  return (
    <div>
      <SectionTitle
        aside={
          <div>
            <label className="sr-only" htmlFor="run-select">Ejecución</label>
            <select id="run-select" className="input" value={run.id} onChange={(e) => (window.location.hash = `/p/${project.id}/comparar/${e.target.value}`)}>
              {runs.filter((r) => r.status !== 'en curso').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        }
      >
        Comparar
      </SectionTitle>
      {executions && cases ? <Results project={project} run={run} executions={executions} cases={cases.filter(Boolean) as TestCase[]} /> : <p className="hint">Cargando resultados…</p>}
    </div>
  );
}

function Results({ project, run, executions, cases }: { project: Project; run: Run; executions: Execution[]; cases: TestCase[] }) {
  const summaries = useMemo(
    () => run.alternatives.map((a) => summarizeAlternative(a, executions, cases, project.fields, run.prices, run.requirements)),
    [run, executions, cases, project.fields],
  );
  const byId = new Map(summaries.map((s) => [s.alternativeId, s]));
  const [pairA, setPairA] = useState(run.alternatives[0]?.id ?? '');
  const [pairB, setPairB] = useState(run.alternatives[1]?.id ?? '');
  const [inspect, setInspect] = useState<{ altId: string; caseId: string } | null>(null);
  const cancelled = executions.filter((e) => e.status === 'cancelada').length;

  const pair = byId.get(pairA) && byId.get(pairB) && pairA !== pairB ? comparePair(byId.get(pairA)!, byId.get(pairB)!, run.requirements.relevance) : null;
  const altById = new Map(run.alternatives.map((a) => [a.id, a]));
  const chartData = summaries
    .filter((s) => s.costPerCase !== null)
    .map((s) => ({ x: s.costPerCase! * 1000, y: Math.round(s.accuracy * 1000) / 10, name: altById.get(s.alternativeId)!.label, alt: altById.get(s.alternativeId)!, z: 1 }));
  // Color por modelo y forma por versión, para que cada punto se identifique sin depender solo del color.
  const modelList = [...new Set(run.alternatives.map((a) => a.model))];
  const versionList = [...new Set(run.alternatives.map((a) => a.versionId))];
  const COLORS = ['#0b5568', '#c07a12', '#7a3f8f', '#2a7a4b', '#b03a3a'];
  const SHAPES = ['circle', 'diamond', 'triangle', 'square', 'star'] as const;
  const yMin = chartData.length ? Math.max(0, Math.floor((Math.min(...chartData.map((d) => d.y)) - 5) / 5) * 5) : 0;

  function exportCsv() {
    const header = ['alternativa', 'proveedor', 'modelo', 'caso', 'repeticion', 'estado', 'json_valido', 'esquema', 'exactitud', 'tokens_entrada', 'tokens_cache', 'tokens_salida', 'ttft_ms', 'total_ms', 'error'];
    const caseById = new Map(cases.map((c) => [c.id, c]));
    const rows = executions.map((e) => {
      const a = altById.get(e.alternativeId)!;
      const tc = caseById.get(e.caseId)!;
      const s = scoreExecution(e, tc, project.fields);
      return [a.label, a.provider, a.model, tc.code, e.repetition, e.status, s.validJson, s.schema, s.accuracy.toFixed(4), e.usage?.input ?? '', e.usage?.cachedInput ?? '', e.usage?.output ?? '', e.ttftMs?.toFixed(0) ?? '', e.totalMs?.toFixed(0) ?? '', (e.error ?? '').replaceAll('"', "'")];
    });
    downloadText(`promptlab-${run.name.replace(/\W+/g, '-')}.csv`, [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n'), 'text/csv');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{fmtDate(run.createdAt)} · {cases.length} casos × {run.repetitions} repeticiones · tarifas consultadas el {run.prices[0]?.checkedAt ?? '—'}</span>
        <span className={`pill ${run.status === 'completada' ? 'pill-ok' : 'pill-warn'}`}>{run.status}</span>
        {run.simulated && <span className="pill pill-warn">Resultados simulados: no representan modelos reales</span>}
        <button className="btn btn-ghost ml-auto" onClick={exportCsv}>Descargar resultados (CSV)</button>
      </div>
      {cancelled > 0 && <Notice tone="warn">{cancelled} llamadas no llegaron a ejecutarse ({run.status}). Las métricas solo usan las ejecuciones realizadas.</Notice>}

      <section aria-labelledby="sum-title">
        <h3 id="sum-title" className="font-semibold mb-1">Resumen por alternativa</h3>
        <p className="hint mb-2">Valores originales de cada métrica. Pasa el cursor o enfoca cada encabezado para ver su definición.</p>
        <div className="overflow-x-auto panel">
          <table className="tbl min-w-[60rem]">
            <thead>
              <tr>
                <th>Alternativa</th>
                <th className="num"><Term def="Proporción de ejecuciones cuya salida es un JSON que se puede leer.">JSON válido</Term></th>
                <th className="num"><Term def="Proporción de ejecuciones con todos los campos, tipos correctos y sin campos adicionales.">Cumple esquema</Term></th>
                <th className="num"><Term def="Proporción de campos iguales a la referencia: media por caso de sus repeticiones y luego media entre casos.">Exactitud por campo</Term></th>
                <th className="num"><Term def="Casos cuyas repeticiones extrajeron valores distintos.">Casos inconsistentes</Term></th>
                <th className="num"><Term def="Llamadas que fallaron tras un reintento. Cuentan con exactitud 0.">Fallos</Term></th>
                <th className="num"><Term def="Suma de (tokens de cada categoría × tarifa) / 1 000 000. Excluye impuestos, descuentos y redondeos de facturación.">Coste estimado</Term></th>
                <th className="num"><Term def="Mediana del tiempo hasta el primer fragmento de texto, medido en el navegador.">Primer token</Term></th>
                <th className="num"><Term def="Mediana del tiempo total de respuesta, medido en el navegador; incluye la red.">Tiempo total</Term></th>
                <th className="num"><Term def="Percentil 95 del tiempo total. Solo se muestra con 20 observaciones o más.">P95</Term></th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const a = altById.get(s.alternativeId)!;
                return (
                  <tr key={s.alternativeId}>
                    <td>
                      <span className="font-semibold">{a.label}</span>
                      <span className="block text-xs text-muted">{PROVIDER_NAMES[a.provider]}{a.temperature !== null ? ` · temperatura ${a.temperature}` : ''}</span>
                    </td>
                    <td className="num">{pct(s.validJsonRate)}{s.fencedCount > 0 && <span className="block text-xs text-muted">{s.fencedCount} en bloque de código</span>}</td>
                    <td className="num">
                      {pct(s.schemaRate)}
                      <span className={`block mt-1 pill ${s.meetsSchema ? 'pill-ok' : 'pill-bad'}`}>{s.meetsSchema ? '✓ cumple' : `✕ no cumple (mín. ${pct(run.requirements.minSchema, 0)})`}</span>
                    </td>
                    <td className="num font-semibold text-base">{pct(s.accuracy)}</td>
                    <td className="num">{s.inconsistentCases} de {s.casesEvaluated}</td>
                    <td className="num">{s.failures}</td>
                    <td className="num">
                      {fmtUsd(s.costTotal)}
                      <span className="block text-xs text-muted">{s.costPerCase !== null ? `${fmtUsd(s.costPerCase, 5)} por caso` : ''}{s.costUnavailable ? ` · ${s.costUnavailable} sin consumo` : ''}</span>
                    </td>
                    <td className="num">{fmtMs(s.ttftMedian)}</td>
                    <td className="num">{fmtMs(s.totalMedian)}</td>
                    <td className="num">{s.totalP95 === null ? <span className="text-muted">— (n &lt; 20)</span> : fmtMs(s.totalP95)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1fr_28rem]" aria-label="Comparación entre dos alternativas">
        <div className="panel p-4">
          <h3 className="font-semibold mb-1">Exactitud por caso</h3>
          <p className="hint mb-3">Cada celda es un caso. El número indica cuántos campos coincidieron con la referencia (media de las repeticiones). Selecciona una celda para ver las salidas.</p>
          <CaseStrip run={run} summaries={summaries} cases={cases} fields={project.fields.length} onPick={(altId, caseId) => setInspect({ altId, caseId })} selected={inspect} />
        </div>
        <div className="panel p-4 border-petrol">
          <h3 className="font-semibold mb-3">Comparar dos alternativas</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="field-label" htmlFor="pair-a">A</label>
              <select id="pair-a" className="input" value={pairA} onChange={(e) => setPairA(e.target.value)}>{run.alternatives.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
            </div>
            <div>
              <label className="field-label" htmlFor="pair-b">B</label>
              <select id="pair-b" className="input" value={pairB} onChange={(e) => setPairB(e.target.value)}>{run.alternatives.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
            </div>
          </div>
          {pair ? (
            <div aria-live="polite">
              <p className={`text-lg font-bold ${pair.verdict === 'insuficiente' ? 'text-warn' : 'text-petrol'}`}>
                {pair.verdict === 'insuficiente' ? 'Evidencia insuficiente' : `${altById.get(pair.verdict === 'A' ? pairA : pairB)!.label} extrajo mejor en estos casos`}
              </p>
              <p className="text-sm mt-1">{pair.reason}</p>
              <dl className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="bg-paper rounded p-2"><dt className="text-xs text-muted">A mejor</dt><dd className="text-xl font-bold">{pair.aBetter}</dd></div>
                <div className="bg-paper rounded p-2"><dt className="text-xs text-muted">Empate</dt><dd className="text-xl font-bold">{pair.ties}</dd></div>
                <div className="bg-paper rounded p-2"><dt className="text-xs text-muted">B mejor</dt><dd className="text-xl font-bold">{pair.bBetter}</dd></div>
              </dl>
              <p className="hint mt-3">Es una comparación descriptiva sobre estos casos, no una prueba estadística. Revisa también el formato, el coste y la latencia antes de decidir.</p>
              {(!byId.get(pairA)!.meetsSchema || !byId.get(pairB)!.meetsSchema) && <div className="mt-3"><Notice tone="warn">Al menos una de las dos no cumple el requisito mínimo de esquema.</Notice></div>}
            </div>
          ) : (
            <p className="hint">Elige dos alternativas distintas.</p>
          )}
        </div>
      </section>

      {inspect && <Inspector project={project} run={run} executions={executions} cases={cases} {...inspect} onClose={() => setInspect(null)} />}

      <section className="grid gap-6 2xl:grid-cols-2">
        <div className="panel p-4">
          <h3 className="font-semibold mb-1">Exactitud frente a coste</h3>
          <p className="hint mb-3">Arriba a la izquierda: más exacta y más barata. El color indica el modelo y la forma, la versión del prompt. El coste es estimado.</p>
          {chartData.length ? (
            <div className="h-72" role="img" aria-label={`Gráfico de exactitud frente a coste: ${chartData.map((d) => `${d.name}, ${d.y} % y ${d.x.toFixed(3)} USD por mil casos`).join('; ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 8 }}>
                  <CartesianGrid stroke="#d5dfdd" />
                  <XAxis type="number" dataKey="x" stroke="#55696f" tickFormatter={(v: number) => v.toFixed(2)}>
                    <Label value="USD por cada 1000 casos" position="bottom" offset={8} fill="#55696f" />
                  </XAxis>
                  <YAxis type="number" dataKey="y" domain={[yMin, 100]} unit=" %" stroke="#55696f" />
                  <ZAxis type="number" dataKey="z" range={[420, 420]} />
                  <Legend verticalAlign="top" height={40} wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip formatter={(v, n) => (n === 'y' ? `${v} %` : `${Number(v).toFixed(3)} USD / 1000 casos`)} labelFormatter={() => ''} />
                  {chartData.map((d) => (
                    <Scatter key={d.name} name={d.name} data={[d]} fill={COLORS[modelList.indexOf(d.alt.model) % COLORS.length]} shape={SHAPES[versionList.indexOf(d.alt.versionId) % SHAPES.length]} legendType={SHAPES[versionList.indexOf(d.alt.versionId) % SHAPES.length]} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="hint">No hay datos de consumo para estimar el coste.</p>
          )}
        </div>
        <div className="panel p-4 overflow-x-auto">
          <h3 className="font-semibold mb-1">Resultados por campo</h3>
          <p className="hint mb-3">Proporción de aciertos de cada campo. Entre paréntesis, omisiones (∅) y valores inventados (+).</p>
          <table className="tbl">
            <thead><tr><th>Campo</th>{run.alternatives.map((a) => <th key={a.id} className="num">{a.label}</th>)}</tr></thead>
            <tbody>
              {project.fields.map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  {summaries.map((s) => {
                    const st = s.byField[f.key];
                    const n = Object.values(st).reduce((a, b) => a + b, 0);
                    return (
                      <td key={s.alternativeId} className="num">
                        {n ? pct(st.correcto / n, 0) : '—'}
                        <span className="text-xs text-muted"> ({st.omision}∅ {st.inventado}+)</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CaseStrip({ run, summaries, cases, fields, onPick, selected }: { run: Run; summaries: AlternativeSummary[]; cases: TestCase[]; fields: number; onPick: (a: string, c: string) => void; selected: { altId: string; caseId: string } | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left font-semibold text-muted pr-2">Alternativa</th>
            {cases.map((c) => <th key={c.id} className="mono font-normal text-muted" title={`${c.code} · ${c.kind}`}>{c.code.replace(/^F/, '')}{c.kind !== 'completa' ? '*' : ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {run.alternatives.map((a: Alternative) => {
            const s = summaries.find((x) => x.alternativeId === a.id)!;
            return (
              <tr key={a.id}>
                <th scope="row" className="text-left font-semibold pr-2 whitespace-nowrap">{a.label}</th>
                {cases.map((c) => {
                  const v = s.perCase[c.id];
                  const isSel = selected?.altId === a.id && selected.caseId === c.id;
                  if (v === undefined) return <td key={c.id}><span className="block w-9 h-9 rounded bg-paper text-muted grid place-items-center" title="Sin ejecutar">·</span></td>;
                  const [bg, fg] = v >= 0.999 ? ['var(--color-ok)', '#fff'] : v >= 0.8 ? ['var(--color-ok-soft)', 'var(--color-ok)'] : v >= 0.5 ? ['var(--color-marker)', 'var(--color-ink)'] : ['var(--color-bad)', '#fff'];
                  return (
                    <td key={c.id}>
                      <button
                        type="button"
                        onClick={() => onPick(a.id, c.id)}
                        className={`w-9 h-9 rounded font-bold grid place-items-center ${isSel ? 'ring-2 ring-ink ring-offset-1' : ''}`}
                        style={{ background: bg, color: fg, border: v >= 0.8 && v < 0.999 ? '1px solid var(--color-ok)' : undefined }}
                        aria-label={`${a.label}, caso ${c.code}: ${Math.round(v * fields * 10) / 10} de ${fields} campos correctos`}
                      >
                        {Math.round(v * fields)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted mt-2">* Caso incompleto o ambiguo. Verde intenso: todos los campos correctos; verde claro: 80 % o más; ámbar: entre la mitad y el 80 %; rojo: menos de la mitad.</p>
    </div>
  );
}

function Inspector({ project, run, executions, cases, altId, caseId, onClose }: { project: Project; run: Run; executions: Execution[]; cases: TestCase[]; altId: string; caseId: string; onClose: () => void }) {
  const tc = cases.find((c) => c.id === caseId)!;
  const alt = run.alternatives.find((a) => a.id === altId)!;
  const execs = executions.filter((e) => e.alternativeId === altId && e.caseId === caseId).sort((a, b) => a.repetition - b.repetition);
  return (
    <section className="panel p-4 border-petrol" aria-label={`Detalle de ${alt.label} en el caso ${tc.code}`}>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-semibold mr-auto">{alt.label} · caso <span className="mono">{tc.code}</span> ({tc.kind})</h3>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar detalle</button>
      </div>
      <div className="grid gap-4 2xl:grid-cols-[22rem_1fr]">
        <details open>
          <summary className="cursor-pointer font-semibold text-sm mb-2">Texto del caso</summary>
          <pre tabIndex={0} aria-label="Texto del caso" className="mono text-xs whitespace-pre-wrap bg-paper rounded p-2 max-h-96 overflow-auto">{tc.input}</pre>
        </details>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Referencia</th>
                {execs.map((e) => <th key={e.id}>Repetición {e.repetition}</th>)}
              </tr>
            </thead>
            <tbody>
              {project.fields.map((f) => (
                <tr key={f.key}>
                  <td className="whitespace-nowrap">{f.label}</td>
                  <td className="mono text-xs">{tc.expected[f.key] === null ? <span className="text-muted">null</span> : String(tc.expected[f.key])}</td>
                  {execs.map((e) => {
                    const s = scoreExecution(e, tc, project.fields);
                    const val = parseOutput(e.output).value?.[f.key];
                    const o = s.outcomes[f.key];
                    return (
                      <td key={e.id} className="mono text-xs">
                        <span className={`pill mr-1 ${o === 'correcto' ? 'pill-ok' : 'pill-bad'}`} title={OUTCOME_LABEL[o]}>{OUTCOME_MARK[o]}<span className="sr-only">{OUTCOME_LABEL[o]}</span></span>
                        {val === undefined ? '' : val === null ? <span className="text-muted">null</span> : String(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td>Ejecución</td><td></td>
                {execs.map((e) => <td key={e.id} className="text-xs">{e.status === 'ok' ? `${fmtMs(e.totalMs)} · ${e.usage ? `${e.usage.input}+${e.usage.output} tokens` : 'consumo no disponible'}` : <span className="text-bad">{e.error ?? e.status}</span>}{e.retries ? ` · ${e.retries} reintento` : ''}</td>)}
              </tr>
            </tbody>
          </table>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">Ver salidas en bruto</summary>
            {execs.map((e) => <pre key={e.id} tabIndex={0} aria-label={`Salida de la repetición ${e.repetition}`} className="mono text-xs whitespace-pre-wrap bg-paper rounded p-2 mt-2 max-h-60 overflow-auto">{`Repetición ${e.repetition}:\n${e.output || e.error || '(vacía)'}`}</pre>)}
          </details>
          <p className="text-xs text-muted mt-2">✓ correcto · ✕ incorrecto · ∅ omisión · + valor inventado · — sin salida legible</p>
        </div>
      </div>
    </section>
  );
}
