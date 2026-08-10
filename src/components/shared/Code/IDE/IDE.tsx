import { useDisclosure } from "@heroui/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCodeExecution } from "../../../../hooks/useCodeExecution";
import { api } from "../../../../services/api";
import { Answer, Language, Task } from "../../../../types/task";
import { postToParent } from "../../../../utils/parentMessaging";
import { resolveTaskLanguage } from "../../../../utils/taskLanguage";

import { Socket } from "socket.io-client";
import type * as Y from "yjs";
import CodeEditorSection from "../CodeEditorSection/CodeEditorSection";
import Loader from "../../Room/Loader/Loader";
import OutputSection from "../OutputSection/OutputSection";
import StartFormModal from "../../Room/StartFormModal/StartFormModal";
import SubmitModal from "../SubmitModal/SubmitModal";
import TaskDescription from "../TaskDescription/TaskDescription";
import Header from "../../Header/Header";
import Footer from "../../Footer/Footer";
import Resizer from "../Resizer/Resizer";
import { CursorData, RoomMember } from "../../../../hooks/useWebSocket";
import "./IDE.css";

interface RoomPermissions {
  studentCursorEnabled: boolean;
  studentSelectionEnabled: boolean;
  studentEditCodeEnabled: boolean;
}

interface WebSocketData {
  socket: Socket | null;
  isConnected: boolean;
  isJoinedRoom: boolean;
  connectionError: string | null;
  roomMembers: RoomMember[];
  cursors: Map<string, CursorData>;
  completeSession: () => void;
  selections: Map<
    string,
    {
      line?: number;
      column?: number;
      selectionStart?: { line: number; column: number };
      selectionEnd?: { line: number; column: number };
      selectedText?: string;
      userColor: string;
    }
  >;
  myUserColor: string;
  roomPermissions: RoomPermissions;
  isTeacher?: boolean;
  sendCursorPosition: (position: [number, number]) => void;
  sendSelection: (selectionData: {
    line?: number;
    column?: number;
    selectionStart?: { line: number; column: number };
    selectionEnd?: { line: number; column: number };
    selectedText?: string;
  }) => void;
  onSendUpdate?: (update: Uint8Array) => void;
  updatesFromProps?: unknown[];
  sendEditMember: (username?: string) => void;
  sendRoomPermissions: (permissions: RoomPermissions) => void;
  completed: boolean;
  sendChangeLanguage: (language: Language) => void;
  language?: Language;
  joinedCode?: string;
  codeSyncState?:
    | "connecting"
    | "joined"
    | "synchronizing"
    | "synchronized"
    | "reconnecting"
    | "waiting-permission";
  hasPendingCodeChanges?: boolean;
  showSyncSuccess?: boolean;
  hasDurableStorageError?: boolean;
  isPersistRetrying?: boolean;
  isSessionReplaced?: boolean;
  isCodeQueueRestored?: boolean;
  bindYDoc?: (doc: Y.Doc | null) => void;
}

interface IDEProps {
  webSocketData?: WebSocketData;
  telegramId: string;
}

const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <style>
      body {
        font-family: sans-serif;
        padding: 24px;
      }
    </style>
  </head>
  <body>
    <h1>Привет, HTML!</h1>
    <p>Начните редактировать код слева.</p>
  </body>
</html>`;
const DEFAULT_BASH_TEMPLATE = "#!/bin/bash";

const IDE: React.FC<IDEProps> = React.memo(({ webSocketData, telegramId }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [task, setTask] = useState<Task | null>(null);
  const [code, setCode] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [runInputData, setRunInputData] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"editor" | "output">("editor");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [currentAnswer, setCurrentAnswer] = useState<Answer | null>(null);
  const [submitResult, setSubmitResult] = useState<
    "success" | "error" | "no_data"
  >("success");
  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [inputData, setInputData] = useState<string>("");
  const [outputData, setOutputData] = useState<string>("");
  const [isOutputData, setIsOutputData] = useState<boolean>(false);
  const [isInputData, setIsInputData] = useState<boolean>(true);
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [hasJoinedOnce, setHasJoinedOnce] = useState<boolean>(false);
  const [showBlockingLoader, setShowBlockingLoader] = useState<boolean>(true);
  const [taskDataReady, setTaskDataReady] = useState<boolean>(false);
  const [initialCodeReady, setInitialCodeReady] = useState<boolean>(false);
  const [isAutoHtmlTemplateActive, setIsAutoHtmlTemplateActive] =
    useState(false);
  const [isAutoBashTemplateActive, setIsAutoBashTemplateActive] =
    useState(false);
  const loaderTimeoutRef = useRef<number | null>(null);
  const roomStateAppliedRef = useRef<boolean>(false);
  const wasHtmlModeRef = useRef(false);
  const wasBashModeRef = useRef(false);
  const announcedReadyKeyRef = useRef("");
  const [editorWidth, setEditorWidth] = useState<number>(() => {
    const saved = localStorage.getItem("innoprog-editor-width");
    return saved ? parseFloat(saved) : 50;
  });
  const [taskPanelWidth, setTaskPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem("innoprog-task-panel-width");
    return saved ? parseFloat(saved) : 38;
  });
  const [desktopEditorHeight, setDesktopEditorHeight] = useState<number>(() => {
    const saved = localStorage.getItem("innoprog-task-editor-height");
    return saved ? parseFloat(saved) : 58;
  });

  const { onOpen, onOpenChange, isOpen, onClose } = useDisclosure();

  const taskId = searchParams.get("task_id") || null;
  const language = resolveTaskLanguage(taskId, searchParams.get("lang"));
  const answer_id = searchParams.get("answer_id");
  const roomId = searchParams.get("roomId");
  const isHtmlMode = language === Language.HTML;
  const isBashMode = language === Language.BASH;
  const telegramWebAppUserId = roomId
    ? null
    : window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString();
  const clientId =
      searchParams.get("telegramId") ||
      searchParams.get("client_id") ||
      telegramId ||
      telegramWebAppUserId ||
      localStorage.getItem("telegramId") ||
      "";
  const userId = Number.parseInt(clientId, 10) || 0;
  const platform = searchParams.get("platform");
  const platforma = searchParams.get("platforma");
  const isEmbeddedApp = useMemo(() => {
    const isAppPlatform = platform === "app" || platforma === "app";

    try {
      return isAppPlatform && window.self !== window.top;
    } catch {
      return isAppPlatform;
    }
  }, [platform, platforma]);

  const { isRunning, handleRunCode, onSendCheck, setCurrentCode } =
    useCodeExecution({
      currentAnswer,
      task,
      code,
      inputData,
      outputData,
      taskId,
      answer_id,
      clientId,
      language,
      setOutput,
      setRunInputData,
      setStatus,
      setActiveTab,
      setSubmitResult,
      onOpen,
      status,
      isInIframe: isEmbeddedApp,
      setSubmitMessage,
    });

  const onModalRunCode = useCallback(async () => {
    if (!task?.answers?.length || !taskId) {
      setSubmitResult("no_data");
      onOpen();
    } else {
      await handleRunCode();
    }
  }, [handleRunCode, onOpen, task?.answers?.length, taskId]);

  const runPrimaryAction = useCallback(async () => {
    if (isHtmlMode) {
      return;
    }

    if (isRunning || isOpen) {
      return;
    }

    if (status === "success" && taskId) {
      await onSendCheck();
      return;
    }

    await onModalRunCode();
  }, [isHtmlMode, isOpen, isRunning, onModalRunCode, onSendCheck, status, taskId]);

  useEffect(() => {
    const handleRunShortcut = (event: KeyboardEvent) => {
      const isRunShortcut =
        (event.ctrlKey || event.metaKey) && event.key === "Enter";

      if (!isRunShortcut || event.repeat || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      void runPrimaryAction();
    };

    window.addEventListener("keydown", handleRunShortcut);

    return () => {
      window.removeEventListener("keydown", handleRunShortcut);
    };
  }, [runPrimaryAction]);

  useEffect(() => {
    if (webSocketData?.language) {
      const language: Language = webSocketData.language;
      setSearchParams((prev: URLSearchParams): URLSearchParams => {
        prev.set("lang", language);

        return prev;
      });
    }
  }, [setSearchParams, webSocketData?.language]);

  useEffect(() => {
    if (webSocketData?.isJoinedRoom) {
      setHasJoinedOnce(true);
    }
  }, [webSocketData?.isJoinedRoom]);

  useEffect(() => {
    setHasJoinedOnce(false);
  }, [roomId]);

  useEffect(() => {
    if (loaderTimeoutRef.current) {
      window.clearTimeout(loaderTimeoutRef.current);
      loaderTimeoutRef.current = null;
    }

    if (roomId && !webSocketData?.isJoinedRoom) {
      setShowBlockingLoader(true);
      loaderTimeoutRef.current = window.setTimeout(() => {
        setShowBlockingLoader(false);
      }, 12000);
    } else {
      setShowBlockingLoader(false);
    }

    return () => {
      if (loaderTimeoutRef.current) {
        window.clearTimeout(loaderTimeoutRef.current);
        loaderTimeoutRef.current = null;
      }
    };
  }, [roomId, webSocketData?.isJoinedRoom]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    if (!webSocketData?.isConnected || !webSocketData?.isJoinedRoom) {
      return;
    }

    const savedUsername = localStorage.getItem("innoprog-username");

    const currentMember = webSocketData.roomMembers?.find(
      (member) => member.isYourself
    );

    if (
      !savedUsername &&
      (!currentMember?.username || currentMember.username.trim() === "")
    ) {
      setShowStartModal(true);
    } else {
      if (
        savedUsername &&
        (!currentMember?.username || currentMember.username.trim() === "")
      ) {
        webSocketData?.sendEditMember?.(savedUsername);
      }
    }
  // The hook intentionally reacts only to connection identity changes. Member
  // collections/callbacks are consumed from the current socket facade.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    webSocketData?.isConnected,
    webSocketData?.isJoinedRoom,
    roomId,
    telegramId,
  ]);

  const [codeSource, setCodeSource] = useState<"none" | "api" | "room">("none");
  const [roomCodeLoaded, setRoomCodeLoaded] = useState(false);

  const extractEditableRoomCode = useCallback(
    (roomCode: string) => {
      let editableCode = roomCode;

      if (task?.answers?.[0]) {
        const codeBefore = task.answers[0].code_before || "";
        const codeAfter = task.answers[0].code_after || "";

        if (codeBefore && roomCode.startsWith(codeBefore)) {
          editableCode = roomCode.slice(codeBefore.length);
          if (codeAfter && editableCode.endsWith(codeAfter)) {
            editableCode = editableCode.slice(0, -codeAfter.length);
          }
        }
      }

      return editableCode;
    },
    [task]
  );

  useEffect(() => {
    roomStateAppliedRef.current = false;
    setCodeSource("none");
    setRoomCodeLoaded(!roomId);
  }, [roomId]);

  useEffect(() => {
    let active = true;

    const loadTask = async () => {
      setTaskDataReady(!taskId);
      setTask(null);
      setCurrentAnswer(null);
      if (!taskId) return;

      try {
        const taskData = await api.getTask(taskId, clientId);
        if (!active) return;
        setTask(taskData);
        if (taskData.answers && taskData.answers.length > 0) {
          setCurrentAnswer({
            ...taskData.answers[0],
          });
        }
        setTaskDataReady(true);
      } catch (error) {
        if (!active) return;
        console.error("Failed to load task");
        setTaskDataReady(false);
        if (isEmbeddedApp) {
          postToParent({
            source: "innoprog-ide",
            type: "ide-load-error",
            event: "task-load-failed",
            taskId: Number(taskId),
            ready: false,
          });
        }
      }
    };

    loadTask();

    return () => {
      active = false;
    };
  }, [clientId, isEmbeddedApp, taskId]);

  useEffect(() => {
    setInitialCodeReady(!taskId);
  }, [answer_id, roomId, taskId]);

  // Загрузка кода с приоритетами
  useEffect(() => {
    let active = true;

    const loadCode = async () => {
      // The task response carries the starter file for file-based completion
      // tasks, so wait for it before deciding what an empty saved answer means.
      if (taskId && !taskDataReady) {
        return;
      }

      // Если есть roomId, ждем сначала загрузки из комнаты
      if (roomId && !roomCodeLoaded) {
        return;
      }

      // Если код уже загружен из комнаты, не перезаписываем его
      if (codeSource === "room") {
        if (active) setInitialCodeReady(true);
        return;
      }

      if (codeSource === "api") {
        if (active) setInitialCodeReady(true);
        return;
      }

      // Загружаем код из API
      if (taskId && answer_id) {
        try {
          const data = await api.getSubmitCode(
            answer_id,
            userId,
            Number(taskId)
          );

          // Проверяем, что код из комнаты не был загружен между запросом и ответом
          if (active) {
            const hasSavedCode = data.has_saved_code === true
              || (typeof data.has_saved_code !== "boolean" && Boolean(data.code));
            const initialCode = typeof task?.initial_code === "string"
              ? task.initial_code
              : "";
            setCode(hasSavedCode ? data.code : (initialCode ? "" : (data.code || "")));
            setCodeSource("api");
          }
        } catch (error) {
          console.error("Failed to load answer code");
        } finally {
          if (active) setInitialCodeReady(true);
        }
      } else if (taskId && !answer_id && codeSource === "none") {
        setCode("");
        setCodeSource("api");
        if (active) setInitialCodeReady(true);
      } else if (!taskId) {
        if (active) setInitialCodeReady(true);
      }
    };

    loadCode();

    return () => {
      active = false;
    };
  }, [
    taskId,
    answer_id,
    roomId,
    roomCodeLoaded,
    codeSource,
    userId,
    taskDataReady,
    task?.initial_code,
  ]);

  useEffect(() => {
    if (!isEmbeddedApp) {
      return;
    }

    const readyTaskId = taskId ? Number(taskId) : null;
    if (
      taskId &&
      (!taskDataReady ||
        !initialCodeReady ||
        !task ||
        Number(task.id) !== readyTaskId)
    ) {
      return;
    }

    const readyKey = `${readyTaskId ?? "standalone"}:${answer_id || ""}:${language}`;
    if (announcedReadyKeyRef.current === readyKey) {
      return;
    }
    announcedReadyKeyRef.current = readyKey;

    postToParent({
      source: "innoprog-ide",
      type: "ide-ready",
      event: "task-rendered",
      taskId: readyTaskId,
      language,
      ready: true,
    });
  }, [
    answer_id,
    initialCodeReady,
    isEmbeddedApp,
    language,
    task,
    taskDataReady,
    taskId,
  ]);

  useEffect(() => {
    const handleRoomStateLoaded = (event: CustomEvent) => {
      if (roomStateAppliedRef.current) {
        return;
      }
      roomStateAppliedRef.current = true;

      const { lastCode } = event.detail;

      if (typeof lastCode === "string") {
        setCode(extractEditableRoomCode(lastCode));
        setCodeSource("room");
      }
      setRoomCodeLoaded(true);
    };

    window.addEventListener(
      "roomStateLoaded",
      handleRoomStateLoaded as EventListener
    );

    return () => {
      window.removeEventListener(
        "roomStateLoaded",
        handleRoomStateLoaded as EventListener
      );
    };
  }, [extractEditableRoomCode]);

  useEffect(() => {
    if (!roomId || roomStateAppliedRef.current) {
      return;
    }

    if (typeof webSocketData?.joinedCode !== "string") {
      return;
    }

    roomStateAppliedRef.current = true;
    setCode(extractEditableRoomCode(webSocketData.joinedCode));
    setCodeSource("room");
    setRoomCodeLoaded(true);
  }, [roomId, webSocketData?.joinedCode, extractEditableRoomCode]);

  useEffect(() => {
    if (!roomId || roomStateAppliedRef.current) {
      return;
    }

    if (!webSocketData?.isJoinedRoom) {
      return;
    }

    if (typeof webSocketData?.joinedCode === "string") {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (!roomStateAppliedRef.current) {
        setRoomCodeLoaded(true);
      }
    }, 2500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [roomId, webSocketData?.isJoinedRoom, webSocketData?.joinedCode]);

  const handleLanguageChange = useCallback(
    (lang: Language) => {
      setSearchParams((prev) => {
        prev.set("lang", lang);
        return prev;
      });
      if (webSocketData) {
        webSocketData.sendChangeLanguage(lang);
      }
    },
    [setSearchParams, webSocketData]
  );

  const memoizedWebSocketData = useMemo(() => {
    if (!roomId || !webSocketData) return undefined;

    return {
      sendSelection: webSocketData.sendSelection,
      selections: webSocketData.selections,
      onSendUpdate: webSocketData.onSendUpdate,
      updatesFromProps: webSocketData.updatesFromProps,
      myTelegramId: telegramId,
      completed: webSocketData.completed,
      roomPermissions: webSocketData.roomPermissions,
      isTeacher: webSocketData.isTeacher,
      joinedCode: webSocketData.joinedCode,
      isConnected: webSocketData.isConnected,
      isJoinedRoom: webSocketData.isJoinedRoom,
      isSessionReplaced: webSocketData.isSessionReplaced,
      isCodeQueueRestored: webSocketData.isCodeQueueRestored,
      onYDocReady: webSocketData.bindYDoc,
    };
  // Keep the memo keyed by the fields passed to the editor. The socket facade
  // also exposes volatile members that must not invalidate this value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    webSocketData?.isTeacher,
    telegramId,
    webSocketData?.sendSelection,
    webSocketData?.selections,
    webSocketData?.onSendUpdate,
    webSocketData?.updatesFromProps,
    webSocketData?.joinedCode,
    webSocketData?.isConnected,
    webSocketData?.isJoinedRoom,
    webSocketData?.isSessionReplaced,
    webSocketData?.isCodeQueueRestored,
    webSocketData?.bindYDoc,
    searchParams,
  ]);

  const {
    isOpen: startFormIsOpen,
    onOpen: startFormOnOpen,
    onOpenChange: startFormOnOpenChange,
  } = useDisclosure();

  useEffect(() => {
    const savedUsername = localStorage.getItem("innoprog-username");
    if (!savedUsername) {
      startFormOnOpen();
    }
  }, [startFormOnOpen]);

  const handleResize = useCallback((newWidth: number) => {
    setEditorWidth(newWidth);
    localStorage.setItem("innoprog-editor-width", newWidth.toString());
  }, []);

  const handleTaskPanelResize = useCallback((newWidth: number) => {
    setTaskPanelWidth(newWidth);
    localStorage.setItem("innoprog-task-panel-width", newWidth.toString());
  }, []);

  const handleDesktopEditorResize = useCallback((newHeight: number) => {
    setDesktopEditorHeight(newHeight);
    localStorage.setItem("innoprog-task-editor-height", newHeight.toString());
  }, []);

  useEffect(() => {
    const wasHtmlMode = wasHtmlModeRef.current;

    if (isHtmlMode && !taskId && !wasHtmlMode && code.trim().length === 0) {
      setCode(DEFAULT_HTML_TEMPLATE);
      setIsAutoHtmlTemplateActive(true);
    } else if (isHtmlMode && !taskId && !wasHtmlMode) {
      setIsAutoHtmlTemplateActive(false);
    } else if (!isHtmlMode || taskId) {
      setIsAutoHtmlTemplateActive(false);
    }

    wasHtmlModeRef.current = isHtmlMode;
  }, [code, isHtmlMode, taskId]);

  useEffect(() => {
    const wasBashMode = wasBashModeRef.current;

    if (isBashMode && !taskId && !wasBashMode && code.trim().length === 0) {
      setCode(DEFAULT_BASH_TEMPLATE);
      setIsAutoBashTemplateActive(true);
    } else if (isBashMode && !taskId && !wasBashMode) {
      setIsAutoBashTemplateActive(false);
    } else if (!isBashMode || taskId) {
      setIsAutoBashTemplateActive(false);
    }

    wasBashModeRef.current = isBashMode;
  }, [code, isBashMode, taskId]);

  const handleCodeChange = useCallback(
    (nextCode: string) => {
      if (isHtmlMode && !taskId && isAutoHtmlTemplateActive) {
        setIsAutoHtmlTemplateActive(false);
      }

      if (isBashMode && !taskId && isAutoBashTemplateActive) {
        setIsAutoBashTemplateActive(false);
      }

      setCode(nextCode);
    },
    [isAutoBashTemplateActive, isAutoHtmlTemplateActive, isBashMode, isHtmlMode, taskId]
  );

  const htmlPreviewContent = useMemo(() => {
    if (!isHtmlMode) {
      return "";
    }

    if (code.trim().length > 0) {
      return code;
    }

    return isAutoHtmlTemplateActive ? DEFAULT_HTML_TEMPLATE : "";
  }, [code, isAutoHtmlTemplateActive, isHtmlMode]);
  const desktopTaskMode = Boolean(taskId && task && !isHtmlMode);

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col bg-ide-background text-ide-text-primary overflow-hidden">
      {roomId &&
        !hasJoinedOnce &&
        showBlockingLoader &&
        (!webSocketData?.isConnected || !webSocketData?.isJoinedRoom) && (
          <Loader
            message={
              webSocketData?.connectionError
                ? webSocketData.connectionError
                : !webSocketData?.isConnected
                ? "Подключение к серверу..."
                : "Присоединение к комнате..."
            }
            isError={Boolean(webSocketData?.connectionError ?? false)}
          />
        )}

      <SubmitModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onClose={onClose}
        submitResult={submitResult}
        submitMessage={submitMessage}
        isRunning={isRunning}
        inputData={inputData}
        setInputData={setInputData}
        outputData={outputData}
        setOutputData={setOutputData}
        isInputData={isInputData}
        setIsInputData={setIsInputData}
        isOutputData={isOutputData}
        setIsOutputData={setIsOutputData}
        onApply={handleRunCode}
      />

      {roomId &&
        webSocketData?.isConnected &&
        webSocketData?.isJoinedRoom &&
        showStartModal && (
          <StartFormModal
            onOpen={startFormOnOpen}
            isOpen={startFormIsOpen}
            onOpenChange={startFormOnOpenChange}
            onSendForm={(username?: string) =>
              webSocketData.sendEditMember(username)
            }
          />
        )}

      {!isEmbeddedApp && (
        <Header
          completedSession={webSocketData?.completed}
          onCompleteSession={webSocketData?.completeSession}
          members={webSocketData?.roomMembers}
          onEditMember={webSocketData?.sendEditMember}
          myTelegramId={telegramId}
          roomPermissions={webSocketData?.roomPermissions}
          isTeacher={webSocketData?.isTeacher || false}
          onPermissionsChange={webSocketData?.sendRoomPermissions}
          roomId={roomId}
        />
      )}

      <div
        className={`flex-1 min-h-0 overflow-hidden ${
          desktopTaskMode ? "flex flex-col md:flex-row" : "flex flex-col"
        }`}
        data-testid={desktopTaskMode ? "desktop-task-workspace" : undefined}
      >
        <TaskDescription
          task={task}
          hideTopSpacing={isEmbeddedApp}
          desktopSidebar={desktopTaskMode}
          desktopWidth={taskPanelWidth}
        />

        {desktopTaskMode && (
          <Resizer
            onResize={handleTaskPanelResize}
            minSize={25}
            maxSize={60}
          />
        )}

        <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
          <div
            className={`h-full flex flex-col ${
              desktopTaskMode ? "" : "md:flex-row"
            }`}
          >
            <CodeEditorSection
              key={roomId || "standalone"}
              code={code}
              setCode={handleCodeChange}
              language={language}
              currentAnswer={currentAnswer}
              task={task}
              setCurrentCode={setCurrentCode}
              activeTab={activeTab}
              webSocketData={memoizedWebSocketData}
              handleLanguageChange={handleLanguageChange}
              width={editorWidth}
              desktopStackedPane={desktopTaskMode}
              desktopPaneSize={
                desktopTaskMode && activeTab === "output"
                  ? desktopEditorHeight
                  : 100
              }
              collaborativeCodeSeed={
                roomId && isAutoHtmlTemplateActive
                  ? DEFAULT_HTML_TEMPLATE
                  : undefined
              }
              canInitializeCollaborativeCode={Boolean(
                webSocketData?.isTeacher && !webSocketData?.isSessionReplaced
              )}
            />

            {desktopTaskMode && activeTab === "output" ? (
              <Resizer
                onResize={handleDesktopEditorResize}
                minSize={30}
                maxSize={75}
                orientation="horizontal"
              />
            ) : !desktopTaskMode ? (
              <Resizer
                onResize={handleResize}
                minSize={20}
                maxSize={80}
              />
            ) : null}

            <OutputSection
              output={output}
              inputData={runInputData}
              status={status}
              activeTab={activeTab}
              language={language}
              htmlPreview={htmlPreviewContent}
              width={100 - editorWidth}
              desktopStackedPane={desktopTaskMode}
            />
          </div>
        </main>
      </div>

      <Footer
        status={status}
        taskId={taskId}
        isRunning={isRunning}
        activeTab={activeTab}
        language={language}
        onRunCode={onModalRunCode}
        onSubmitCheck={onSendCheck}
        setActiveTab={setActiveTab}
        setStatus={setStatus}
        desktopTaskMode={desktopTaskMode}
      />
    </div>
  );
});

export default IDE;
