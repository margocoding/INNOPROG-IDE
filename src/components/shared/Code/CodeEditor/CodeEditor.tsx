import {
  cursorCharLeft,
  cursorCharRight,
  cursorLineDown,
  cursorLineUp,
  defaultKeymap,
  indentWithTab,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { StreamLanguage, foldGutter, foldKeymap } from "@codemirror/language";
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


const indentGuidesField = StateField.define<DecorationSet>({
  create(state) {
    return createIndentGuides(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return createIndentGuides(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

class IndentGuideWidget extends WidgetType {
  constructor(private levels: number[], private tabSize: number) {
    super();
  }

  toDOM() {
    const container = document.createElement("span");
    container.className = "cm-indent-guide-container";
    container.style.display = "inline-block";
    container.style.position = "relative";
    container.style.height = "1.6em";
    container.style.width = "0";
    container.style.verticalAlign = "top";
    container.style.pointerEvents = "none";
    container.style.zIndex = "0";
    container.style.marginRight = "0";
    
    this.levels.forEach((level) => {
      const line = document.createElement("span");
      line.className = "cm-indent-guide";
      line.style.position = "absolute";
      line.style.left = `${level * this.tabSize * 8.4}px`;
      line.style.top = "0";
      line.style.height = "1.6em";
      line.style.width = "1px";
      line.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
      container.appendChild(line);
    });
    
    return container;
  }

  ignoreEvent() {
    return true;
  }
}

function createIndentGuides(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc;
  const tabSize = state.tabSize;
  const maxIndentLevel = 30;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    
    // Пропускаем пустые строки (даже если есть табуляции/пробелы)
    if (lineText.trim().length === 0) {
      continue;
    }
    
    let indentCount = 0;
    for (let j = 0; j < lineText.length; j++) {
      if (lineText[j] === " ") {
        indentCount++;
      } else if (lineText[j] === "\t") {
        indentCount += tabSize;
      } else {
        break;
      }
    }

    const indentLevel = Math.floor(indentCount / tabSize);
    
    if (indentLevel > 1) {
      const levels: number[] = [];
      for (let level = 1; level < Math.min(indentLevel, maxIndentLevel + 1); level++) {
        levels.push(level);
      }
      
      if (levels.length > 0) {
        const guideDecoration = Decoration.widget({
          widget: new IndentGuideWidget(levels, tabSize),
          side: -1,
          block: false,
        });

        decorations.push(guideDecoration.range(line.from));
      }
    }
  }

  return Decoration.set(decorations);
}

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
    myTelegramId,
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
    const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);

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
          // Не показываем курсор для самого себя
          if (telegramId === myTelegramId) {
            return;
          }
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
                        private hideTimer: number | null = null;

                        toDOM() {
                          const wrapper = document.createElement("span");
                          wrapper.style.position = "relative";
                          wrapper.style.cursor = "pointer";

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
                          label.style.opacity = "0";
                          label.style.transition = "opacity 0.2s ease-in-out";
                          label.style.pointerEvents = "none";

                          const showLabel = () => {
                            if (this.hideTimer) {
                              clearTimeout(this.hideTimer);
                              this.hideTimer = null;
                            }
                            label.style.opacity = "1";
                          };

                          const hideLabel = () => {
                            if (this.hideTimer) {
                              clearTimeout(this.hideTimer);
                            }
                            this.hideTimer = window.setTimeout(() => {
                              label.style.opacity = "0";
                              this.hideTimer = null;
                            }, 3000);
                          };

                          wrapper.addEventListener("mouseenter", showLabel);
                          wrapper.addEventListener("mouseleave", hideLabel);

                          wrapper.appendChild(cursor);
                          wrapper.appendChild(label);

                          return wrapper;
                        }

                        destroy(dom: HTMLElement) {
                          if (this.hideTimer) {
                            clearTimeout(this.hideTimer);
                            this.hideTimer = null;
                          }
                          super.destroy(dom);
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
    }, [editor, selections, myTelegramId]);

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

      const ua = navigator.userAgent.toLowerCase();
      const isIOS =
        /iphone|ipad|ipod/.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

      const handleEnterBetweenBraces = (view: EditorView) => {
        const { state, dispatch } = view;
        const selection = state.selection.main;

        if (!selection.empty) {
          return false;
        }

        const line = state.doc.lineAt(selection.head);
        const cursorPos = selection.head - line.from;
        const beforeCursor = line.text.slice(0, cursorPos);
        const afterCursor = line.text.slice(cursorPos);
        const trimmedBefore = beforeCursor.trim();
        const trimmedAfter = afterCursor.trim();

        if (!trimmedBefore.endsWith("{") || !trimmedAfter.startsWith("}")) {
          return false;
        }

        const braceIndex = afterCursor.indexOf("}");
        if (braceIndex < 0) {
          return false;
        }

        const indentMatch = beforeCursor.match(/^(\s*)/);
        const currentIndent = indentMatch ? indentMatch[1] : "";
        const innerIndent = currentIndent + "  ";
        const insertPos = selection.head;
        const newline = "\n" + innerIndent;
        const newCursorPos = insertPos + newline.length;
        const insertText = newline + "\n" + currentIndent + "}";

        dispatch({
          changes: [
            {
              from: insertPos + braceIndex,
              to: insertPos + braceIndex + 1,
              insert: "",
            },
            {
              from: insertPos,
              insert: insertText,
            },
          ],
          selection: { anchor: newCursorPos, head: newCursorPos },
        });

        return true;
      };

      const iosEnterHandler = isIOS
        ? EditorView.domEventHandlers({
            beforeinput: (event, view) => {
              const inputEvent = event as InputEvent;
              if (
                inputEvent.inputType !== "insertParagraph" &&
                inputEvent.inputType !== "insertLineBreak"
              ) {
                return false;
              }

              if (handleEnterBetweenBraces(view)) {
                event.preventDefault();
                return true;
              }

              const handled = insertNewlineAndIndent(view);
              if (handled) {
                event.preventDefault();
              }
              return handled;
            },
          })
        : [];
      const iosKeydownHandler = isIOS
        ? EditorView.domEventHandlers({
            keydown: (event, view) => {
              if (event.key === "Enter") {
                if (handleEnterBetweenBraces(view) || insertNewlineAndIndent(view)) {
                  event.preventDefault();
                  return true;
                }
                return false;
              }

              if (event.key === "ArrowLeft") {
                const handled = cursorCharLeft(view);
                if (handled) {
                  event.preventDefault();
                }
                return handled;
              }

              if (event.key === "ArrowRight") {
                const handled = cursorCharRight(view);
                if (handled) {
                  event.preventDefault();
                }
                return handled;
              }

              if (event.key === "ArrowUp") {
                const handled = cursorLineUp(view);
                if (handled) {
                  event.preventDefault();
                }
                return handled;
              }

              if (event.key === "ArrowDown") {
                const handled = cursorLineDown(view);
                if (handled) {
                  event.preventDefault();
                }
                return handled;
              }

              return false;
            },
          })
        : [];

      const state = EditorState.create({
        doc: initialDoc,
        extensions: [
          yCollab(ydoc.getText("codemirror"), awareness),
          languageSupport,
          oneDark,
          closeBrackets(),
          indentGuidesField,
          keymap.of([
            {
              key: "Enter",
              run: (view) => handleEnterBetweenBraces(view),
            },
            ...defaultKeymap,
            ...closeBracketsKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          iosEnterHandler,
          iosKeydownHandler,
          selectionHighlightField,
          lineNumbers(),
          foldGutter(),
          EditorState.tabSize.of(2),
          EditorView.updateListener.of((update) => {
            if (update.focusChanged && !update.view.hasFocus) {
              sendSelectionRef.current?.({ clearSelection: true });
            }

            if (update.docChanged) {
              try {
                const bracketPairs: { [key: string]: string } = {
                  "{": "}",
                  "[": "]",
                  "(": ")",
                  "<": ">",
                  '"': '"',
                  "'": "'",
                  "`": "`",
                };

                for (const tr of update.transactions) {
                  if (tr.isUserEvent("delete.backward") || tr.isUserEvent("delete.forward")) {
                    tr.changes.iterChanges((fromA, toA, fromB, toB) => {
                      if (toA - fromA === 1 && fromB === toB) {
                        const deletedChar = update.startState.doc.sliceString(fromA, toA);
                        
                        if (bracketPairs[deletedChar]) {
                          const closingBracket = bracketPairs[deletedChar];
                          const oldDoc = update.startState.doc;
                          const newDoc = update.state.doc;
                          
                          if (fromA + 1 < oldDoc.length) {
                            const afterDeleted = oldDoc.sliceString(fromA + 1);
                            const closingPos = afterDeleted.indexOf(closingBracket);
                            
                            if (closingPos >= 0) {
                              const betweenText = afterDeleted.slice(0, closingPos);
                              
                              if (betweenText.trim().length === 0) {
                                const actualClosingPos = fromA + 1 + closingPos;
                                const mappedPos = tr.changes.mapPos(actualClosingPos, -1);
                                
                                if (mappedPos >= 0 && mappedPos < newDoc.length) {
                                  const nextChar = newDoc.sliceString(mappedPos, mappedPos + 1);
                                  if (nextChar === closingBracket) {
                                    setTimeout(() => {
                                      if (editor.current) {
                                        editor.current.dispatch({
                                          changes: {
                                            from: mappedPos,
                                            to: mappedPos + 1,
                                            insert: "",
                                          },
                                        });
                                      }
                                    }, 0);
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    });
                  }
                }

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
      const handleGlobalKeydown = (event: KeyboardEvent) => {
        if (!isIOS) return;
        if (!editor.current || !editor.current.hasFocus) return;
        if (event.defaultPrevented) return;

        if (event.key === "Enter") {
          if (
            handleEnterBetweenBraces(editor.current) ||
            insertNewlineAndIndent(editor.current)
          ) {
            event.preventDefault();
          }
          return;
        }

        if (event.key === "ArrowLeft") {
          if (cursorCharLeft(editor.current)) {
            event.preventDefault();
          }
          return;
        }

        if (event.key === "ArrowRight") {
          if (cursorCharRight(editor.current)) {
            event.preventDefault();
          }
          return;
        }

        if (event.key === "ArrowUp") {
          if (cursorLineUp(editor.current)) {
            event.preventDefault();
          }
          return;
        }

        if (event.key === "ArrowDown") {
          if (cursorLineDown(editor.current)) {
            event.preventDefault();
          }
        }
      };

      window.addEventListener("keydown", handleGlobalKeydown);

      return () => {
        window.removeEventListener("keydown", handleGlobalKeydown);
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
