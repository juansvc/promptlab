import { useEffect, useRef, useState, type ReactNode } from 'react';

export function useHashRoute(): [string[], (path: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [parts, (path: string) => (window.location.hash = path)];
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: string; children: ReactNode }) {
  const styles = {
    info: 'border-petrol bg-petrol-soft',
    warn: 'border-marker bg-marker-soft',
    bad: 'border-bad bg-bad-soft',
    ok: 'border-ok bg-ok-soft',
  }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`border-l-4 rounded-r-md px-4 py-3 text-sm ${styles}`}>
      {title && <p className="font-semibold mb-1">{title}</p>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** Confirmación dentro de la propia página: el botón pide una segunda pulsación explícita. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn btn-danger', disabled }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!armed) return;
    ref.current?.focus();
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed) return <button type="button" className={className} disabled={disabled} onClick={() => setArmed(true)}>{label}</button>;
  return (
    <span className="inline-flex gap-2">
      <button ref={ref} type="button" className="btn btn-danger" onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn btn-ghost" onClick={() => setArmed(false)}>Cancelar</button>
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel px-6 py-10 text-center max-w-xl mx-auto">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <div className="hint mb-4">{children}</div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <h2 className="text-xl font-bold">{children}</h2>
      {aside}
    </div>
  );
}

/** Término con su definición accesible al pasar el ratón o al enfocar con teclado. */
export function Term({ children, def }: { children: ReactNode; def: string }) {
  return (
    <span className="underline decoration-dotted decoration-muted underline-offset-2 cursor-help" tabIndex={0} title={def} aria-label={`${typeof children === 'string' ? children : ''}: ${def}`}>
      {children}
    </span>
  );
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmtUsd = (x: number | null, digits = 4) =>
  x === null ? 'no disponible' : `${x.toLocaleString('es-EC', { minimumFractionDigits: digits, maximumFractionDigits: digits })} USD`;
export const fmtMs = (x: number | null) => (x === null ? '—' : `${Math.round(x).toLocaleString('es-EC')} ms`);
export const fmtDate = (t: number) => new Date(t).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
