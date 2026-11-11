import { type RefObject, useLayoutEffect } from "react";
import type { Socket } from "socket.io-client";

export interface TaskScrollSync {
  socket: Socket;
  roomId: string;
  telegramId: string;
  lessonRevision: number;
  taskId: string | null;
}

type TaskScroll = Omit<TaskScrollSync, "socket" | "telegramId"> & { progress: number };

const localScroll = new WeakMap<HTMLElement, (top: number) => void>();

export function scrollTaskLocally(panel: HTMLElement, top: number) {
  const apply = localScroll.get(panel);
  if (apply) apply(top);
  else panel.scrollTop = top;
}

export function useTaskScrollSync(
  ref: RefObject<HTMLDivElement>,
  sync?: TaskScrollSync,
) {
  const { socket, roomId, telegramId, lessonRevision, taskId } = sync ?? {};

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel || !socket || !roomId || !telegramId ||
        lessonRevision === undefined || taskId === undefined) return;

    let lastTop = panel.scrollTop;
    let timer: number | undefined;
    const maxScroll = () => Math.max(0, panel.scrollHeight - panel.clientHeight);
    const cancelSend = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };
    const onScroll = () => {
      if (panel.scrollTop === lastTop) return;
      lastTop = panel.scrollTop;
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        const max = maxScroll();
        if (socket.connected && max > 0) {
          socket.emit("task-scroll", {
            roomId, telegramId, lessonRevision, taskId,
            progress: Math.max(0, Math.min(1, lastTop / max)),
          } satisfies TaskScroll & { telegramId: string });
        }
      }, 40);
    };
    const scrollWithoutBroadcast = (top: number) => {
      cancelSend();
      panel.scrollTop = top;
      // The browser dispatches the resulting scroll event asynchronously.
      // Record the actual (possibly rounded) position so it isn't sent back.
      lastTop = panel.scrollTop;
    };
    const onRemoteScroll = (event: TaskScroll) => {
      if (event?.roomId !== roomId || event.lessonRevision !== lessonRevision ||
          event.taskId !== taskId || !Number.isFinite(event.progress) ||
          event.progress < 0 || event.progress > 1) return;

      scrollWithoutBroadcast(event.progress * maxScroll());
    };

    localScroll.set(panel, scrollWithoutBroadcast);
    panel.addEventListener("scroll", onScroll, { passive: true });
    socket.on("task-scroll-action", onRemoteScroll);
    return () => {
      localScroll.delete(panel);
      cancelSend();
      panel.removeEventListener("scroll", onScroll);
      socket.off("task-scroll-action", onRemoteScroll);
    };
  }, [ref, socket, roomId, telegramId, lessonRevision, taskId]);
}
