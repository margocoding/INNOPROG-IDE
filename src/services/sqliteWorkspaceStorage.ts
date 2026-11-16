export interface SqliteSnapshot {
  source: string;
  database: Uint8Array<ArrayBuffer>;
}

const TAB_KEY = "innoprog-ide-sqlite-tab";
const DB_NAME = "innoprog-ide-sqlite";
const STORE_NAME = "workspaces";

export function sqliteTabId(create = false): string | null {
  try {
    const existing = sessionStorage.getItem(TAB_KEY);
    if (existing || !create) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(TAB_KEY, id);
    return id;
  } catch {
    return null;
  }
}

function openWorkspaceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("SQLite workspace storage is blocked"));
  });
}

async function withWorkspaceStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openWorkspaceDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? request.error);
    });
  } finally {
    database.close();
  }
}

export function loadSqliteSnapshot(id: string): Promise<SqliteSnapshot | undefined> {
  return withWorkspaceStore("readonly", store => store.get(id));
}

export async function saveSqliteSnapshot(id: string, snapshot: SqliteSnapshot): Promise<void> {
  await withWorkspaceStore("readwrite", store => store.put(snapshot, id));
}
