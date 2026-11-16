import type { Operations } from "./sqliteWorkspaceProtocol";

export function runWorker<K extends keyof Operations>(
  type: K,
  request: Operations[K]["request"],
  timeout: number,
): Promise<Operations[K]["result"]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./sqliteWorkspace.worker.ts", import.meta.url), { type: "module" });
    const timer = window.setTimeout(() => finish(() => reject(new Error("Превышен лимит времени"))), timeout);

    function finish(callback: () => void) {
      clearTimeout(timer);
      worker.terminate();
      callback();
    }

    worker.onmessage = ({ data }) => finish(() => {
      if ("error" in data) reject(new Error(data.error));
      else resolve(data.result);
    });
    worker.onerror = () => finish(() => reject(new Error("Не удалось запустить SQLite в браузере.")));
    worker.onmessageerror = () => finish(() => reject(new Error("Не удалось получить результат SQLite.")));
    try {
      worker.postMessage({ type, ...request });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
