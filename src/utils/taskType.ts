import { Task, TaskType } from "../types/task";

export const getTaskType = (task: Task | null | undefined): TaskType => {
  const rawTaskType = (task?.task_type || task?.type) as string | undefined;

  if (rawTaskType === "paste" || rawTaskType === "Дополнение кода") {
    return "paste";
  }

  return "code";
};
