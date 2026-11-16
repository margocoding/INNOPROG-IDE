import { strToU8, unzipSync, zipSync } from "fflate";
import initSqlJs, { type SqlValue } from "sql.js";
import sqliteWasm from "sql.js/dist/sql-wasm-browser.wasm?url";
import type { SqlResult } from "../types/task";
import {
  MAX_SQLITE_DATABASE_BYTES, MAX_SQLITE_SCRIPT_BYTES, SQLITE_OUTPUT_LIMIT_BYTES,
  type SqliteOperation,
} from "./sqliteWorkspaceProtocol";

const sqlite = () => initSqlJs({ locateFile: () => sqliteWasm });
const encoder = new TextEncoder();

async function execute(request: SqliteOperation) {
  if (request.type === "archive") {
    const script = strToU8(request.source);
    if (script.length > MAX_SQLITE_SCRIPT_BYTES) throw new Error("Скрипт превышает лимит в 128 КБ.");
    return zipSync({ "script.sql": script, "database.sqlite": request.database });
  }
  if (request.type === "import") {
    let scriptFound = false;
    let databaseFound = false;
    const files = unzipSync(new Uint8Array(request.archive), {
      filter: ({ name, originalSize }) => {
        const script = /\.sql$/i.test(name);
        const database = /\.(sqlite3?|db)$/i.test(name);
        if (script) {
          if (scriptFound) throw new Error("В архиве больше одного SQL-скрипта.");
          if (originalSize > MAX_SQLITE_SCRIPT_BYTES) throw new Error("Скрипт превышает лимит в 128 КБ.");
          scriptFound = true;
        }
        if (database) {
          if (databaseFound) throw new Error("В архиве больше одного файла базы SQLite.");
          if (originalSize > MAX_SQLITE_DATABASE_BYTES) throw new Error("База SQLite превышает лимит в 4 МБ.");
          databaseFound = true;
        }
        return script || database;
      },
    });
    const entries = Object.entries(files);
    const scripts = entries.filter(([name]) => /\.sql$/i.test(name));
    const databases = entries.filter(([name]) => /\.(sqlite3?|db)$/i.test(name));
    if (scripts.length !== 1 || databases.length !== 1) {
      throw new Error("В архиве должны быть один SQL-скрипт и один файл базы SQLite.");
    }
    const source = new TextDecoder("utf-8", { fatal: true }).decode(scripts[0][1]);
    const database = databases[0][1];
    if (new TextDecoder().decode(database.subarray(0, 16)) !== "SQLite format 3\0") {
      throw new Error("Файл базы не в формате SQLite.");
    }
    const SQL = await sqlite();
    const db = new SQL.Database(database);
    try {
      db.exec("SELECT name FROM sqlite_schema LIMIT 1");
    } finally {
      db.close();
    }
    return { source, database };
  }

  const SQL = await sqlite();
  const db = new SQL.Database(request.database);
  try {
    const pageSize = Number(db.exec("PRAGMA page_size")[0].values[0][0]);
    db.run(`PRAGMA max_page_count = ${Math.floor(MAX_SQLITE_DATABASE_BYTES / pageSize)}`);
    db.run("PRAGMA temp_store = MEMORY");
    const tables: SqlResult[] = [];
    let outputSize = 0;
    const countOutput = (value: unknown) => {
      outputSize += encoder.encode(JSON.stringify(value)).length + 1;
      if (outputSize > SQLITE_OUTPUT_LIMIT_BYTES) throw new Error("Превышен лимит вывода");
    };

    const collect = (source: string) => {
      for (const statement of db.iterateStatements(source)) {
        const columns = statement.getColumnNames();
        if (!columns.length) {
          statement.step();
          continue;
        }
        const numericColumns: number[][] = [];
        const table: SqlResult = { columns, rows: [], numeric_columns: numericColumns };
        // sql.js supports exact INTEGER reads; the type package omits the option.
        const read = statement.get as (params: null, options: { useBigInt: boolean }) => (SqlValue | bigint)[];
        countOutput(columns);
        while (statement.step()) {
          const row = read.call(statement, null, { useBigInt: true });
          const numbers: number[] = [];
          const values = row.map((cell, index) => {
            if (typeof cell === "number" || typeof cell === "bigint") numbers.push(index);
            if (cell instanceof Uint8Array) {
              if (cell.byteLength * 2 > SQLITE_OUTPUT_LIMIT_BYTES) throw new Error("Превышен лимит вывода");
              return "X'" + Array.from(cell, byte => byte.toString(16).padStart(2, "0")).join("") + "'";
            }
            if (typeof cell === "number" && Number.isInteger(cell) && Math.abs(cell) < 1e16) return cell.toFixed(1);
            return cell === null ? null : String(cell);
          });
          countOutput([values, numbers]);
          table.rows.push(values);
          numericColumns.push(numbers);
        }
        tables.push(table);
      }
    };

    if (request.input && request.input !== "-") {
      db.run(request.source);
      collect(request.input);
    } else {
      collect(request.source);
    }
    try {
      db.run("COMMIT");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("no transaction is active")) throw error;
    }
    const database = db.export();
    if (database.byteLength > MAX_SQLITE_DATABASE_BYTES) throw new Error("База SQLite превышает лимит в 4 МБ.");
    return { tables, database };
  } finally {
    db.close();
  }
}

self.onmessage = async ({ data }: MessageEvent<SqliteOperation>) => {
  try {
    self.postMessage({ result: await execute(data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ error: message.slice(0, 1000) });
  }
};
