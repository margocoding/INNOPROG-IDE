import type { RunCodeResult } from "../types/task";

export const MAX_SQLITE_DATABASE_BYTES = 4 * 1024 * 1024;
export const MAX_SQLITE_ARCHIVE_BYTES = MAX_SQLITE_DATABASE_BYTES + 256 * 1024;
export const MAX_SQLITE_SCRIPT_BYTES = 128 * 1024;
export const SQLITE_OUTPUT_LIMIT_BYTES = 1024 * 1024;

export type Operations = {
  import: { request: { archive: ArrayBuffer }; result: { source: string; database: Uint8Array<ArrayBuffer> } };
  run: { request: { source: string; input: string; database: Uint8Array<ArrayBuffer> }; result: { tables: NonNullable<RunCodeResult["sql_results"]>; database: Uint8Array<ArrayBuffer> } };
  archive: { request: { source: string; database: Uint8Array<ArrayBuffer> }; result: Uint8Array<ArrayBuffer> };
};

export type SqliteOperation = {
  [K in keyof Operations]: { type: K } & Operations[K]["request"];
}[keyof Operations];
