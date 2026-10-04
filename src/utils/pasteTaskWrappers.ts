import { Answer, Task } from "../types/task";
import { getTaskType } from "./taskType";

export function pasteTaskWrappers(task: Task | null, answer?: Answer | null) {
  const selected = answer ?? task?.answers?.[0];
  const isPaste = getTaskType(task) === "paste";
  const showExample = isPaste && (task?.has_public_example ?? (task?.has_multiple_tests !== false));
  const starter = isPaste && typeof task?.initial_code === "string" ? task.initial_code : "";
  const before = showExample ? selected?.code_before || "" : starter;
  const after = showExample ? selected?.code_after || "" : "";
  const padSingleExample = task?.has_public_example === true && task?.has_multiple_tests === false;
  return {
    before: before ? `${before}${padSingleExample || !showExample ? "\n\n" : ""}` : "",
    after: after ? `${padSingleExample ? "\n\n" : ""}${after}\n\n` : "",
  };
}

export function extractPasteRoomCode(source: string, task: Task | null): string {
  const { before, after } = pasteTaskWrappers(task);
  if ((before || after) && source.startsWith(before) && source.endsWith(after)) {
    return source.slice(before.length, source.length - after.length);
  }
  // Older room documents used raw wrappers without the editor's padding.
  const rawBefore = task?.answers?.[0]?.code_before || "";
  const rawAfter = task?.answers?.[0]?.code_after || "";
  for (const legacyAfter of [rawAfter ? `${rawAfter}\n\n` : "", rawAfter]) {
    if ((rawBefore || legacyAfter) && source.startsWith(rawBefore) && source.endsWith(legacyAfter)) {
      return source.slice(rawBefore.length, source.length - legacyAfter.length);
    }
  }
  return source;
}

export function missingWrapperInsertions(source: string, before: string, after: string) {
  const insertions: { index: number; text: string }[] = [];
  if (after && !source.endsWith(after)) {
    const core = after.trim();
    const trailing = after.slice(after.indexOf(core) + core.length);
    const existing = core && source.endsWith(core + trailing) ? core + trailing : core;
    if (core && source.endsWith(existing)) {
      const leading = after.slice(0, after.indexOf(core));
      if (existing === core && trailing) insertions.push({ index: source.length, text: trailing });
      if (leading) insertions.push({ index: source.length - existing.length, text: leading });
    } else {
      insertions.push({ index: source.length, text: after });
    }
  }
  if (before && !source.startsWith(before)) {
    const core = before.trimEnd();
    insertions.push(source.startsWith(core)
      ? { index: core.length, text: before.slice(core.length) }
      : { index: 0, text: before });
  }
  // Apply from the end so each position still addresses the original text.
  return insertions.sort((left, right) => right.index - left.index);
}
