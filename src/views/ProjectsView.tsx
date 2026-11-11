import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { createEmptyProject, createSampleProject, deleteProject } from '../db/repo';
import { ConfirmButton, EmptyState, fmtDate } from '../components/ui';

export function ProjectsView({ onOpen }: { onOpen: (id: string) => void }) {
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray(), []);
  const stats = useLiveQuery(async () => {
    const out: Record<string, { cases: number; runs: number }> = {};
    for (const p of await db.projects.toArray()) {
      out[p.id] = { cases: await db.cases.where('projectId').equals(p.id).count(), runs: await db.runs.where('projectId').equals(p.id).count() };
    }
    return out;
  }, []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function sample() {
    setBusy(true);
    try {
      onOpen(await createSampleProject());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">Proyectos</h1>
      <p className="hint mb-6 max-w-[65ch]">
        Un proyecto reúne una tarea de extracción, sus prompts con todas sus versiones, los casos de prueba y las ejecuciones. Todo se guarda en este navegador.
      </p>

      {projects && projects.length === 0 && (
        <EmptyState
          title="Aún no hay proyectos"
          action={<button className="btn btn-primary" onClick={sample} disabled={busy}>Crear el proyecto de ejemplo</button>}
        >
          El proyecto de ejemplo trae 30 facturas sintéticas con sus valores de referencia y dos versiones de un prompt de extracción. Puedes probarlo en modo simulado sin claves de API.
        </EmptyState>
      )}

      {projects && projects.length > 0 && (
        <ul className="space-y-3 mb-8">
          {projects.map((p) => (
            <li key={p.id} className="panel p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[16rem]">
                <a href={`#/p/${p.id}/prompt`} className="font-semibold text-lg text-petrol">{p.name}</a>
                <p className="hint">{p.description || 'Sin descripción.'}</p>
                <p className="text-xs text-muted mt-1">
                  {stats?.[p.id]?.cases ?? 0} casos · {stats?.[p.id]?.runs ?? 0} ejecuciones · {p.fields.length} campos · creado el {fmtDate(p.createdAt)}
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => onOpen(p.id)}>Abrir</button>
              <ConfirmButton label="Eliminar" confirmLabel="Eliminar proyecto y sus datos" onConfirm={() => deleteProject(p.id)} />
            </li>
          ))}
        </ul>
      )}

      {projects && projects.length > 0 && (
        <div className="panel p-4">
          <h2 className="font-semibold mb-3">Nuevo proyecto</h2>
          <form
            className="flex flex-wrap gap-3 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onOpen(await createEmptyProject(name.trim()));
            }}
          >
            <div className="flex-1 min-w-[16rem]">
              <label className="field-label" htmlFor="new-project">Nombre</label>
              <input id="new-project" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo, Facturas de proveedores" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={!name.trim()}>Crear proyecto vacío</button>
            <button className="btn btn-ghost" type="button" onClick={sample} disabled={busy}>Crear otro proyecto de ejemplo</button>
          </form>
          <p className="hint mt-2">Los proyectos nuevos usan los diez campos de factura del caso de estudio.</p>
        </div>
      )}
    </div>
  );
}
