const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

export function taskCodeDraftKey(userId: number, taskId: string | null) {
  return userId && taskId ? `innoprog:ide-draft:${userId}:${taskId}` : null;
}

export function readTaskCodeDraft(key: string | null): string | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const draft = JSON.parse(raw);
    if (typeof draft?.code === "string" && draft.expiresAt > Date.now()) {
      return draft.code;
    }
    sessionStorage.removeItem(key);
  } catch {
    // The editor still works when browser storage is unavailable.
  }
  return null;
}

export function writeTaskCodeDraft(key: string | null, code: string) {
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ code, expiresAt: Date.now() + DRAFT_TTL_MS }));
  } catch {
    // Storage failure must never interrupt an edit.
  }
}

export function clearSubmittedTaskCodeDraft(key: string | null, submittedCode: string) {
  // The learner may have typed a newer draft while the check was running.
  if (!key || readTaskCodeDraft(key) !== submittedCode) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Browser storage can be unavailable.
  }
}
