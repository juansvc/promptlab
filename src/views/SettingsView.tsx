import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db/db';
import { ensurePrices, exportAll, importAll, wipeAll } from '../db/repo';
import { ConfirmButton, Notice, SectionTitle, downloadText, fmtDate } from '../components/ui';
import { ADAPTERS, PROVIDER_NAMES, REAL_PROVIDERS } from '../providers';
import { useSession } from '../store/session';
import type { ModelPrice, ProviderId } from '../domain/types';

const KEY_HELP: Record<string, string> = {
  openai: 'platform.openai.com → API keys. Usa una clave de proyecto con límite de gasto.',
  anthropic: 'platform.claude.com → API keys. Configura un límite de gasto en la consola.',
  gemini: 'aistudio.google.com → Get API key. Restringe la clave a la API de Gemini.',
};

export function SettingsView() {
  return (
    <div className="space-y-10 max-w-5xl">
      <KeysSection />
      <ProviderCheckSection />
      <PricesSection />
      <DataSection />
    </div>
  );
}

function KeysSection() {
  const { keys, setKey, clearKeys } = useSession();
  return (
    <section aria-labelledby="keys-title">
      <SectionTitle><span id="keys-title">Claves de API</span></SectionTitle>
      <Notice title="Cómo se tratan tus claves">
        <p>Se guardan solo en la memoria de esta pestaña. No se escriben en el almacenamiento del navegador ni en las exportaciones, y se borran al recargar o cerrar la pestaña.</p>
        <p>Se envían únicamente al proveedor correspondiente, directamente desde tu navegador. Aun así, cualquier código que se ejecute en la página podría leerlas: usa claves propias con límite de gasto y revócalas al terminar.</p>
      </Notice>
      <div className="grid gap-4 md:grid-cols-3 mt-4">
        {REAL_PROVIDERS.map((p) => (
          <div key={p} className="panel p-4">
            <label className="field-label" htmlFor={`key-${p}`}>{PROVIDER_NAMES[p]}</label>
            <input
              id={`key-${p}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="input mono"
              value={keys[p] ?? ''}
              onChange={(e) => setKey(p, e.target.value)}
              placeholder="Pega la clave"
              aria-describedby={`key-help-${p}`}
            />
            <p id={`key-help-${p}`} className="hint mt-1">{KEY_HELP[p]}</p>
            <p className="mt-2">{keys[p] ? <span className="pill pill-ok">✓ En memoria</span> : <span className="pill pill-neutral">Sin clave</span>}</p>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost mt-3" onClick={clearKeys}>Olvidar todas las claves</button>
    </section>
  );
}

/** Prueba mínima de llamada desde el origen real (OE4, semana 1): comprueba CORS, clave y modelo. */
function ProviderCheckSection() {
  const keys = useSession((s) => s.keys);
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const checks = useLiveQuery(() => db.checks.orderBy('checkedAt').reverse().limit(20).toArray(), []);
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [models, setModels] = useState<Partial<Record<ProviderId, string>>>({});

  async function check(p: ProviderId) {
    const model = models[p] ?? prices?.find((x) => x.provider === p)?.model ?? '';
    setBusy(p);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let ok = false, detail = '';
    try {
      const r = await ADAPTERS[p].call({
        model,
        prompt: { system: '', user: 'Responde solo con la palabra: ok' },
        temperature: null,
        maxOutputTokens: 64,
        apiKey: keys[p] ?? '',
        signal: ctrl.signal,
      });
      ok = true;
      detail = `Respuesta: «${r.text.trim().slice(0, 40)}» · ${Math.round(r.totalMs)} ms · consumo ${r.usage ? `${r.usage.input}+${r.usage.output} tokens` : 'no informado'}`;
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
    }
    await db.checks.add({ id: uid(), provider: p, model, origin: window.location.origin, ok, detail, checkedAt: Date.now() });
    setBusy(null);
  }

  return (
    <section aria-labelledby="check-title">
      <SectionTitle><span id="check-title">Verificación de proveedores</span></SectionTitle>
      <p className="hint mb-4 max-w-[70ch]">
        Hace una llamada mínima (unos pocos tokens) desde este dominio para comprobar que el proveedor acepta llamadas desde el navegador, que la clave funciona y que el modelo existe. Hazla desde el despliegue en Vercel y guarda el resultado como evidencia.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {REAL_PROVIDERS.map((p) => (
          <div key={p} className="panel p-4">
            <p className="font-semibold mb-2">{PROVIDER_NAMES[p]}</p>
            <label className="field-label" htmlFor={`chk-${p}`}>Modelo</label>
            <input id={`chk-${p}`} className="input mono mb-3" value={models[p] ?? prices?.find((x) => x.provider === p)?.model ?? ''} onChange={(e) => setModels({ ...models, [p]: e.target.value })} />
            <button className="btn btn-primary" disabled={!keys[p] || busy !== null} onClick={() => check(p)}>{busy === p ? 'Comprobando…' : 'Probar llamada'}</button>
            {!keys[p] && <p className="hint mt-2">Añade la clave arriba.</p>}
          </div>
        ))}
      </div>
      {checks && checks.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="tbl panel">
            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Modelo</th><th>Origen</th><th>Resultado</th></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{fmtDate(c.checkedAt)}</td>
                  <td>{PROVIDER_NAMES[c.provider]}</td>
                  <td className="mono text-xs">{c.model}</td>
                  <td className="mono text-xs">{c.origin}</td>
                  <td><span className={`pill ${c.ok ? 'pill-ok' : 'pill-bad'}`}>{c.ok ? '✓ Funciona' : '✕ Falla'}</span> <span className="text-xs">{c.detail}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-ghost mt-2" onClick={() => downloadText('verificacion-proveedores.json', JSON.stringify(checks, null, 2))}>Descargar evidencia (JSON)</button>
        </div>
      )}
    </section>
  );
}

function PricesSection() {
  const prices = useLiveQuery(() => db.prices.toArray(), []);
  const [draft, setDraft] = useState<ModelPrice | null>(null);
  if (!prices) return null;
  const today = new Date().toISOString().slice(0, 10);
  const num = (v: string) => (v === '' ? 0 : Number(v));
  return (
    <section aria-labelledby="prices-title">
      <SectionTitle aside={<button className="btn btn-ghost" onClick={() => setDraft({ id: uid(), provider: 'openai', model: '', label: '', input: 0, cachedInput: 0, cacheWrite: 0, output: 0, checkedAt: today, source: '' })}>Añadir modelo</button>}>
        <span id="prices-title">Tarifas</span>
      </SectionTitle>
      <p className="hint mb-3 max-w-[70ch]">USD por millón de tokens. Los precios cambian: verifica la fuente y actualiza la fecha antes de cada experimento. Cada ejecución guarda una copia de las tarifas que usó.</p>
      <div className="overflow-x-auto panel">
        <table className="tbl min-w-[56rem]">
          <thead><tr><th>Proveedor</th><th>Modelo</th><th className="num">Entrada</th><th className="num">Entrada en caché</th><th className="num">Escritura en caché</th><th className="num">Salida</th><th>Consultada</th><th>Fuente</th><th></th></tr></thead>
          <tbody>
            {prices.map((p) =>
              draft?.id === p.id ? null : (
                <tr key={p.id}>
                  <td>{PROVIDER_NAMES[p.provider]}</td>
                  <td className="mono text-xs">{p.model}</td>
                  <td className="num">{p.input}</td><td className="num">{p.cachedInput}</td><td className="num">{p.cacheWrite}</td><td className="num">{p.output}</td>
                  <td className="whitespace-nowrap">{p.checkedAt}</td>
                  <td className="text-xs max-w-[14rem] break-all">{p.source.startsWith('http') ? <a href={p.source} target="_blank" rel="noreferrer">{p.source.replace(/^https?:\/\//, '')}</a> : p.source}</td>
                  <td className="whitespace-nowrap"><button className="btn btn-ghost" onClick={() => setDraft(p)}>Editar</button></td>
                </tr>
              ),
            )}
            {draft && (
              <tr className="bg-petrol-soft">
                <td>
                  <select aria-label="Proveedor" className="input" value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value as ProviderId })}>
                    {(Object.keys(ADAPTERS) as ProviderId[]).map((p) => <option key={p} value={p}>{PROVIDER_NAMES[p]}</option>)}
                  </select>
                </td>
                <td><input aria-label="Modelo" className="input mono" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} /></td>
                {(['input', 'cachedInput', 'cacheWrite', 'output'] as const).map((k) => (
                  <td key={k}><input aria-label={k} type="number" min={0} step="0.001" className="input w-24" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: num(e.target.value) })} /></td>
                ))}
                <td><input aria-label="Fecha de consulta" type="date" className="input" value={draft.checkedAt} onChange={(e) => setDraft({ ...draft, checkedAt: e.target.value })} /></td>
                <td><input aria-label="Fuente" className="input" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} /></td>
                <td className="whitespace-nowrap">
                  <button className="btn btn-primary mr-1" disabled={!draft.model.trim()} onClick={async () => { await db.prices.put({ ...draft, label: `${PROVIDER_NAMES[draft.provider]} · ${draft.model}` }); setDraft(null); }}>Guardar</button>
                  <button className="btn btn-ghost" onClick={() => setDraft(null)}>Cancelar</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  return (
    <section aria-labelledby="data-title">
      <SectionTitle><span id="data-title">Tus datos</span></SectionTitle>
      <p className="hint mb-3 max-w-[70ch]">Proyectos, versiones, casos, ejecuciones y tarifas se guardan en IndexedDB, en este navegador. Exporta una copia para respaldarlos o llevarlos a otro equipo. La exportación nunca incluye claves de API.</p>
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" onClick={async () => downloadText(`promptlab-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll(), null, 2))}>Exportar todo (JSON)</button>
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Importar copia</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Archivo de copia de PromptLab"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const r = await importAll(await f.text());
              setMsg({ tone: 'ok', text: `Copia importada: ${r.projects} proyectos.` });
            } catch (err) {
              setMsg({ tone: 'bad', text: err instanceof Error ? err.message : String(err) });
            }
          }}
        />
        <ConfirmButton label="Borrar todos los datos" confirmLabel="Borrar todo de este navegador" onConfirm={async () => { await wipeAll(); await ensurePrices(); setMsg({ tone: 'ok', text: 'Se borraron todos los datos locales.' }); }} />
      </div>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </section>
  );
}
