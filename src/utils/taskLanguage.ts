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

export const resolveConfigurationTaskLanguage = (
  taskId: string | null
): Language | null => {
  const numericTaskId = Number(taskId);
  if (!Number.isInteger(numericTaskId)) return null;
  if (numericTaskId >= 360145 && numericTaskId <= 360155) {
    return Language.DOCKERFILE;
  }
  if (numericTaskId >= 360156 && numericTaskId <= 360168) {
    return Language.YAML;
  }
  return null;
};

export const resolveTaskLanguage = (
  taskId: string | null,
  requestedLanguage: string | null
): string => {
  // Configuration tasks have a fixed file format. A stale launcher query
  // parameter must not turn their contents into executable code.
  const configurationLanguage = resolveConfigurationTaskLanguage(taskId);
  if (configurationLanguage) {
    return configurationLanguage;
  }

  const normalizedLanguage = requestedLanguage?.trim();
  if (normalizedLanguage) {
    return normalizedLanguage;
  }

  return isJavaTask(taskId) ? Language.JAVA : Language.PY;
};
