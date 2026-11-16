import { api } from "./api";
import { resolveParentOrigin } from "../utils/parentMessaging";

let prefetchedTask: {
  taskId: string;
  clientId: string;
  response: ReturnType<typeof api.getTask>;
} | undefined;
let prefetchedCode: {
  taskId: number;
  userId: number;
  answerId: string;
  response: ReturnType<typeof api.getSubmitCode>;
} | undefined;
let taskLoadStarted = false;

export function prefetchEmbeddedTask(): void {
  if (taskLoadStarted || window.self === window.top) return;
  const params = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  const taskId = params.get("task_id");
  const clientId = params.get("client_id");
  const answerId = params.get("answer_id")?.trim();
  const parentOrigin = resolveParentOrigin();
  if (!taskId || !/^\d+$/.test(taskId) || !clientId || !/^-?\d+$/.test(clientId) ||
      params.get("roomId") || params.get("telegramId") ||
      (params.get("platform") !== "app" && params.get("platforma") !== "app") ||
      !fragment.get("launch_code") || fragment.get("target_service") !== "ide" ||
      !parentOrigin || (document.referrer !== parentOrigin && !document.referrer.startsWith(parentOrigin + "/"))) return;

  taskLoadStarted = true;
  const response = api.getTask(taskId, clientId, true);
  void response.catch(() => {});
  prefetchedTask = { taskId, clientId, response };
  if (answerId) {
    const response = api.getSubmitCode(answerId, Number(clientId), Number(taskId));
    void response.catch(() => {});
    prefetchedCode = { taskId: Number(taskId), userId: Number(clientId), answerId, response };
  }
}

export function getInitialTask(taskId: string, clientId: string, cabinet: boolean) {
  taskLoadStarted = true;
  const startup = prefetchedTask;
  prefetchedTask = undefined;
  if (cabinet && startup?.taskId === taskId && startup.clientId === clientId) {
    return startup.response;
  }
  return cabinet ? api.getTask(taskId, clientId, true) : api.getTask(taskId, clientId);
}

export function getInitialCode(answerId: string, userId: number, taskId: number) {
  const startup = prefetchedCode;
  prefetchedCode = undefined;
  if (startup?.answerId === answerId && startup.userId === userId && startup.taskId === taskId) {
    return startup.response;
  }
  return api.getSubmitCode(answerId, userId, taskId);
}
