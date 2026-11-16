import type { RunCodeResult } from "../types/task";
import { MAX_SQLITE_ARCHIVE_BYTES } from "./sqliteWorkspaceProtocol";

export class SqliteWorkspace {
  private database?: Uint8Array<ArrayBuffer>;
  private readSelection?: () => string;

  get hasDatabase() {
    return this.database !== undefined;
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
    const { runWorker } = await import("./sqliteWorkspaceClient");
    const result = await runWorker("import", { archive: await file.arrayBuffer() }, 10000);
    this.database = result.database;
    return result.source;
  }

  async run(source: string, input: string, timeout: number): Promise<RunCodeResult> {
    const database = this.database;
    if (!database) throw new Error("Сначала загрузите архив с базой SQLite.");
    const selection = this.readSelection?.();
    const { runWorker } = await import("./sqliteWorkspaceClient");
    const result = await runWorker("run", { source: selection?.trim() ? selection : source, input, database }, timeout * 1000);
    // A file opened while the query was running takes precedence over its result.
    if (this.database === database) this.database = result.database;
    return { result: true, sql_results: result.tables, comment: "Программа выполнена успешно." };
  }

  async makeArchive(source: string): Promise<Blob | undefined> {
    if (!this.database) return undefined;
    const { runWorker } = await import("./sqliteWorkspaceClient");
    const bytes = await runWorker("archive", { source, database: this.database }, 10000);
    return new Blob([bytes], { type: "application/zip" });
  }
}
