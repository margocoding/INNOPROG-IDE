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
    editor.current?.dispatch({ effects: syntax.current.reconfigure(language ? editorLanguage(language) : []) });
  }, [language]);

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
