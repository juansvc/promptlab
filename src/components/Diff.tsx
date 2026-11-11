import DiffMatchPatch from 'diff-match-patch';
import { SECTION_KEYS, SECTION_LABELS, type PromptSections } from '../domain/types';

/**
 * Diff entre dos textos. Las inserciones y eliminaciones se distinguen por color,
 * subrayado o tachado y un texto oculto para lectores de pantalla (no solo por color).
 */
export function Diff({ before, after }: { before: string; after: string }) {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(before, after);
  dmp.diff_cleanupSemantic(diffs);
  const added = diffs.filter(([op]) => op === 1).reduce((a, [, t]) => a + t.length, 0);
  const removed = diffs.filter(([op]) => op === -1).reduce((a, [, t]) => a + t.length, 0);
  return (
    <div>
      <p className="hint mb-2">
        <span className="diff-ins px-1">+{added}</span> caracteres añadidos · <span className="diff-del px-1">−{removed}</span> eliminados
      </p>
      <pre tabIndex={0} aria-label="Diferencias" className="mono text-sm whitespace-pre-wrap panel p-4 leading-relaxed max-h-[32rem] overflow-auto">
        {diffs.map(([op, text], i) =>
          op === 0 ? (
            <span key={i}>{text}</span>
          ) : op === 1 ? (
            <ins key={i} className="diff-ins"><span className="sr-only">[añadido: </span>{text}<span className="sr-only">]</span></ins>
          ) : (
            <del key={i} className="diff-del"><span className="sr-only">[eliminado: </span>{text}<span className="sr-only">]</span></del>
          ),
        )}
      </pre>
    </div>
  );
}

/** Diff sección por sección: más legible que comparar el prompt completo como un solo texto. */
export function SectionDiff({ before, after }: { before: PromptSections; after: PromptSections }) {
  const changed = SECTION_KEYS.filter((k) => before[k].trim() !== after[k].trim());
  const same = SECTION_KEYS.filter((k) => !changed.includes(k));
  return (
    <div className="space-y-4">
      <p className="hint">
        {changed.length} secciones con cambios{same.length ? ` · sin cambios: ${same.map((k) => SECTION_LABELS[k]).join(', ')}` : ''}.
      </p>
      {changed.map((k) => (
        <div key={k}>
          <h4 className="font-semibold text-sm mb-1">
            {SECTION_LABELS[k]}{' '}
            {!before[k].trim() ? <span className="pill pill-ok">sección nueva</span> : !after[k].trim() ? <span className="pill pill-bad">sección eliminada</span> : null}
          </h4>
          <Diff before={before[k]} after={after[k]} />
        </div>
      ))}
    </div>
  );
}
