import { Suspense, lazy, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { ensurePrices } from './db/repo';
import { useHashRoute } from './components/ui';
import { useSession } from './store/session';
import { ProjectsView } from './views/ProjectsView';
import { PromptView } from './views/PromptView';
import { CasesView } from './views/CasesView';
import { RunView } from './views/RunView';
const CompareView = lazy(() => import('./views/CompareView').then((m) => ({ default: m.CompareView })));
import { SettingsView } from './views/SettingsView';

const STEPS = [
  { tab: 'prompt', label: 'Prompt y versiones', help: 'Escribe el prompt por secciones y guarda cada cambio como versión.' },
  { tab: 'casos', label: 'Casos de prueba', help: 'Facturas con el valor esperado de cada campo.' },
  { tab: 'ejecutar', label: 'Ejecutar', help: 'Elige alternativas y ejecútalas sobre los casos.' },
  { tab: 'comparar', label: 'Comparar', help: 'Formato, exactitud por campo, coste y latencia.' },
] as const;

export default function App() {
  const [route, go] = useHashRoute();
  const keys = useSession((s) => s.keys);
  const keyCount = Object.values(keys).filter(Boolean).length;
  useEffect(() => void ensurePrices(), []);

  const projectId = route[0] === 'p' ? route[1] : undefined;
  const tab = route[2] ?? 'prompt';
  const project = useLiveQuery(() => (projectId ? db.projects.get(projectId) : undefined), [projectId]);
  const counts = useLiveQuery(async () => {
    if (!projectId) return null;
    const prompts = await db.prompts.where('projectId').equals(projectId).toArray();
    const versions = prompts.length ? await db.versions.where('promptId').anyOf(prompts.map((p) => p.id)).count() : 0;
    return {
      prompt: versions,
      casos: await db.cases.where('projectId').equals(projectId).count(),
      ejecutar: await db.runs.where('projectId').equals(projectId).count(),
      comparar: await db.runs.where('projectId').equals(projectId).filter((r) => r.status !== 'en curso').count(),
    };
  }, [projectId]);

  useEffect(() => {
    document.title = project ? `${project.name} · PromptLab` : 'PromptLab';
  }, [project]);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 btn btn-primary z-50">Saltar al contenido</a>
      <header className="bg-petrol text-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <a href="#/" className="flex items-center gap-2 font-bold text-lg text-white no-underline">
            <img src="/favicon.svg" alt="" width={26} height={26} />
            PromptLab
          </a>
          {project && <span className="text-white/80 text-sm truncate max-w-[40ch]">{project.name}</span>}
          <nav className="ml-auto flex items-center gap-4 text-sm" aria-label="Principal">
            <a href="#/" className="text-white/90 hover:text-white">Proyectos</a>
            <a href="#/ajustes" className="text-white/90 hover:text-white">Ajustes y claves</a>
            <span className={`pill ${keyCount ? 'bg-white/15 text-white' : 'bg-marker text-ink'}`} title="Las claves solo se guardan en la memoria de esta pestaña">
              {keyCount ? `${keyCount} clave${keyCount > 1 ? 's' : ''} en memoria` : 'Sin claves: solo modo simulado'}
            </span>
          </nav>
        </div>
      </header>

      <div className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
        {projectId && (
          <nav aria-label="Pasos del flujo" className="lg:w-60 shrink-0">
            <ol className="space-y-1">
              {STEPS.map((s, i) => {
                const active = tab === s.tab;
                const n = counts?.[s.tab];
                return (
                  <li key={s.tab}>
                    <a
                      href={`#/p/${projectId}/${s.tab}`}
                      aria-current={active ? 'step' : undefined}
                      className={`flex gap-3 rounded-md px-3 py-2 no-underline ${active ? 'bg-sheet border border-petrol' : 'border border-transparent hover:bg-sheet'}`}
                    >
                      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-petrol text-white' : 'bg-petrol-soft text-petrol-dark'}`}>{i + 1}</span>
                      <span>
                        <span className="block font-semibold text-sm text-ink">{s.label}{n ? <span className="text-muted font-normal"> ({n})</span> : null}</span>
                        <span className="block text-xs text-muted">{s.help}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <main id="main" className="flex-1 min-w-0">
          {route[0] === 'ajustes' ? (
            <SettingsView />
          ) : projectId && project === undefined ? (
            <p className="hint">Cargando…</p>
          ) : projectId && project === null ? (
            <p>No existe ese proyecto. <a href="#/">Volver a proyectos</a></p>
          ) : projectId && project ? (
            tab === 'casos' ? <CasesView project={project} /> :
            tab === 'ejecutar' ? <RunView project={project} onDone={(runId) => go(`/p/${projectId}/comparar/${runId}`)} /> :
            tab === 'comparar' ? <Suspense fallback={<p className="hint">Cargando…</p>}><CompareView project={project} runId={route[3]} /></Suspense> :
            <PromptView project={project} />
          ) : (
            <ProjectsView onOpen={(id) => go(`/p/${id}/prompt`)} />
          )}
        </main>
      </div>
      <footer className="border-t border-rule text-xs text-muted">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3">
          Tus datos se guardan en este navegador (IndexedDB). En cada ejecución, el prompt y el caso se envían solo al proveedor que elijas. Las claves de API no se guardan.
        </div>
      </footer>
    </div>
  );
}
