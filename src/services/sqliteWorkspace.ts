import type { RunCodeResult } from "../types/task";
import { MAX_SQLITE_ARCHIVE_BYTES } from "./sqliteWorkspaceProtocol";
import { loadSqliteSnapshot, saveSqliteSnapshot, sqliteTabId, type SqliteSnapshot } from "./sqliteWorkspaceStorage";

export class SqliteWorkspace {
  private snapshot?: SqliteSnapshot;
  private restoring?: Promise<void>;
  private writes = Promise.resolve();
  private readSelection?: () => string;

  get hasDatabase() {
    return this.snapshot !== undefined;
  }

  async restore(): Promise<string | undefined> {
    this.restoring ??= this.loadSnapshot();
    await this.restoring;
    return this.snapshot?.source;
  }

  private async loadSnapshot() {
    const id = sqliteTabId();
    if (!id) return;
    try {
      this.snapshot = await loadSqliteSnapshot(id);
    } catch {
      // Browsers can deny access to IndexedDB, including in private sessions.
    }
  }

  private save(snapshot: SqliteSnapshot, previous?: SqliteSnapshot) {
    const write = this.writes.then(async () => {
      if (previous && this.snapshot !== previous) return;

      const id = sqliteTabId(true);
      if (id && typeof indexedDB !== "undefined") {
        try {
          await saveSqliteSnapshot(id, snapshot);
        } catch {
          throw new Error("Не удалось сохранить рабочую базу SQLite в браузере.");
        }
      }
      this.snapshot = snapshot;
    });
    this.writes = write.catch(() => {});
    return write;
  }

  registerSelection(readSelection: () => string) {
    this.readSelection = readSelection;
    return () => {
      if (this.readSelection === readSelection) this.readSelection = undefined;
    };
  }

  async importArchive(file: File): Promise<string> {
    if (file.size > MAX_SQLITE_ARCHIVE_BYTES) {
      throw new Error("Архив слишком большой. Размер базы SQLite ограничен 4 МБ.");
    }
    await this.restore();
    const { runWorker } = await import("./sqliteWorkspaceClient");
    const result = await runWorker("import", { archive: await file.arrayBuffer() }, 10000);
    await this.save(result);
    return result.source;
  }

  async run(source: string, input: string, timeout: number): Promise<RunCodeResult> {
    const previous = this.snapshot;
    if (!previous) throw new Error("Сначала загрузите архив с базой SQLite.");
    const selection = this.readSelection?.();
    const { runWorker } = await import("./sqliteWorkspaceClient");
    const result = await runWorker("run", { source: selection?.trim() ? selection : source, input, database: previous.database }, timeout * 1000);
    // A file opened while the query was running takes precedence over its result.
    await this.save({ source, database: result.database }, previous);
    return { result: true, sql_results: result.tables, comment: "Программа выполнена успешно." };
  }

  async makeArchive(source: string): Promise<Blob | undefined> {
    await this.restore();
    const snapshot = this.snapshot;
    if (!snapshot) return undefined;
    const { runWorker } = await import("./sqliteWorkspaceClient");
    const bytes = await runWorker("archive", { source, database: snapshot.database }, 10000);
    return new Blob([bytes], { type: "application/zip" });
  }
}
