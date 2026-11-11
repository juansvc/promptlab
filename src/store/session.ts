import { create } from 'zustand';
import type { ProviderId } from '../domain/types';

/**
 * Estado solo en memoria (apartado 3.3.6). Las claves de API viven aquí y en ningún otro sitio:
 * no se escriben en IndexedDB, localStorage ni exportaciones, y se pierden al recargar la pestaña.
 */
interface SessionState {
  keys: Partial<Record<ProviderId, string>>;
  setKey: (p: ProviderId, key: string) => void;
  clearKeys: () => void;
}

export const useSession = create<SessionState>((set) => ({
  keys: {},
  setKey: (p, key) => set((s) => ({ keys: { ...s.keys, [p]: key.trim() } })),
  clearKeys: () => set({ keys: {} }),
}));

export function getKey(p: ProviderId): string {
  return useSession.getState().keys[p] ?? '';
}

/** Progreso de la ejecución en curso (también solo en memoria). */
interface RunProgress {
  runId: string | null;
  done: number;
  total: number;
  spent: number;
  errors: number;
  message: string;
  set: (p: Partial<Omit<RunProgress, 'set'>>) => void;
}

export const useProgress = create<RunProgress>((set) => ({
  runId: null,
  done: 0,
  total: 0,
  spent: 0,
  errors: 0,
  message: '',
  set: (p) => set(p),
}));
