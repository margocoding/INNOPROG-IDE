import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { StreamLanguage } from "@codemirror/language";
import { dart } from "@codemirror/legacy-modes/mode/clike";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  Decoration,
  DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  WidgetType,
} from "@codemirror/view";
import { Select, SelectItem } from "@heroui/react";
import React, { useEffect, useMemo, useRef } from "react";
import { yCollab } from "y-codemirror.next";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import useYDocFromUpdates from "../../../../hooks/useYDocFromUpdates";
import { Language } from "../../../../types/task";

interface IProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  codeBefore?: string;
  codeAfter?: string;
  readOnly?: boolean;
  setCurrentCode: (val: string) => void;
  sendSelection?: (selectionData: {
    line?: number;
    column?: number;
    selectionStart?: { line: number; column: number };
    selectionEnd?: { line: number; column: number };
    selectedText?: string;
    clearSelection?: boolean;
  }) => void;
  selections?: Map<
    string,
    {
      line?: number;
      column?: number;
      username?: string;
      selectionStart?: { line: number; column: number };
      selectionEnd?: { line: number; column: number };
      selectedText?: string;
      userColor: string;
    }
  >;
  onSendUpdate?: (update: Uint8Array) => void;
  updatesFromProps?: Uint8Array[];
  activeTypers?: Set<string>;
  myTelegramId?: string;
  disabled: boolean;
  handleLanguageChange: (language: Language) => void;
  isTeacher?: boolean;
  isWebSocket: boolean;
}

const replaceSelectionsEffect = StateEffect.define<DecorationSet>();

const selectionHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    try {
      for (let e of tr.effects) {
        if (e.is(replaceSelectionsEffect)) {
          return e.value;
        }
      }
      return decorations.map(tr.changes);
    } catch (e) {
      console.error(e);

      return decorations;
    }
  },
  provide: (f) => EditorView.decorations.from(f),
});

const CodeEditor: React.FC<IProps> = React.memo(
  ({
    value,
    onChange,
    language = "javascript",
    codeBefore = "",
    codeAfter = "",
    readOnly = false,
    sendSelection,
    selections,
    onSendUpdate,
    updatesFromProps,
    disabled,
    handleLanguageChange,
    isTeacher,
    setCurrentCode,
    isWebSocket,
  }) => {
    const editor = useRef<EditorView>();
    const editorContainer = useRef<HTMLDivElement>(null);
    const prevValue = useRef(value);
    const lastLanguageRef = useRef<string>(language);

    const lastLocalEditTime = useRef<number>(0);
    const hadTextSelection = useRef<boolean>(false);

    const onChangeRef = useRef(onChange);
    const sendSelectionRef = useRef(sendSelection);
    const isRemoteUpdate = useRef<boolean>(false);

    onChangeRef.current = onChange;
    sendSelectionRef.current = sendSelection;

    const ydoc = useYDocFromUpdates({
      updates: updatesFromProps,
      isRemoteUpdate,
    });

    useEffect(() => {
      const handleRoomStateLoaded = (event: CustomEvent) => {
        const { lastCode } = event.detail;
        if (lastCode && lastCode !== value && editor.current) {
          try {
            let editableCode = lastCode;

            if (codeBefore && lastCode.startsWith(codeBefore)) {
              editableCode = lastCode.slice(codeBefore.length);
              if (codeAfter && editableCode.endsWith(codeAfter)) {
                editableCode = editableCode.slice(0, -codeAfter.length);
              }
            }

            const fullContent = `${codeBefore}${editableCode}${codeAfter}`;

            const transaction = editor.current.state.update({
              changes: {
                from: 0,
                to: editor.current.state.doc.length,
                insert: fullContent,
              },
            });
            editor.current.dispatch(transaction);

            if (onChangeRef.current) {
              onChangeRef.current(editableCode);
            }

            prevValue.current = editableCode;
          } catch (error) {
            console.error(error);
          }
        }
      };

      window.addEventListener(
        "roomStateLoaded",
        handleRoomStateLoaded as EventListener
      );
      return () => {
        window.removeEventListener(
          "roomStateLoaded",
          handleRoomStateLoaded as EventListener
        );
      };
    }, [value, codeBefore, codeAfter]);

    const effectiveReadOnly = useMemo(
      () => disabled || readOnly,
      [readOnly, disabled]
    );

    useEffect(() => {
      if (!editor.current) return;

      const decorations: any[] = [];
      const doc = editor.current.state.doc;

      if (selections && selections.size > 0) {
        selections.forEach((selectionData, telegramId) => {
          try {
            if (
              selectionData.selectionStart &&
              selectionData.selectionEnd &&
              selectionData.selectedText
            ) {
              if (
                selectionData.selectionStart.line <= doc.lines &&
                selectionData.selectionEnd.line <= doc.lines
              ) {
                const startLineInfo = doc.line(
                  selectionData.selectionStart.line
                );
                const endLineInfo = doc.line(selectionData.selectionEnd.line);

                const from =
                  startLineInfo.from + selectionData.selectionStart.column;
                const to = endLineInfo.from + selectionData.selectionEnd.column;

                const selectionDecoration = Decoration.mark({
                  class: "cm-user-text-selection",
                  attributes: {
                    style: `
                    background-color: ${selectionData.userColor}40 !important;
                    border-bottom: 2px solid ${selectionData.userColor} !important;
                  `,
                    title: `Selected by ${
                      selectionData.userColor || telegramId
                    }: "${selectionData.selectedText}"`,
                  },
                });

                decorations.push(selectionDecoration.range(from, to));
              }
            } else if (
              selectionData.line &&
              typeof selectionData.column === "number"
            ) {
              if (selectionData.line > 0 && selectionData.line <= doc.lines) {
                try {
                  const lineInfo = doc.line(selectionData.line);
                  const maxColumn = lineInfo.length;
                  const validColumn = Math.max(0, Math.min(selectionData.column, maxColumn));
                  const position = lineInfo.from + validColumn;

                  if (position >= 0 && position <= doc.length) {
                    const cursorDecoration = Decoration.widget({
                      widget: new (class extends WidgetType {
                        toDOM() {
                          const wrapper = document.createElement("span");
                          wrapper.style.position = "relative";

                          const cursor = document.createElement("span");
                          cursor.style.borderLeft = `2px solid ${selectionData.userColor}`;
                          cursor.style.marginLeft = "-1px";
                          cursor.style.marginBottom = "-5px";
                          cursor.style.height = "1.2em";
                          cursor.style.display = "inline-block";
                          cursor.style.animation = "blink 1s step-end infinite";

                          const label = document.createElement("span");
                          label.textContent = selectionData.username || telegramId;
                          label.style.position = "absolute";
                          label.style.top = "-1.5em";
                          label.style.left = "0";
                          label.style.background = selectionData.userColor;
                          label.style.color = "white";
                          label.style.fontSize = "0.7em";
                          label.style.padding = "2px 4px";
                          label.style.borderRadius = "3px";
                          label.style.whiteSpace = "nowrap";
                          label.style.zIndex = "1000";
                          label.style.pointerEvents = "none";
                          label.style.userSelect = "none";
                          label.style.setProperty("-webkit-user-select", "none");
                          label.style.setProperty("-moz-user-select", "none");
                          label.style.setProperty("-ms-user-select", "none");

                          wrapper.appendChild(cursor);
                          wrapper.appendChild(label);

                          return wrapper;
                        }
                      })(),
                      side: -1,
                    }).range(position);

                    decorations.push(cursorDecoration);
                  }
                } catch (error) {
                  console.error("Error creating cursor decoration:", error);
                }
              }
            }
          } catch (error) {
            console.error("Error processing selection for", telegramId, error);
          }
        });
      }

      // обновляем редактор
      const decoSet = Decoration.set(decorations, true);
      editor.current.dispatch({
        effects: replaceSelectionsEffect.of(decoSet),
      });
    }, [editor, selections]);

    useEffect(() => {
      if (!editorContainer.current) return;

      const languageSupport = (() => {
        switch (language) {
          case Language.PY:
            return python();
          case Language.JS:
            return javascript();
          case Language.CPP:
            return cpp();
          case Language.JAVA:
            return java();
          case Language.SQL:
            return sql();
          case Language.DART:
            return StreamLanguage.define(dart);
          default:
            return python();
        }
      })();

      const isLanguageChange = lastLanguageRef.current !== language;
      lastLanguageRef.current = language;

      let initialDoc = `${codeBefore}${value}${codeAfter}`;
      
      if (isLanguageChange && editor.current) {
        const currentDoc = editor.current.state.doc.toString();
        if (currentDoc && currentDoc.trim()) {
          initialDoc = currentDoc;
          if (initialDoc.startsWith(codeBefore) && initialDoc.endsWith(codeAfter)) {
            const userCode = initialDoc.slice(
              codeBefore.length,
              initialDoc.length - codeAfter.length
            );
            prevValue.current = userCode;
          }
        } else if (ydoc) {
          const ytext = ydoc.getText("codemirror");
          if (ytext && ytext.toString().trim()) {
            initialDoc = ytext.toString();
            if (initialDoc.startsWith(codeBefore) && initialDoc.endsWith(codeAfter)) {
              const userCode = initialDoc.slice(
                codeBefore.length,
                initialDoc.length - codeAfter.length
              );
              prevValue.current = userCode;
            }
          }
        }
      }

      const state = EditorState.create({
        doc: initialDoc,
        extensions: [
          yCollab(ydoc.getText("codemirror"), new Y.Map()),
          languageSupport,
          oneDark,
          keymap.of([...defaultKeymap, indentWithTab]),
          selectionHighlightField,
          lineNumbers(),
          EditorView.updateListener.of((update) => {
            if (update.focusChanged && !update.view.hasFocus) {
              sendSelectionRef.current?.({ clearSelection: true });
            }

            if (update.docChanged) {
              try {
                const newValue = update.state.doc.toString();

                if (isWebSocket) {
                  setCurrentCode(newValue);
                }

                if (
                  !newValue.startsWith(codeBefore) ||
                  !newValue.endsWith(codeAfter)
                ) {
                  editor.current?.dispatch({
                    changes: {
                      from: 0,
                      to: newValue.length,
                      insert: `${codeBefore}${prevValue.current}${codeAfter}`,
                    },
                  });
                  return;
                }

                const userCode = newValue.slice(
                  codeBefore.length,
                  newValue.length - codeAfter.length
                );

                if (userCode !== prevValue.current) {
                  prevValue.current = userCode;
                  lastLocalEditTime.current = Date.now();

                  if (!isRemoteUpdate.current) {
                    onChangeRef.current(userCode);
                  }

                  if (ydoc && onSendUpdate && !isRemoteUpdate.current) {
                    isRemoteUpdate.current = true;
                    const updateBinary = Y.encodeStateAsUpdate(ydoc);
                    onSendUpdate(updateBinary);
                    isRemoteUpdate.current = false;
                  }
                }
              } catch (error) {
                console.error("Error in editor update:", error);
              }
            }

            // === 2. Обновление курсора / выделения ===
            if (update.selectionSet && sendSelectionRef.current) {
              try {
                const selection = update.state.selection.main;
                const doc = update.state.doc;

                // === Выделение текста ===
                if (!selection.empty) {
                  const startLine = doc.lineAt(selection.from);
                  const endLine = doc.lineAt(selection.to);

                  // защита от выхода за границы
                  if (selection.from >= 0 && selection.to <= doc.length) {
                    const selectedText = doc.sliceString(
                      selection.from,
                      selection.to
                    );

                    sendSelectionRef.current({
                      selectionStart: {
                        line: startLine.number,
                        column: selection.from - startLine.from,
                      },
                      selectionEnd: {
                        line: endLine.number,
                        column: selection.to - endLine.from,
                      },
                      selectedText,
                    });
                    hadTextSelection.current = true;
                  }
                }

                // === Просто курсор ===
                else {
                  const line = doc.lineAt(selection.head);
                  const lineNumber = line.number;
                  const columnNumber = selection.head - line.from;

                  // если до этого было выделение → сбрасываем
                  if (hadTextSelection.current) {
                    sendSelectionRef.current({
                      line: lineNumber,
                      column: columnNumber,
                      clearSelection: true,
                    });
                    hadTextSelection.current = false;
                  } else {
                    sendSelectionRef.current({
                      line: lineNumber,
                      column: columnNumber,
                    });
                  }
                }
              } catch (error) {
                console.error("Error sending selection:", error);
              }
            }
          }),

          EditorView.editable.of(!effectiveReadOnly),
          EditorState.readOnly.of(effectiveReadOnly),
          EditorView.theme({
            "&": {
              height: "100%",
              fontSize: "14px",
            },
            ".cm-scroller": {
              fontFamily: "Consolas, monospace",
              lineHeight: "1.6",
            },
            ".cm-content": {
              caretColor: "#fff",
            },
            "&.cm-focused": {
              outline: "none",
            },
            ".cm-user-text-selection": {
              borderRadius: "2px",
              position: "relative",
              opacity: "0.8",
              fontWeight: "500",
            },
            ".cm-user-cursor-position": {
              position: "relative",
              display: "inline-block",
              animation: "pulse 1s infinite",
            },
            "@keyframes pulse": {
              "0%": { opacity: "1" },
              "50%": { opacity: "0.5" },
              "100%": { opacity: "1" },
            },
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: editorContainer.current,
      });

      editor.current = view;

      return () => {
        view.destroy();
      };
    }, [language, effectiveReadOnly, codeBefore, codeAfter, ydoc, isWebSocket]);

    useEffect(() => {
      if (editor.current && value !== prevValue.current) {
        try {
          const selection = editor.current.state.selection;
          const cursorPos = selection.main.head;
          const relativeCursorPos = Math.max(
            codeBefore.length,
            Math.min(
              cursorPos,
              editor.current.state.doc.length - codeAfter.length
            )
          );

          const fullContent = `${codeBefore}${value}${codeAfter}`;

          const newCursorPos = Math.min(
            relativeCursorPos,
            fullContent.length - codeAfter.length
          );

          editor.current.dispatch({
            changes: {
              from: 0,
              to: editor.current.state.doc.length,
              insert: fullContent,
            },
            selection: { anchor: newCursorPos, head: newCursorPos },
          });
          prevValue.current = value;
        } catch (error) {
          console.error("Error updating editor content:", error);
        }
      }
    }, [value, codeBefore, codeAfter]);

    return (
      <div className="relative h-full rounded-lg overflow-hidden bg-ide-editor">
        <div className="px-3 py-2 border-b border-ide-border bg-ide-secondary flex justify-between items-center">
          <span className="text-ide-text-secondary text-sm">
            {`script.${language}`}
          </span>
          <Select
            selectedKeys={[language]}
            isDisabled={isTeacher === false}
            onChange={(e) => handleLanguageChange(e.target.value as Language)}
            size={"sm"}
            className={"min-w-[100px] w-auto bg-[#333] rounded-xl"}
            variant={"bordered"}
            placeholder={"Язык программирования"}
          >
            <SelectItem key={"js"}>JS</SelectItem>
            <SelectItem key={"cpp"}>C++</SelectItem>
            <SelectItem key={"py"}>Python</SelectItem>
            <SelectItem key={"java"}>Java</SelectItem>
            <SelectItem key={"sql"}>SQL</SelectItem>
            <SelectItem key={"dart"}>Dart</SelectItem>
          </Select>
        </div>
        <div
          ref={editorContainer}
          className="h-[calc(100%-40px)] overflow-auto"
        />
      </div>
    );
  }
);

CodeEditor.displayName = "CodeEditor";

export default CodeEditor;
