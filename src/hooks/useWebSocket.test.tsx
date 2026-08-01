import { act, renderHook } from "@testing-library/react";
import { io } from "socket.io-client";
import * as Y from "yjs";
import { useWebSocket } from "./useWebSocket";
import { savePendingCodeUpdate } from "../services/reliableCodeQueue";
import * as reliableCodeQueue from "../services/reliableCodeQueue";

jest.mock("socket.io-client", () => ({ io: jest.fn() }));
jest.mock("react-toastify", () => ({ toast: jest.fn() }));
jest.mock("../utils/roomToken", () => ({ isRoomTokenExpired: jest.fn(() => false) }));

const mockedIo = io as jest.Mock;

const createSocket = () => {
  const handlers = new Map<string, (data?: any) => void>();
  const serverDoc = new Y.Doc();
  const socket: any = {
    connected: true,
    disconnected: false,
    active: true,
    on: jest.fn((event, callback) => {
      handlers.set(event, callback);
      return socket;
    }),
    connect: jest.fn(),
    close: jest.fn(),
    handlers,
    syncUpdateResponses: [],
    deferredSyncUpdates: [],
    deferNextSyncUpdate: false,
    deferredSyncInits: [],
    deferNextSyncInit: false,
  };
  socket.timeout = jest.fn(() => socket);
  socket.emit = jest.fn((event: string, payload: any, ack?: Function) => {
    if (typeof ack !== "function") return socket;
    if (event === "code-sync:init") {
      if (socket.deferNextSyncInit) {
        socket.deferNextSyncInit = false;
        socket.deferredSyncInits.push({ ack, payload });
        return socket;
      }
      const stateVector = new Uint8Array(payload.stateVector);
      ack(null, {
        ok: true,
        serverUpdate: Y.encodeStateAsUpdate(serverDoc, stateVector),
        serverStateVector: Y.encodeStateVector(serverDoc),
      });
    } else if (event === "code-sync:update") {
      if (socket.deferNextSyncUpdate) {
        socket.deferNextSyncUpdate = false;
        socket.deferredSyncUpdates.push({ ack, payload });
        return socket;
      }
      const response = socket.syncUpdateResponses.shift();
      if (response) {
        ack(null, { ...response, sequence: payload.sequence });
        return socket;
      }
      Y.applyUpdate(serverDoc, new Uint8Array(payload.update));
      ack(null, { ok: true, persisted: true, sequence: payload.sequence });
    }
    return socket;
  });
  return socket;
};

const flushAsyncWork = async () => {
  for (let iteration = 0; iteration < 8; iteration += 1) {
    await Promise.resolve();
  }
};

describe("useWebSocket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    const actualSave = reliableCodeQueue.savePendingCodeUpdate;
    const actualClear = reliableCodeQueue.clearPendingCodeUpdate;
    jest
      .spyOn(reliableCodeQueue, "savePendingCodeUpdate")
      .mockImplementation(async (...args) => {
        await actualSave(...args);
        return true;
      });
    jest
      .spyOn(reliableCodeQueue, "clearPendingCodeUpdate")
      .mockImplementation(async (...args) => {
        await actualClear(...args);
        return true;
      });
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/?roomId=room-1");
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
      await flushAsyncWork();
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("connects, joins and maps collaborative room events", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "teacher-1",
      roomId: "room-1",
      roomToken: "token",
    }));
    expect(mockedIo).toHaveBeenCalledWith("wss://rooms.test", expect.any(Object));

    act(() => socket.handlers.get("connect")?.());
    act(() => jest.advanceTimersByTime(100));
    expect(socket.emit).toHaveBeenCalledWith("join-room", expect.objectContaining({
      telegramId: "teacher-1", roomId: "room-1", roomToken: "token",
    }));

    act(() => socket.handlers.get("joined")?.({
      telegramId: "teacher-1",
      username: "Артемий Королёв",
      isTeacher: true,
      completed: false,
      language: "py",
      joinedCode: "print(1)",
      roomPermissions: {
        studentCursorEnabled: true,
        studentSelectionEnabled: true,
        studentEditCodeEnabled: true,
      },
      currentCursors: [{ telegramId: "student", position: [1, 2] }],
      currentSelections: [{ telegramId: "student", line: 1, column: 2 }],
    }));
    expect(result.current.isJoinedRoom).toBe(true);
    expect(result.current.joinedCode).toBe("print(1)");
    expect(result.current.cursors.has("student")).toBe(true);
    expect(result.current.selections.has("student")).toBe(true);
    expect(localStorage.getItem("innoprog-username")).toBe("Артемий Королёв");

    act(() => socket.handlers.get("members-updated")?.({
      members: [
        { telegramId: "teacher-1", online: true, username: "Teacher" },
        { telegramId: "student", online: true, username: "Student" },
      ],
    }));
    expect(result.current.roomMembers[0].isYourself).toBe(true);
    expect(localStorage.getItem("innoprog-username")).toBe("Артемий Королёв");

    act(() => socket.handlers.get("cursor-action")?.({
      telegramId: "other", position: [4, 5], username: "Other",
    }));
    expect(result.current.cursors.get("other")?.position).toEqual([4, 5]);

    act(() => socket.handlers.get("selection-state")?.({
      selections: [{ telegramId: "other", selectedText: "abc" }],
    }));
    expect(result.current.selections.get("other")?.selectedText).toBe("abc");

    act(() => socket.handlers.get("code-edit-action")?.({
      telegramId: "other", update: [1, 2, 3],
    }));
    expect(result.current.updatesFromProps).toEqual([[1, 2, 3]]);

    act(() => socket.handlers.get("room-edited")?.({
      studentCursorEnabled: false,
      studentSelectionEnabled: false,
      studentEditCodeEnabled: false,
      language: "js",
    }));
    expect(result.current.cursors.size).toBe(0);
    expect(result.current.selections.size).toBe(0);
    expect(result.current.language).toBe("js");

    act(() => socket.handlers.get("room-state-loaded")?.({
      lastCode: "loaded", participantCount: 2,
    }));
    expect(result.current.joinedCode).toBe("loaded");
  });

  it("never overwrites a display name previously entered in this browser", () => {
    localStorage.setItem("innoprog-username", "Моё сохранённое имя");
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);

    renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "teacher-1",
      roomId: "room-1",
      roomToken: "token",
    }));

    act(() => socket.handlers.get("joined")?.({
      telegramId: "teacher-1",
      username: "Имя из профиля",
      isTeacher: true,
      completed: false,
    }));
    act(() => socket.handlers.get("members-updated")?.({
      members: [
        { telegramId: "teacher-1", online: true, username: "Имя из комнаты" },
      ],
    }));

    expect(localStorage.getItem("innoprog-username")).toBe("Моё сохранённое имя");
  });

  it("uses an authenticated profile name when this browser has no saved name", () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);

    renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "student-1",
      roomId: "room-1",
      roomToken: "token",
      suggestedUsername: "Александр",
    }));

    act(() => socket.handlers.get("connect")?.());
    act(() => jest.advanceTimersByTime(100));

    expect(socket.emit).toHaveBeenCalledWith("join-room", expect.objectContaining({
      username: "Александр",
    }));
  });

  it("emits actions and durably queues code until synchronization", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "rooms.test",
      myTelegramId: "teacher-1",
      roomId: "room-1",
      roomToken: "token",
    }));
    act(() => socket.handlers.get("joined")?.({
      telegramId: "teacher-1",
      isTeacher: true,
      completed: false,
      roomPermissions: {
        studentCursorEnabled: true,
        studentSelectionEnabled: true,
        studentEditCodeEnabled: true,
      },
    }));
    act(() => {
      result.current.sendCursorPosition([1, 2]);
      result.current.sendSelection({ line: 1, column: 2 });
      result.current.onSendUpdate?.(new Uint8Array([1]));
      result.current.sendEditMember("Name");
      result.current.sendChangeLanguage("js" as any);
      result.current.sendChangeLanguage("" as any);
      result.current.sendRoomPermissions({
        studentCursorEnabled: false,
        studentSelectionEnabled: true,
        studentEditCodeEnabled: true,
      });
      result.current.completeSession();
    });
    await act(flushAsyncWork);
    expect(socket.emit).toHaveBeenCalledWith("cursor", expect.any(Object));
    expect(socket.emit).toHaveBeenCalledWith("selection", expect.any(Object));
    expect(result.current.hasPendingCodeChanges).toBe(true);
    expect(socket.emit).not.toHaveBeenCalledWith("code-edit", expect.any(Object));
    expect(socket.emit).toHaveBeenCalledWith("edit-member", expect.any(Object));
    expect(socket.emit.mock.calls.filter(([event]) => event === "edit-room")).toHaveLength(2);
    expect(socket.emit).not.toHaveBeenCalledWith(
      "edit-room",
      expect.objectContaining({ language: "" })
    );
    expect(socket.emit).toHaveBeenCalledWith("close-session", expect.any(Object));
  });

  it("does not transmit an update until IndexedDB has stored it", async () => {
    jest
      .spyOn(reliableCodeQueue, "savePendingCodeUpdate")
      .mockResolvedValueOnce(false);
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "student-1",
      roomId: "room-1",
      roomToken: "token",
    }));
    const doc = new Y.Doc();

    act(() => result.current.bindYDoc(doc));
    act(() => socket.handlers.get("connect")?.());
    act(() => socket.handlers.get("joined")?.({
      telegramId: "student-1",
      isTeacher: false,
      completed: false,
      roomPermissions: { studentEditCodeEnabled: true },
    }));
    await act(flushAsyncWork);
    socket.emit.mockClear();

    act(() => result.current.onSendUpdate(new Uint8Array([1, 2, 3])));
    await act(flushAsyncWork);

    expect(result.current.hasDurableStorageError).toBe(true);
    expect(socket.emit).not.toHaveBeenCalledWith(
      "code-sync:update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("completes init before the sequenced update and reaches synchronized", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "student-1",
      roomId: "room-1",
      roomToken: "token",
    }));
    const doc = new Y.Doc();
    doc.getText("codemirror").insert(0, "local code");

    act(() => result.current.bindYDoc(doc));
    act(() => socket.handlers.get("connect")?.());
    act(() => socket.handlers.get("joined")?.({
      telegramId: "student-1",
      isTeacher: false,
      completed: false,
      roomPermissions: {
        studentCursorEnabled: true,
        studentSelectionEnabled: true,
        studentEditCodeEnabled: true,
      },
    }));
    await act(flushAsyncWork);

    const syncEvents = socket.emit.mock.calls
      .map(([event]: [string]) => event)
      .filter((event: string) => event.startsWith("code-sync:"));
    expect(syncEvents).toEqual(["code-sync:init", "code-sync:update"]);
    expect(result.current.codeSyncState).toBe("synchronized");
    expect(result.current.hasPendingCodeChanges).toBe(false);
  });

  it("synchronizes a read-only participant without attempting an edit", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "student-1",
      roomId: "room-1",
      roomToken: "token",
    }));
    act(() => result.current.bindYDoc(new Y.Doc()));
    act(() => socket.handlers.get("connect")?.());
    act(() => socket.handlers.get("joined")?.({
      telegramId: "student-1",
      isTeacher: false,
      completed: false,
      roomPermissions: { studentEditCodeEnabled: false },
    }));
    await act(flushAsyncWork);

    expect(result.current.codeSyncState).toBe("synchronized");
    expect(socket.emit.mock.calls.some(
      ([event]: [string]) => event === "code-sync:update",
    )).toBe(false);
  });

  it("preserves offline edits while permission is disabled and sends them when restored", async () => {
    const queueClientId = "permission-transition-client";
    sessionStorage.setItem("innoprog-ide-client-instance", queueClientId);
    const offlineDoc = new Y.Doc();
    let offlineUpdate = new Uint8Array();
    offlineDoc.on("update", (value: Uint8Array) => { offlineUpdate = value; });
    offlineDoc.getText("codemirror").insert(0, "offline work");
    await savePendingCodeUpdate("room-1", queueClientId, offlineUpdate, 2);

    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "student-1",
      roomId: "room-1",
      roomToken: "token",
    }));
    const doc = new Y.Doc();
    act(() => result.current.bindYDoc(doc));
    act(() => socket.handlers.get("connect")?.());
    act(() => socket.handlers.get("joined")?.({
      telegramId: "student-1",
      isTeacher: false,
      completed: false,
      roomPermissions: { studentEditCodeEnabled: false },
    }));
    await act(flushAsyncWork);

    expect(result.current.codeSyncState).toBe("waiting-permission");
    expect(result.current.hasPendingCodeChanges).toBe(true);
    expect(doc.getText("codemirror").toString()).toBe("offline work");
    expect(socket.emit.mock.calls.some(
      ([event]: [string]) => event === "code-sync:update",
    )).toBe(false);

    act(() => socket.handlers.get("room-edited")?.({
      studentEditCodeEnabled: true,
    }));
    await act(flushAsyncWork);

    expect(socket.emit.mock.calls.some(
      ([event]: [string]) => event === "code-sync:update",
    )).toBe(true);
    expect(result.current.codeSyncState).toBe("synchronized");
    expect(result.current.hasPendingCodeChanges).toBe(false);
  });

  it("keeps offline edits queued and replays them after reconnect", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "student-1",
      roomId: "room-1",
      roomToken: "token",
    }));
    const doc = new Y.Doc();
    act(() => result.current.bindYDoc(doc));
    act(() => socket.handlers.get("connect")?.());
    act(() => socket.handlers.get("joined")?.({
      telegramId: "student-1", isTeacher: false, completed: false,
    }));
    await act(flushAsyncWork);
    socket.emit.mockClear();

    socket.connected = false;
    socket.disconnected = true;
    socket.active = false;
    act(() => socket.handlers.get("disconnect")?.("transport close"));
    const offlineSource = new Y.Doc();
    let offlineUpdate = new Uint8Array();
    offlineSource.on("update", (update: Uint8Array) => { offlineUpdate = update; });
    offlineSource.getText("codemirror").insert(0, "typed offline");
    act(() => {
      Y.applyUpdate(doc, offlineUpdate);
      result.current.onSendUpdate?.(offlineUpdate);
    });
    await act(flushAsyncWork);

    expect(result.current.hasPendingCodeChanges).toBe(true);
    expect(socket.emit).not.toHaveBeenCalledWith(
      "code-sync:update",
      expect.anything(),
      expect.anything(),
    );

    socket.connected = true;
    socket.disconnected = false;
    socket.active = true;
    act(() => socket.handlers.get("connect")?.());
    act(() => socket.handlers.get("joined")?.({
      telegramId: "student-1", isTeacher: false, completed: false,
    }));
    await act(flushAsyncWork);

    expect(socket.emit).toHaveBeenCalledWith(
      "code-sync:update",
      expect.objectContaining({ update: expect.any(Uint8Array) }),
      expect.any(Function),
    );
    expect(result.current.codeSyncState).toBe("synchronized");
    expect(result.current.hasPendingCodeChanges).toBe(false);
  });

  it("retries the same sequence after a negative persistence acknowledgement", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "student-1",
      roomId: "room-1",
      roomToken: "token",
    }));
    const doc = new Y.Doc();
    act(() => result.current.bindYDoc(doc));
    act(() => socket.handlers.get("connect")?.());
    act(() => socket.handlers.get("joined")?.({
      telegramId: "student-1", isTeacher: false, completed: false,
    }));
    await act(flushAsyncWork);
    socket.emit.mockClear();

    socket.syncUpdateResponses.push({ ok: false, persisted: false });
    const source = new Y.Doc();
    let update = new Uint8Array();
    source.on("update", (value: Uint8Array) => { update = value; });
    source.getText("codemirror").insert(0, "must survive negative ack");
    act(() => result.current.onSendUpdate?.(update));
    await act(flushAsyncWork);

    const firstAttempt = socket.emit.mock.calls.find(
      ([event]: [string]) => event === "code-sync:update",
    );
    expect(firstAttempt).toBeDefined();
    expect(result.current.hasPendingCodeChanges).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await flushAsyncWork();
    });

    const attempts = socket.emit.mock.calls.filter(
      ([event]: [string]) => event === "code-sync:update",
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[1][1].sequence).toBe(attempts[0][1].sequence);
    expect(result.current.hasPendingCodeChanges).toBe(false);
  });

  it("pauses an in-flight update when edit permission is revoked", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "student-1",
      roomId: "room-1",
      roomToken: "token",
    }));
    const doc = new Y.Doc();
    act(() => result.current.bindYDoc(doc));
    act(() => socket.handlers.get("connect")?.());
    act(() => socket.handlers.get("joined")?.({
      telegramId: "student-1",
      isTeacher: false,
      completed: false,
      roomPermissions: { studentEditCodeEnabled: true },
    }));
    await act(flushAsyncWork);
    socket.emit.mockClear();

    socket.deferNextSyncUpdate = true;
    const source = new Y.Doc();
    let update = new Uint8Array();
    source.on("update", (value: Uint8Array) => { update = value; });
    source.getText("codemirror").insert(0, "offline permission change");
    Y.applyUpdate(doc, update);
    act(() => result.current.onSendUpdate?.(update));
    await act(flushAsyncWork);
    expect(socket.deferredSyncUpdates).toHaveLength(1);

    act(() => socket.handlers.get("room-edited")?.({
      studentEditCodeEnabled: false,
    }));
    const deferred = socket.deferredSyncUpdates[0];
    act(() => deferred.ack(null, {
      ok: false,
      persisted: false,
      sequence: deferred.payload.sequence,
    }));
    await act(flushAsyncWork);
    expect(result.current.codeSyncState).toBe("waiting-permission");

    await act(async () => {
      jest.advanceTimersByTime(3_000);
      await flushAsyncWork();
    });
    expect(socket.emit.mock.calls.filter(
      ([event]: [string]) => event === "code-sync:update",
    )).toHaveLength(1);

    act(() => socket.handlers.get("room-edited")?.({
      studentEditCodeEnabled: true,
    }));
    await act(flushAsyncWork);
    expect(socket.emit.mock.calls.filter(
      ([event]: [string]) => event === "code-sync:update",
    ).length).toBeGreaterThan(1);
  });

  it("isolates late acknowledgements from a previous room generation", async () => {
    const firstSocket = createSocket();
    const secondSocket = createSocket();
    mockedIo
      .mockReturnValueOnce(firstSocket)
      .mockReturnValueOnce(secondSocket);
    const { result, rerender } = renderHook(
      ({ roomId }) => useWebSocket({
        socketUrl: "https://rooms.test",
        myTelegramId: "student-1",
        roomId,
        roomToken: "token",
      }),
      { initialProps: { roomId: "room-a" } },
    );
    act(() => result.current.bindYDoc(new Y.Doc()));
    act(() => firstSocket.handlers.get("connect")?.());
    act(() => firstSocket.handlers.get("joined")?.({
      telegramId: "student-1", isTeacher: false, completed: false,
    }));
    await act(flushAsyncWork);

    firstSocket.deferNextSyncUpdate = true;
    const firstSource = new Y.Doc();
    let firstUpdate = new Uint8Array();
    firstSource.on("update", (value: Uint8Array) => { firstUpdate = value; });
    firstSource.getText("codemirror").insert(0, "room A");
    act(() => result.current.onSendUpdate?.(firstUpdate));
    await act(flushAsyncWork);
    expect(firstSocket.deferredSyncUpdates).toHaveLength(1);

    rerender({ roomId: "room-b" });
    act(() => result.current.bindYDoc(new Y.Doc()));
    act(() => secondSocket.handlers.get("connect")?.());
    act(() => secondSocket.handlers.get("joined")?.({
      telegramId: "student-1", isTeacher: false, completed: false,
    }));
    await act(flushAsyncWork);

    secondSocket.deferNextSyncUpdate = true;
    const secondSource = new Y.Doc();
    let secondUpdate = new Uint8Array();
    secondSource.on("update", (value: Uint8Array) => { secondUpdate = value; });
    secondSource.getText("codemirror").insert(0, "room B");
    act(() => result.current.onSendUpdate?.(secondUpdate));
    await act(flushAsyncWork);
    expect(secondSocket.deferredSyncUpdates).toHaveLength(1);

    act(() => {
      const stale = firstSocket.deferredSyncUpdates.shift();
      stale.ack(null, {
        ok: true,
        persisted: true,
        sequence: stale.payload.sequence,
      });
    });
    await act(flushAsyncWork);

    expect(result.current.hasPendingCodeChanges).toBe(true);
    act(() => {
      const current = secondSocket.deferredSyncUpdates.shift();
      current.ack(null, {
        ok: true,
        persisted: true,
        sequence: current.payload.sequence,
      });
    });
    await act(flushAsyncWork);
    expect(result.current.hasPendingCodeChanges).toBe(false);
  });

  it("ignores a delayed synchronization handshake after switching rooms", async () => {
    const firstSocket = createSocket();
    const secondSocket = createSocket();
    firstSocket.deferNextSyncInit = true;
    mockedIo
      .mockReturnValueOnce(firstSocket)
      .mockReturnValueOnce(secondSocket);
    const { result, rerender } = renderHook(
      ({ roomId }) => useWebSocket({
        socketUrl: "https://rooms.test",
        myTelegramId: "student-1",
        roomId,
        roomToken: "token",
      }),
      { initialProps: { roomId: "room-a" } },
    );
    const roomADoc = new Y.Doc();
    roomADoc.getText("codemirror").insert(0, "only A");
    act(() => result.current.bindYDoc(roomADoc));
    act(() => firstSocket.handlers.get("connect")?.());
    act(() => firstSocket.handlers.get("joined")?.({
      telegramId: "student-1", isTeacher: false, completed: false,
    }));
    await act(flushAsyncWork);
    expect(firstSocket.deferredSyncInits).toHaveLength(1);

    rerender({ roomId: "room-b" });
    const roomBDoc = new Y.Doc();
    act(() => result.current.bindYDoc(roomBDoc));
    act(() => secondSocket.handlers.get("connect")?.());
    act(() => secondSocket.handlers.get("joined")?.({
      telegramId: "student-1", isTeacher: false, completed: false,
    }));
    await act(flushAsyncWork);
    expect(result.current.codeSyncState).toBe("synchronized");

    act(() => {
      const stale = firstSocket.deferredSyncInits.shift();
      stale.ack(null, {
        ok: true,
        serverUpdate: new Uint8Array(),
        serverStateVector: new Uint8Array([0]),
      });
    });
    await act(flushAsyncWork);

    expect(roomBDoc.getText("codemirror").toString()).toBe("");
    expect(result.current.codeSyncState).toBe("synchronized");
  });

  it("handles departures, replacement and connection failures", () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "http://rooms.test",
      myTelegramId: "student",
      roomId: "room-1",
      roomToken: "token",
    }));
    act(() => socket.handlers.get("joined")?.({
      telegramId: "student",
      completed: false,
      currentCursors: [{ telegramId: "other", position: [1, 1] }],
      currentSelections: [{ telegramId: "other", line: 1, column: 1 }],
    }));
    act(() => socket.handlers.get("member-left")?.({
      telegramId: "other", keepCursor: false,
    }));
    expect(result.current.cursors.has("other")).toBe(false);
    act(() => socket.handlers.get("room-session-replaced")?.());
    expect(result.current.connectionError).toBe("Комната открыта в другом окне");
    act(() => result.current.onSendUpdate?.(new Uint8Array([1, 2, 3])));
    expect(result.current.isSessionReplaced).toBe(true);
    expect(result.current.hasPendingCodeChanges).toBe(false);
    act(() => socket.handlers.get("connect_error")?.(new Error("offline")));
    expect(result.current.isConnected).toBe(false);
  });

  it("requests an anonymous room token without persisting the secret", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        roomToken: "new-token",
        telegramId: "i12345",
      }),
    } as any);
    renderHook(() => useWebSocket({
      socketUrl: "wss://rooms.test",
      myTelegramId: null,
      roomId: "room-1",
      roomToken: null,
    }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => socket.handlers.get("connect")?.());
    expect(global.fetch).toHaveBeenCalledWith(
      "https://rooms.test/api/room/room-1/token",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(localStorage.getItem("innoprog-room-client-id:room-1")).toBe("i12345");
    expect(sessionStorage.getItem("innoprog-room-token:room-1")).toBeNull();
    expect(window.location.href).not.toContain("new-token");
    expect(socket.emit).toHaveBeenCalledWith("join-room", expect.objectContaining({
      telegramId: "i12345", roomToken: "new-token",
    }));
  });

  it("exchanges a one-time launch code before joining as the teacher", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ roomToken: "teacher-token", telegramId: "42" }),
    } as any);
    renderHook(() => useWebSocket({
      socketUrl: "wss://rooms.test",
      myTelegramId: null,
      roomId: "room-1",
      roomToken: null,
      roomLaunchCode: "single-use-code",
    }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => socket.handlers.get("connect")?.());
    expect(global.fetch).toHaveBeenCalledWith(
      "https://rooms.test/api/room/room-1/launch",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"launchCode":"single-use-code"'),
      }),
    );
    expect(socket.emit).toHaveBeenCalledWith("join-room", expect.objectContaining({
      telegramId: "42", roomToken: "teacher-token",
    }));
  });

  it("finishes the teacher launch exchange before creating the websocket", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    let resolveExchange: ((value: unknown) => void) | undefined;
    global.fetch = jest.fn(() => new Promise((resolve) => {
      resolveExchange = resolve;
    })) as jest.Mock;

    renderHook(() => useWebSocket({
      socketUrl: "wss://rooms.test",
      myTelegramId: null,
      roomId: "room-1",
      roomToken: null,
      roomLaunchCode: "single-use-code",
    }));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockedIo).not.toHaveBeenCalled();

    await act(async () => {
      resolveExchange?.({
        ok: true,
        json: async () => ({ roomToken: "teacher-token", telegramId: "42" }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedIo).toHaveBeenCalledTimes(1);
  });

  it("retries a teacher launch exchange once when the first response is interrupted", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new TypeError("connection interrupted"))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: jest.fn().mockResolvedValue({
          roomToken: "recovered-teacher-token",
          telegramId: "42",
        }),
      } as any);

    renderHook(() => useWebSocket({
      socketUrl: "wss://rooms.test",
      myTelegramId: null,
      roomId: "room-1",
      roomToken: null,
      roomLaunchCode: "single-use-code",
    }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => socket.handlers.get("connect")?.());

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenCalledWith("join-room", expect.objectContaining({
      telegramId: "42",
      roomToken: "recovered-teacher-token",
    }));
  });

  it("lets Socket.IO reconnect without constructing a competing socket", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);

    renderHook(() => useWebSocket({
      socketUrl: "wss://rooms.test",
      myTelegramId: "teacher-1",
      roomId: "room-1",
      roomToken: "teacher-token",
    }));

    act(() => socket.handlers.get("disconnect")?.("transport close"));
    act(() => jest.advanceTimersByTime(10_000));

    expect(mockedIo).toHaveBeenCalledTimes(1);
  });

  it("uses a fresh connection epoch after a page-level remount", () => {
    const firstSocket = createSocket();
    const secondSocket = createSocket();
    mockedIo
      .mockReturnValueOnce(firstSocket)
      .mockReturnValueOnce(secondSocket);

    const first = renderHook(() => useWebSocket({
      socketUrl: "wss://rooms.test",
      myTelegramId: "teacher-1",
      roomId: "room-1",
      roomToken: "teacher-token",
    }));
    act(() => firstSocket.handlers.get("connect")?.());
    const firstInstance = firstSocket.emit.mock.calls.find(
      ([event]: [string]) => event === "join-room",
    )?.[1].clientInstanceId;
    first.unmount();

    renderHook(() => useWebSocket({
      socketUrl: "wss://rooms.test",
      myTelegramId: "teacher-1",
      roomId: "room-1",
      roomToken: "teacher-token",
    }));
    act(() => secondSocket.handlers.get("connect")?.());
    const secondInstance = secondSocket.emit.mock.calls.find(
      ([event]: [string]) => event === "join-room",
    )?.[1].clientInstanceId;

    expect(firstInstance).toBeTruthy();
    expect(secondInstance).toBeTruthy();
    expect(secondInstance).not.toBe(firstInstance);
  });

  it("reconnects the same socket after an explicit server disconnect", () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    renderHook(() => useWebSocket({
      socketUrl: "wss://rooms.test",
      myTelegramId: "teacher-1",
      roomId: "room-1",
      roomToken: "teacher-token",
    }));
    socket.connected = false;
    socket.disconnected = true;

    act(() => socket.handlers.get("disconnect")?.("io server disconnect"));
    act(() => jest.advanceTimersByTime(1_000));

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(mockedIo).toHaveBeenCalledTimes(1);
  });

  it("cleans up a socket when the room disappears without rejoining on focus", () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { rerender } = renderHook(
      ({ roomId }) => useWebSocket({
        socketUrl: "https://rooms.test",
        myTelegramId: "teacher",
        roomId,
        roomToken: "token",
      }),
      { initialProps: { roomId: "room-1" as string | null } },
    );
    act(() => {
      socket.handlers.get("connect")?.();
      jest.advanceTimersByTime(100);
    });
    socket.emit.mockClear();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(socket.emit).not.toHaveBeenCalledWith("join-room", expect.any(Object));
    rerender({ roomId: null });
    expect(socket.close).toHaveBeenCalled();
  });

  it("accepts binary Blob code edits and ignores self echoes", async () => {
    const socket = createSocket();
    mockedIo.mockReturnValue(socket);
    const { result } = renderHook(() => useWebSocket({
      socketUrl: "https://rooms.test",
      myTelegramId: "self",
      roomId: "room-1",
      roomToken: "token",
    }));
    act(() => socket.handlers.get("joined")?.({
      telegramId: "self", completed: false,
    }));
    act(() => socket.handlers.get("code-edit-action")?.({
      telegramId: "self", update: [9],
    }));
    expect(result.current.updatesFromProps).toEqual([]);
    const blob = new Blob([new Uint8Array([1, 2])]);
    if (!(blob as any).arrayBuffer) {
      Object.defineProperty(blob, "arrayBuffer", {
        value: async () => new Uint8Array([1, 2]).buffer,
      });
    }
    await act(async () => {
      socket.handlers.get("code-edit-action")?.({
        telegramId: "other", update: blob,
      });
      await Promise.resolve();
    });
    expect(result.current.updatesFromProps).toHaveLength(1);
  });
});
