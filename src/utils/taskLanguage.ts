import { Language } from "../types/task";

const isJavaTask = (taskId: string | null): boolean => {
  if (!taskId) {
    return false;
  }

  const numericTaskId = Number(taskId);
  return (
    Number.isInteger(numericTaskId) &&
    ((numericTaskId >= 230000 && numericTaskId < 231000) ||
      (numericTaskId >= 330000 && numericTaskId < 331000))
  );
};

export const resolveTaskLanguage = (
  taskId: string | null,
  requestedLanguage: string | null
): string => {
  const normalizedLanguage = requestedLanguage?.trim();
  if (normalizedLanguage) {
    return normalizedLanguage;
  }

  return isJavaTask(taskId) ? Language.JAVA : Language.PY;
};
