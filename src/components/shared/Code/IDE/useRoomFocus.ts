import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { scrollTaskLocally } from "../TaskDescription/useTaskScrollSync";

const setFocusLine = StateEffect.define<number | null>();
const focusLine = Decoration.line({ class: "room-focus-highlight" });

export const roomFocusLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setFocusLine)) {
        return effect.value === null ? Decoration.none : Decoration.set([focusLine.range(effect.value)]);
      }
    }
    return value.map(transaction.changes);
  },
  provide: field => EditorView.decorations.from(field),
});

type Target = { panel: "code" | "task"; index: number; offset: number };
type RoomFocusEvent = { roomId: string; lessonRevision: number; taskId: string | null; target: Target };
type Tab = "editor" | "output";
const taskSelector = "[data-room-focus-task]";
const blockSelector = "p, h1, h2, h3, h4, h5, h6, pre, li, table, blockquote, .room-focus-text, .task-description-content";

function editorAt(element: Element | null | undefined) {
  return element instanceof HTMLElement ? EditorView.findFromDOM(element) : null;
}

function taskBlocks(panel: Element) {
  return [...panel.querySelectorAll(blockSelector)];
}

export function useRoomFocus({
  socket, roomId, telegramId, lessonRevision, taskId, owner, setTab,
}: {
  socket: Socket | null | undefined;
  roomId: string | null;
  telegramId: string;
  lessonRevision: number;
  taskId: string | null;
  owner: boolean;
  setTab: (tab: Tab) => void;
}) {
  const workspace = useRef<HTMLDivElement>(null);
  const [choosing, setChoosing] = useState(false);
  const cleanup = useRef<() => void>();
  const animation = useRef<number>();
  const timeout = useRef<number>();

  const dismiss = useCallback(() => {
    window.cancelAnimationFrame(animation.current ?? 0);
    window.clearTimeout(timeout.current);
    cleanup.current?.();
    cleanup.current = undefined;
  }, []);

  const reveal = useCallback((target: Target, incoming: boolean) => {
    const root = workspace.current;
    if (!root) return;
    dismiss();
    const editor = editorAt(root.querySelector(".cm-editor"));
    const panel = root.querySelector<HTMLElement>(taskSelector);
    const element = target.panel === "task" && panel ? taskBlocks(panel)[target.index] : null;
    if (target.panel === "code" && (!editor || target.index < 1 || target.index > editor.state.doc.lines)) return;
    if (target.panel === "task" && !element) return;
    const scroller = target.panel === "code" ? editor?.scrollDOM : panel;
    if (!scroller) return;
    if (incoming && target.panel === "code") setTab("editor");
    animation.current = window.requestAnimationFrame(() => {
      // Keep the owner's vertical offset when it fits the recipient's panel.
      const offset = target.offset < scroller.clientHeight
        ? target.offset
        : Math.max(0, scroller.clientHeight - 24);
      const viewportTop = scroller.getBoundingClientRect().top;
      if (element) {
        if (incoming) scrollTaskLocally(scroller,
          scroller.scrollTop + element.getBoundingClientRect().top - viewportTop - offset);
        element.classList.add("room-focus-highlight");
        cleanup.current = () => element.classList.remove("room-focus-highlight");
      } else if (editor?.dom.isConnected && target.index <= editor.state.doc.lines) {
        const from = editor.state.doc.line(target.index).from;
        if (incoming) {
          const lineTop = editor.documentTop + editor.lineBlockAt(from).top;
          scroller.scrollTop += lineTop - viewportTop - offset;
        }
        editor.dispatch({ effects: setFocusLine.of(from) });
        cleanup.current = () => {
          if (editor.dom.isConnected) editor.dispatch({ effects: setFocusLine.of(null) });
        };
      }
      timeout.current = window.setTimeout(dismiss, 3000);
    });
  }, [dismiss, setTab]);

  useEffect(() => {
    if (!socket || !roomId) return;
    const receive = (event: RoomFocusEvent) => {
      if (event?.roomId === roomId && event.lessonRevision === lessonRevision && event.taskId === taskId) {
        reveal(event.target, true);
      }
    };
    socket.on("room-focus-action", receive);
    return () => {
      socket.off("room-focus-action", receive);
      dismiss();
    };
  }, [socket, roomId, lessonRevision, taskId, reveal, dismiss]);

  useEffect(() => {
    if (!choosing) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChoosing(false);
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [choosing]);

  const picking = owner && choosing;
  const pick = (event: MouseEvent<HTMLDivElement>) => {
    if (!picking || !socket?.connected || !(event.target instanceof Element)) return;
    const node = event.target;
    const panel = node.closest(taskSelector);
    const block = node.closest(blockSelector);
    const editor = editorAt(node.closest(".cm-editor"));
    let target: Target | undefined;
    if (panel && block && panel.contains(block)) {
      target = {
        panel: "task", index: taskBlocks(panel).indexOf(block),
        offset: block.getBoundingClientRect().top - panel.getBoundingClientRect().top,
      };
    } else if (editor && node.closest(".cm-line, .cm-lineNumbers .cm-gutterElement")) {
      const position = editor.posAtCoords({ x: Math.max(event.clientX, editor.contentDOM.getBoundingClientRect().left + 1), y: event.clientY }, false);
      const line = editor.state.doc.lineAt(position);
      target = {
        panel: "code", index: line.number,
        offset: editor.documentTop + editor.lineBlockAt(line.from).top - editor.scrollDOM.getBoundingClientRect().top,
      };
    }
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    setChoosing(false);
    reveal(target, false);
    socket.emit("room-focus", { roomId, telegramId, lessonRevision, taskId, target });
  };

  return { workspace, picking, pick, start: () => setChoosing(true) };
}
