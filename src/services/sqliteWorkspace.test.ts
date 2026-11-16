/** @jest-environment node */
import "fake-indexeddb/auto";
import { SqliteWorkspace } from "./sqliteWorkspace";
import { runWorker } from "./sqliteWorkspaceClient";

jest.mock("./sqliteWorkspaceClient", () => ({ runWorker: jest.fn() }));

const worker = runWorker as jest.Mock;
const tabStorage = new Map<string, string>();

beforeAll(() => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => tabStorage.get(key) ?? null,
      setItem: (key: string, value: string) => tabStorage.set(key, value),
    },
  });
});

beforeEach(() => {
  tabStorage.clear();
  worker.mockReset();
});

it("restores both the import and a later committed database snapshot after reload", async () => {
  const initial = Uint8Array.of(1, 2);
  const updated = Uint8Array.of(3, 4);
  const sql = "UPDATE products SET price = 35;";
  const zip = {
    size: 2,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)),
  } as File;
  worker.mockResolvedValueOnce({ source: "SELECT * FROM products;", database: initial });
  await new SqliteWorkspace().importArchive(zip);

  const workspace = new SqliteWorkspace();
  expect(await workspace.restore()).toBe("SELECT * FROM products;");
  expect(workspace.hasDatabase).toBe(true);
  worker.mockResolvedValueOnce({ tables: [], database: updated });
  await workspace.run(sql, "", 5);
  expect(worker).toHaveBeenLastCalledWith("run", { source: sql, input: "", database: initial }, 5000);

  const reloaded = new SqliteWorkspace();
  expect(await reloaded.restore()).toBe(sql);
  worker.mockRejectedValueOnce(new Error("invalid SQL"));
  await expect(reloaded.run("bad sql", "", 5)).rejects.toThrow("invalid SQL");
  expect(worker).toHaveBeenLastCalledWith("run", {
    source: "bad sql", input: "", database: updated,
  }, 5000);
  expect(await new SqliteWorkspace().restore()).toBe(sql);

  tabStorage.clear();
  const otherTab = new SqliteWorkspace();
  expect(await otherTab.restore()).toBeUndefined();
  expect(otherTab.hasDatabase).toBe(false);
});
