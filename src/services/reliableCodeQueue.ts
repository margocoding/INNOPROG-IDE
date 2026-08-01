export interface StoredCodeUpdate {
  update: Uint8Array;
  nextSequence: number;
}

interface StoredRecord {
  key: string;
  update: number[];
  nextSequence: number;
  savedAt: number;
}

const DB_NAME = "innoprog-ide-sync";
const STORE_NAME = "pending-code-updates";
const DB_VERSION = 1;
const memoryFallback = new Map<string, StoredRecord>();

const makeKey = (roomId: string, clientInstanceId: string) =>
  `${roomId}:${clientInstanceId}`;

const openDatabase = (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
};

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, resolve: (value: T) => void) => void,
): Promise<T | null> => {
  const database = await openDatabase();
  if (!database) return null;

  return new Promise<T | null>((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, mode);
      let operationResult: T | null = null;
      operation(transaction.objectStore(STORE_NAME), (value) => {
        operationResult = value;
      });
      transaction.onerror = () => {
        database.close();
        resolve(null);
      };
      transaction.onabort = () => {
        database.close();
        resolve(null);
      };
      transaction.oncomplete = () => {
        database.close();
        resolve(operationResult);
      };
    } catch {
      database.close();
      resolve(null);
    }
  });
};

export const loadPendingCodeUpdate = async (
  roomId: string,
  clientInstanceId: string,
): Promise<StoredCodeUpdate | null> => {
  const key = makeKey(roomId, clientInstanceId);
  const stored = await runTransaction<StoredRecord | null>(
    "readonly",
    (store, resolve) => {
      const request = store.get(key);
      request.onsuccess = () => resolve((request.result as StoredRecord) ?? null);
      request.onerror = () => resolve(null);
    },
  );
  const record = stored ?? memoryFallback.get(key) ?? null;
  if (!record?.update?.length) return null;
  return {
    update: new Uint8Array(record.update),
    nextSequence: Math.max(1, Number(record.nextSequence) || 1),
  };
};

export const savePendingCodeUpdate = async (
  roomId: string,
  clientInstanceId: string,
  update: Uint8Array,
  nextSequence: number,
): Promise<boolean> => {
  const key = makeKey(roomId, clientInstanceId);
  const record: StoredRecord = {
    key,
    update: Array.from(update),
    nextSequence,
    savedAt: Date.now(),
  };
  memoryFallback.set(key, record);
  const persisted = await runTransaction<boolean>("readwrite", (store, resolve) => {
    const request = store.put(record);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
  return persisted === true;
};

export const clearPendingCodeUpdate = async (
  roomId: string,
  clientInstanceId: string,
): Promise<boolean> => {
  const key = makeKey(roomId, clientInstanceId);
  memoryFallback.delete(key);
  const cleared = await runTransaction<boolean>("readwrite", (store, resolve) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
  return cleared === true;
};
