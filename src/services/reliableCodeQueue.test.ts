import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import {
  clearPendingCodeUpdate,
  loadPendingCodeUpdate,
  savePendingCodeUpdate,
} from "./reliableCodeQueue";

describe("reliableCodeQueue", () => {
  const roomId = "room-queue-test";
  const clientInstanceId = "browser-queue-test";

  beforeAll(() => {
    if (typeof globalThis.structuredClone !== "function") {
      Object.defineProperty(globalThis, "structuredClone", {
        configurable: true,
        value: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
      });
    }
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: fakeIndexedDB,
    });
  });

  beforeEach(async () => {
    await clearPendingCodeUpdate(roomId, clientInstanceId);
  });

  afterEach(async () => {
    await clearPendingCodeUpdate(roomId, clientInstanceId);
  });

  it("stores binary updates and the next sequence", async () => {
    await expect(savePendingCodeUpdate(
      roomId,
      clientInstanceId,
      new Uint8Array([0, 17, 255, 4]),
      42,
    )).resolves.toBe(true);

    await expect(
      loadPendingCodeUpdate(roomId, clientInstanceId),
    ).resolves.toEqual({
      update: new Uint8Array([0, 17, 255, 4]),
      nextSequence: 42,
    });
  });

  it("removes an acknowledged update", async () => {
    await savePendingCodeUpdate(
      roomId,
      clientInstanceId,
      new Uint8Array([1, 2, 3]),
      2,
    );
    await clearPendingCodeUpdate(roomId, clientInstanceId);

    await expect(
      loadPendingCodeUpdate(roomId, clientInstanceId),
    ).resolves.toBeNull();
  });

  it("isolates queues by room and browser instance", async () => {
    await savePendingCodeUpdate(
      roomId,
      clientInstanceId,
      new Uint8Array([9]),
      3,
    );

    await expect(
      loadPendingCodeUpdate("another-room", clientInstanceId),
    ).resolves.toBeNull();
    await expect(
      loadPendingCodeUpdate(roomId, "another-browser"),
    ).resolves.toBeNull();
  });

  it("falls back to the in-memory copy when IndexedDB cannot be opened", async () => {
    await savePendingCodeUpdate(
      roomId,
      clientInstanceId,
      new Uint8Array([5, 6]),
      8,
    );
    const openSpy = jest.spyOn(indexedDB, "open").mockImplementationOnce(() => {
      const request: Partial<IDBOpenDBRequest> = {};
      queueMicrotask(() => request.onerror?.(new Event("error")));
      return request as IDBOpenDBRequest;
    });

    await expect(
      loadPendingCodeUpdate(roomId, clientInstanceId),
    ).resolves.toEqual({
      update: new Uint8Array([5, 6]),
      nextSequence: 8,
    });
    openSpy.mockRestore();
  });

  it("reports that an in-memory fallback is not durable across reload", async () => {
    const openSpy = jest.spyOn(indexedDB, "open").mockImplementationOnce(() => {
      const request: Partial<IDBOpenDBRequest> = {};
      queueMicrotask(() => request.onerror?.(new Event("error")));
      return request as IDBOpenDBRequest;
    });

    await expect(savePendingCodeUpdate(
      roomId,
      clientInstanceId,
      new Uint8Array([7, 8]),
      9,
    )).resolves.toBe(false);
    openSpy.mockRestore();
  });
});
