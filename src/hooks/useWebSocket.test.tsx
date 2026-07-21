import { act, renderHook } from "@testing-library/react";
import { io } from "socket.io-client";
import { useWebSocket } from "./useWebSocket";

jest.mock("socket.io-client", () => ({ io: jest.fn() }));
jest.mock("react-toastify", () => ({ toast: jest.fn() }));
jest.mock("../utils/roomToken", () => ({ isRoomTokenExpired: jest.fn(() => false) }));

const mockedIo = io as jest.Mock;

const createSocket = () => {
  const handlers = new Map<string, (data?: any) => void>();
  return {
    connected: true,
    disconnected: false,
    on: jest.fn((event, callback) => {
      handlers.set(event, callback);
      return this;
    }),
    emit: jest.fn(),
    close: jest.fn(),
    handlers,
  };
};

describe("useWebSocket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, "", "/?roomId=room-1");
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
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

    act(() => socket.handlers.get("members-updated")?.({
      members: [
        { telegramId: "teacher-1", online: true, username: "Teacher" },
        { telegramId: "student", online: true, username: "Student" },
      ],
    }));
    expect(result.current.roomMembers[0].isYourself).toBe(true);
    expect(localStorage.getItem("innoprog-username")).toBe("Teacher");

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

  it("emits cursor, selection, code, member, language and permission actions", () => {
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
    expect(socket.emit).toHaveBeenCalledWith("cursor", expect.any(Object));
    expect(socket.emit).toHaveBeenCalledWith("selection", expect.any(Object));
    expect(socket.emit).toHaveBeenCalledWith("code-edit", expect.any(Object));
    expect(socket.emit).toHaveBeenCalledWith("edit-member", expect.any(Object));
    expect(socket.emit.mock.calls.filter(([event]) => event === "edit-room")).toHaveLength(2);
    expect(socket.emit).not.toHaveBeenCalledWith(
      "edit-room",
      expect.objectContaining({ language: "" })
    );
    expect(socket.emit).toHaveBeenCalledWith("close-session", expect.any(Object));
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
    act(() => socket.handlers.get("connect_error")?.(new Error("offline")));
    expect(result.current.isConnected).toBe(false);
  });

  it("requests and persists an anonymous room token before joining", async () => {
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
    act(() => socket.handlers.get("connect")?.());
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://rooms.test/api/room/room-1/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(localStorage.getItem("innoprog-room-client-id:room-1")).toBe("i12345");
    expect(socket.emit).toHaveBeenCalledWith("join-room", expect.objectContaining({
      telegramId: "i12345", roomToken: "new-token",
    }));
  });

  it("cleans up a socket when the room disappears and rejoins on focus", () => {
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
    expect(socket.emit).toHaveBeenCalledWith("join-room", expect.any(Object));
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
