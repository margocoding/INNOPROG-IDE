import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import type { Socket } from 'socket.io-client';
import * as Y from 'yjs';
import type { ConsoleOutputChunk, ConsoleState } from './useConsoleExecution';

const GUEST_INTRO_KEY = 'innoprog-ide-shared-console-intro';

export type RunMode = 'batch' | 'console';
export type ConsoleControl = 'input' | 'eof' | 'interrupt' | 'stop' | 'clear';
export type SharedConsoleSnapshot = {
  state: ConsoleState;
  chunks: ConsoleOutputChunk[];
  message: string;
  exitCode: number | null;
  deadline: number;
  batch?: {
    output: string;
    input: string;
    status: 'idle' | 'success' | 'error';
    mismatch: { actual: string; expected: string } | null;
  };
};
type SharedRun = {
  id: string;
  mode: RunMode;
  snapshot: SharedConsoleSnapshot;
  draftVersion: number;
  frozenLine?: string;
  eof: boolean;
};
type RoomEvent<T> = { roomId: string; revision: number; value: T };
type RemoteCursor = { telegramId: string; position: Uint8Array };
export type BatchField = 'input' | 'output';
type BatchCursor = RemoteCursor & { field: BatchField };
type BatchOption = 'inputEnabled' | 'outputEnabled';
type BatchFormState = Record<BatchField, string> & Record<BatchOption, boolean> & { open: boolean };
type BatchFormMessage = Pick<BatchFormState, 'open' | BatchOption> & { draft: Uint8Array; cursors: BatchCursor[] };

type ReadResult = {
  ok: boolean;
  enabled: boolean;
  batchForm: BatchFormMessage | null;
  run: (SharedRun & { draft?: Uint8Array; cursors: RemoteCursor[] }) | null;
};
type Command = { id: string; type: ConsoleControl; data?: string };
type DraftEdit = { id: string; version: number; update: Uint8Array };

function replaceDraftText(doc: Y.Doc, field: string, value: string, send: (update: Uint8Array) => void) {
  const text = doc.getText(field);
  const before = text.toString();
  if (before === value) return;
  const previous = Array.from(before);
  const next = Array.from(value);
  let prefix = 0;
  while (prefix < previous.length && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < next.length - prefix &&
         previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  const start = previous.slice(0, prefix).join('').length;
  const removed = previous.slice(prefix, previous.length - suffix).join('').length;
  const inserted = next.slice(prefix, next.length - suffix).join('');
  doc.once('update', send);
  doc.transact(() => {
    if (removed) text.delete(start, removed);
    if (inserted) text.insert(start, inserted);
  });
}

function batchValues(doc: Y.Doc) {
  return { input: doc.getText('input').toString(), output: doc.getText('output').toString() };
}

export const sharedRunActive = (run: SharedRun | null) =>
  Boolean(run && ['connecting', 'starting', 'compiling', 'running', 'stopping'].includes(run.snapshot.state));

export function useSharedRoomConsole(
  socket: Socket | null | undefined,
  joined: boolean | undefined,
  roomId: string | null,
  telegramId: string,
  revision: number,
  onControl: (command: Command) => void,
  onOwnershipLost: () => void,
  keepRoomConnected: ((keep: boolean) => void) | undefined,
  shareSelections: boolean,
) {
  const [enabled, setEnabled] = useState<boolean>();
  const [showIntro, setShowIntro] = useState(false);
  const [startedRunId, setStartedRunId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [run, setRun] = useState<SharedRun | null>(null);
  const [line, setLine] = useState('');
  const [batchForm, setBatchForm] = useState<BatchFormState>();
  const [batchCursors, setBatchCursors] = useState<Record<string, BatchCursor>>({});
  const [detachedRun, setDetachedRun] = useState<{ id: string; line: string; eof: boolean }>();
  const [detachedBatch, setDetachedBatch] = useState<BatchFormState>();
  const batchDraft = useRef<Y.Doc>();
  const [cursors, setCursors] = useState<Record<string, Uint8Array>>({});
  const currentRun = useRef<SharedRun | null>(null);
  const draft = useRef<Y.Doc>();
  const owner = useRef<string>();
  const pendingPublish = useRef<{ snapshot: SharedConsoleSnapshot; timer: number }>();
  const lastPublishedState = useRef<ConsoleState>();
  const controlRef = useRef(onControl);
  const ownershipLostRef = useRef(onOwnershipLost);
  controlRef.current = onControl;
  ownershipLostRef.current = onOwnershipLost;

  const resetDraft = useCallback((update?: Uint8Array) => {
    draft.current?.destroy();
    draft.current = new Y.Doc();
    if (update) Y.applyUpdate(draft.current, new Uint8Array(update));
    setLine(draft.current.getText('line').toString());
    setCursors({});
  }, []);

  const setCurrentRun = useCallback((next: SharedRun | null) => {
    const current = currentRun.current;
    if (next?.id !== current?.id || next?.draftVersion !== current?.draftVersion) resetDraft();
    currentRun.current = next;
    setRun(next);
  }, [resetDraft]);

  const loseOwnership = useCallback(() => {
    if (!owner.current) return;
    owner.current = undefined;
    window.clearTimeout(pendingPublish.current?.timer);
    pendingPublish.current = undefined;
    ownershipLostRef.current();
  }, []);

  const request = useCallback(<T,>(action: string, values: object = {}, reply?: (result?: T) => void) => {
    if (!socket?.connected || !joined || !roomId || !telegramId) {
      reply?.();
      return false;
    }
    const payload = { roomId, telegramId, revision, action, ...values };
    if (reply) socket.timeout(2500).emit('room-console', payload, (error: Error | null, result: T) => reply(error ? undefined : result));
    else socket.emit('room-console', payload);
    return true;
  }, [socket, joined, roomId, telegramId, revision]);

  const sharingAvailable = enabled !== undefined;
  const guest = /^i\d+$/.test(telegramId);
  useEffect(() => {
    if (!joined || !sharingAvailable || !roomId || !telegramId) return;
    if (guest) {
      try {
        setShowIntro(localStorage.getItem(GUEST_INTRO_KEY) !== 'seen');
      } catch {
        setShowIntro(true);
      }
      return;
    }
    let active = true;
    request<{ ok: boolean; seen: boolean }>('intro', {}, result => {
      if (active && result?.ok) setShowIntro(!result.seen);
    });
    return () => { active = false; };
  }, [guest, joined, sharingAvailable, request, roomId, telegramId]);

  const dismissIntro = () => {
    setShowIntro(false);
    if (guest) {
      try {
        localStorage.setItem(GUEST_INTRO_KEY, 'seen');
      } catch {
        // The current room still remembers the dismissal until reload.
      }
    } else request('intro-ack');
  };

  const applyBatchForm = useCallback((message: BatchFormMessage | null, reset = false) => {
    if (reset) {
      batchDraft.current?.destroy();
      batchDraft.current = undefined;
    }
    if (!message) {
      setBatchForm(undefined);
      setBatchCursors({});
      return;
    }
    const doc = batchDraft.current ??= new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(message.draft));
    setBatchCursors(previous => {
      const current = Object.fromEntries((message.cursors ?? []).map(cursor => [cursor.telegramId, cursor]));
      if (message.open && previous[telegramId]) current[telegramId] = previous[telegramId];
      return current;
    });
    setBatchForm({
      open: message.open, inputEnabled: message.inputEnabled, outputEnabled: message.outputEnabled,
      ...batchValues(doc),
    });
  }, [telegramId]);

  const read = useCallback((active: () => boolean = () => true) => {
    request<ReadResult>('read', {}, result => {
      if (!active() || !result?.ok) return;
      setEnabled(result.enabled);
      applyBatchForm(result.batchForm ?? null, true);
      setCurrentRun(result.run);
      if (result.run?.draft) {
        resetDraft(result.run.draft);
        setCursors(Object.fromEntries(result.run.cursors
          .filter(cursor => cursor.telegramId !== telegramId)
          .map(cursor => [cursor.telegramId, cursor.position])));
      }
    });
  }, [request, resetDraft, setCurrentRun, telegramId, applyBatchForm]);

  useEffect(() => {
    if (!socket || !roomId || !joined || !telegramId) return;
    let active = true;
    const listen = <T,>(handle: (value: T) => void) => (event: RoomEvent<T>) => {
      if (event.roomId === roomId && event.revision === revision) handle(event.value);
    };
    const state = listen<SharedRun>(setCurrentRun);
    const toggle = listen<boolean>(setEnabled);
    const control = listen<Command>(value => {
      if (owner.current === value.id) controlRef.current(value);
    });
    const edit = listen<DraftEdit>(({ id, version, update }) => {
      if (currentRun.current?.id !== id || currentRun.current.draftVersion !== version || !draft.current) return;
      Y.applyUpdate(draft.current, new Uint8Array(update));
      setLine(draft.current.getText('line').toString());
    });
    const cursor = listen<{ id: string; version: number; telegramId: string; position: Uint8Array | null }>(value => {
      if (value.telegramId === telegramId || currentRun.current?.id !== value.id ||
          currentRun.current.draftVersion !== value.version) return;
      setCursors(previous => {
        const next = { ...previous };
        if (value.position === null) delete next[value.telegramId];
        else next[value.telegramId] = value.position;
        return next;
      });
    });
    const batchFormChanged = listen<BatchFormMessage | null>(applyBatchForm);
    const batchEdited = listen<Uint8Array>(update => {
      const doc = batchDraft.current;
      if (!doc) return;
      Y.applyUpdate(doc, new Uint8Array(update));
      const values = batchValues(doc);
      setBatchForm(previous => previous && { ...previous, ...values });
    });
    const batchOption = listen<{ field: BatchOption; value: boolean }>(({ field, value }) => {
      setBatchForm(previous => previous && { ...previous, [field]: value });
      if (!value) {
        const closedField = field === 'inputEnabled' ? 'input' : 'output';
        setBatchCursors(previous => Object.fromEntries(
          Object.entries(previous).filter(([, cursor]) => cursor.field !== closedField),
        ));
      }
    });
    const batchCursor = listen<Omit<BatchCursor, 'position'> & { position: Uint8Array | null }>(value => {
      if (value.telegramId === telegramId) return;
      setBatchCursors(previous => {
        const next = { ...previous };
        if (value.position) next[value.telegramId] = { ...value, position: value.position };
        else delete next[value.telegramId];
        return next;
      });
    });
    const batchDetach = listen<BatchFormMessage>(message => {
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, new Uint8Array(message.draft));
        setDetachedBatch({ ...batchValues(doc), open: true, inputEnabled: message.inputEnabled, outputEnabled: message.outputEnabled });
      } finally {
        doc.destroy();
      }
    });
    const detach = listen<{ id: string; line: string; eof: boolean }>(value => {
      if (currentRun.current?.id !== value.id) return;
      owner.current = undefined;
      window.clearTimeout(pendingPublish.current?.timer);
      pendingPublish.current = undefined;
      setDetachedRun(value);
    });
    const clearRun = () => {
      loseOwnership();
      setCurrentRun(null);
      applyBatchForm(null, true);
    };
    const disconnect = () => {
      active = false;
      clearRun();
    };
    socket.on('room-console:state', state);
    socket.on('room-console:toggle', toggle);
    socket.on('room-console:control', control);
    socket.on('room-console:edit', edit);
    socket.on('room-console:cursor', cursor);
    socket.on('room-console:batch-form', batchFormChanged);
    socket.on('room-console:batch-edit', batchEdited);
    socket.on('room-console:batch-option', batchOption);
    socket.on('room-console:batch-cursor', batchCursor);
    socket.on('room-console:batch-detach', batchDetach);
    socket.on('room-console:detach', detach);
    socket.on('complete-session', clearRun);
    socket.on('disconnect', disconnect);
    read(() => active);
    return () => {
      active = false;
      socket.off('room-console:state', state);
      socket.off('room-console:toggle', toggle);
      socket.off('room-console:control', control);
      socket.off('room-console:edit', edit);
      socket.off('room-console:cursor', cursor);
      socket.off('room-console:batch-form', batchFormChanged);
      socket.off('room-console:batch-edit', batchEdited);
      socket.off('room-console:batch-option', batchOption);
      socket.off('room-console:batch-cursor', batchCursor);
      socket.off('room-console:batch-detach', batchDetach);
      socket.off('room-console:detach', detach);
      socket.off('complete-session', clearRun);
      socket.off('disconnect', disconnect);
      loseOwnership();
      draft.current?.destroy();
      draft.current = undefined;
      batchDraft.current?.destroy();
      batchDraft.current = undefined;
    };
  }, [socket, joined, roomId, revision, telegramId, read, loseOwnership, resetDraft, setCurrentRun, applyBatchForm]);

  const isRunning = sharedRunActive(run);
  useEffect(() => {
    keepRoomConnected?.(isRunning);
    return () => keepRoomConnected?.(false);
  }, [isRunning, keepRoomConnected]);

  const toggle = (value: boolean) => {
    if (saving) return;
    setSaving(true);
    request<{ ok: boolean }>('toggle', { enabled: value }, result => {
      setSaving(false);
      if (!result?.ok) toast.error('Не удалось изменить настройку консоли');
    });
  };

  const start = useCallback((mode: RunMode) => new Promise<boolean>(resolve => {
    request<{ ok: boolean; id: string }>('start', { mode }, result => {
      if (result?.ok && currentRun.current?.id === result.id) {
        owner.current = result.id;
        setStartedRunId(result.id);
        lastPublishedState.current = undefined;
        resolve(true);
      } else {
        toast.error('Не удалось начать общий запуск');
        resolve(false);
      }
    });
  }), [request]);

  const publish = useCallback((snapshot: SharedConsoleSnapshot) => {
    const id = owner.current;
    if (!id || id !== currentRun.current?.id) return;
    const flush = (value: SharedConsoleSnapshot) => {
      if (owner.current !== id || currentRun.current?.id !== id) return;
      lastPublishedState.current = value.state;
      request('update', { id, snapshot: value });
      if (!sharedRunActive({ ...currentRun.current, snapshot: value })) owner.current = undefined;
    };
    if (lastPublishedState.current !== snapshot.state || currentRun.current?.mode === 'batch') {
      window.clearTimeout(pendingPublish.current?.timer);
      pendingPublish.current = undefined;
      flush(snapshot);
    } else if (pendingPublish.current) {
      pendingPublish.current.snapshot = snapshot;
    } else {
      const timer = window.setTimeout(() => {
        const pending = pendingPublish.current;
        pendingPublish.current = undefined;
        if (pending) flush(pending.snapshot);
      }, 75);
      pendingPublish.current = { timer, snapshot };
    }
  }, [request]);

  const edit = (value: string, position: number) => {
    const doc = draft.current;
    const active = currentRun.current;
    if (!doc || !active || new TextEncoder().encode(value).length > 4000) return;
    replaceDraftText(doc, 'line', value, update => {
      request<{ ok: boolean }>('edit', { id: active.id, version: active.draftVersion, update }, result => {
        if (!result?.ok && draft.current === doc) read();
      });
    });
    setLine(doc.getText('line').toString());
    moveCursor(position);
  };

  const moveCursor = (position: number | null) => {
    const active = currentRun.current;
    if (!active || !draft.current) return;
    const text = draft.current.getText('line');
    const relative = position === null ? null : Y.encodeRelativePosition(
      Y.createRelativePositionFromTypeIndex(text, Math.min(position, text.length)),
    );
    setCursors(previous => {
      const next = { ...previous };
      if (relative === null) delete next[telegramId];
      else next[telegramId] = relative;
      return next;
    });
    if (shareSelections) request('cursor', { id: active.id, version: active.draftVersion, position: relative });
  };

  const cursorPositions: Record<string, number> = {};
  if (draft.current) {
    for (const [id, position] of Object.entries(cursors)) {
      try {
        const relative = Y.decodeRelativePosition(new Uint8Array(position));
        const absolute = Y.createAbsolutePositionFromRelativePosition(relative, draft.current);
        if (absolute?.type === draft.current.getText('line')) cursorPositions[id] = absolute.index;
      } catch {
        // Ignore invalid or outdated positions.
      }
    }
  }

  const send = (type: ConsoleControl) => {
    const active = currentRun.current;
    return Boolean(active && request('control', { id: active.id, version: active.draftVersion, type }));
  };

  const moveBatchCursor = (field: BatchField, index: number | null) => {
    const doc = batchDraft.current;
    if (!doc) return;
    const text = doc.getText(field);
    const position = index === null ? null : Y.encodeRelativePosition(
      Y.createRelativePositionFromTypeIndex(text, Math.min(index, text.length)),
    );
    setBatchCursors(previous => {
      const next = { ...previous };
      if (position) next[telegramId] = { telegramId, field, position };
      else if (next[telegramId]?.field === field) delete next[telegramId];
      return next;
    });
    if (shareSelections) request('batch-cursor', { field, position });
  };

  const editBatch = (field: BatchField, value: string, index?: number) => {
    const doc = batchDraft.current;
    if (!doc || new TextEncoder().encode(value).length > 16_000) return;
    replaceDraftText(doc, field, value, update => {
      request<{ ok: boolean }>('batch-edit', { update }, result => {
        if (!result?.ok && batchDraft.current === doc) read();
      });
    });
    const values = batchValues(doc);
    setBatchForm(previous => previous && { ...previous, ...values });
    if (index !== undefined) moveBatchCursor(field, index);
  };

  const batchCursorPositions = Object.values(batchCursors).flatMap(cursor => {
    const doc = batchDraft.current;
    if (!doc) return [];
    try {
      const relative = Y.decodeRelativePosition(new Uint8Array(cursor.position));
      const position = Y.createAbsolutePositionFromRelativePosition(relative, doc);
      return position?.type === doc.getText(cursor.field)
        ? [{ telegramId: cursor.telegramId, field: cursor.field, index: position.index }] : [];
    } catch {
      return [];
    }
  });

  return {
    enabled, saving, toggle, showIntro, dismissIntro, startedRunId, run, isRunning, line, cursors: cursorPositions, start, publish, edit, moveCursor, send,
    clearOutput: () => {
      const current = currentRun.current;
      if (current?.snapshot.state === 'detached' || !enabled) {
        if (current) setCurrentRun({ ...current, snapshot: { ...current.snapshot, chunks: [] } });
      } else send('clear');
    },
    batchForm, editBatch, moveBatchCursor, batchCursorPositions, detachedRun, detachedBatch,
    openBatchForm: () => request('batch-open'),
    closeBatchForm: () => request('batch-close'),
    setBatchOption: (field: BatchOption, value: boolean) => request('batch-option', { field, value }),
  };

}

export function sharedOutputChunks(chunks: ConsoleOutputChunk[]) {
  const bounded: ConsoleOutputChunk[] = [];
  let remaining = 64_000;
  for (let index = chunks.length - 1; index >= 0 && bounded.length < 512 && remaining > 0; index--) {
    const chunk = chunks[index];
    const text = chunk.text.slice(-remaining);
    bounded.push({ text, stream: chunk.stream });
    remaining -= text.length;
  }
  return bounded.reverse();
}
