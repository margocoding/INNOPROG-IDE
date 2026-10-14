import type { TaskAnswerCheckResult } from "../types/task";
export type TaskCheckProgress = { completed: number; total: number };

/** XHR progress is cumulative and can split a JSON line anywhere. */
export function taskCheckProgressDecoder(onProgress: (value: TaskCheckProgress) => void) {
  let consumed = 0;
  let completed = -1;
  let total: number | undefined;
  let result: TaskAnswerCheckResult | undefined;
  let protocolError: Error | undefined;
  const consume = (text: string) => {
    if (protocolError) return;
    try {
      let end: number;
      while ((end = text.indexOf("\n", consumed)) >= 0) {
        const line = text.slice(consumed, end);
        consumed = end + 1;
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (result) throw new Error("Данные после результата проверки");
        if (event.type === "progress") {
          if (!Number.isInteger(event.completed) || !Number.isInteger(event.total) ||
              event.total < 0 || event.total > 10000 || event.completed < 0 ||
              event.completed > event.total || event.completed < completed ||
              (total !== undefined && total !== event.total)) {
            throw new Error("Некорректный прогресс проверки");
          }
          completed = event.completed;
          total = event.total;
          onProgress({ completed, total: event.total });
        } else if (event.type === "result" && typeof event.data?.result === "boolean" &&
                   typeof event.data?.message === "string" && Number.isInteger(event.status)) {
          result = { ...event.data, status: event.status };
        } else {
          throw new Error("Некорректный ответ проверки");
        }
      }
    } catch (error) { protocolError = error instanceof Error ? error : new Error(String(error)); }
  };
  return {
    consume,
    finish(text: string, status: number) {
      try {
        const ordinary = JSON.parse(text);
        if (typeof ordinary.result === 'boolean' && typeof ordinary.message === 'string') {
          return { ...ordinary, status };
        }
      } catch { /* The incremental protocol contains multiple JSON documents. */ }
      consume(text);
      if (protocolError) throw protocolError;
      if (result) return result;
      // Authentication/access errors may be ordinary JSON before streaming starts.
      if (consumed === 0) return { ...JSON.parse(text), status };
      throw new Error("Проверка прервалась до получения результата");
    },
  };
}
