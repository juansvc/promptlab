import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { Decoration, EditorView, MatchDecorator, ViewPlugin, keymap, placeholder as cmPlaceholder, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

const varMatcher = new MatchDecorator({
  regexp: /\{\{\s*[a-zA-Z_]\w*\s*\}\}/g,
  decoration: Decoration.mark({ class: 'cm-variable' }),
});

const highlightVariables = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = varMatcher.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = varMatcher.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--color-sheet)', border: '1px solid var(--color-rule)', borderRadius: '6px' },
  '&.cm-focused': { borderColor: 'var(--color-petrol)', boxShadow: '0 0 0 2px var(--color-marker)' },
  '.cm-content': { padding: '8px 4px', minHeight: '2.6rem', caretColor: 'var(--color-ink)' },
  '.cm-placeholder': { color: 'var(--color-muted)' },
  '.cm-line': { padding: '0 6px' },
});

/** Editor CodeMirror 6 con resaltado de variables {{...}}. Tab no queda atrapado: sale del editor. */
export function Editor({ value, onChange, label, placeholder, id }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; id: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          highlightVariables,
          theme,
          cmPlaceholder(placeholder ?? ''),
          EditorView.contentAttributes.of({ 'aria-label': label, id }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} />;
}
