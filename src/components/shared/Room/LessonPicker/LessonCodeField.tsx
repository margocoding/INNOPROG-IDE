import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { Language } from '../../../../types/task';
import { editorLanguage } from '../../Code/CodeEditor/editorLanguage';

export function LessonCodeField({ label, language, value, onChange }: {
  label: string;
  language: Language | '';
  value: string;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const syntax = useRef(new Compartment());
  const initialValue = useRef(value);

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          oneDark, lineNumbers(), history(), keymap.of([...defaultKeymap, ...historyKeymap]),
          syntax.current.of([]),
          EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true', spellcheck: 'false' }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    editor.current = view;
    return () => { view.destroy(); editor.current = null; };
  }, [label, onChange]);

  useEffect(() => {
    const view = editor.current;
    if (!view) return;

    const compartment = syntax.current;
    const extension = language ? editorLanguage(language) : [];
    if (!(extension instanceof Promise)) {
      view.dispatch({ effects: compartment.reconfigure(extension) });
      return;
    }

    let active = true;
    view.dispatch({ effects: compartment.reconfigure([]) });
    void extension.then(support => {
      if (active && editor.current === view) {
        view.dispatch({ effects: compartment.reconfigure(support) });
      }
    }).catch(error => {
      if (active && editor.current === view) console.error('Failed to load editor language', error);
    });
    return () => { active = false; };
  }, [language, label, onChange]);

  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: Transaction.addToHistory.of(false),
      });
    }
  }, [value]);

  return <div className="lesson-code-field"><span>{label}</span><div ref={host} /></div>;
}
