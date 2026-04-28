import { useDisclosure } from "@heroui/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCodeExecution } from "../../../../hooks/useCodeExecution";
import { api } from "../../../../services/api";
import { Answer, Language, Task } from "../../../../types/task";

import { Socket } from "socket.io-client";
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
  const [isAutoHtmlTemplateActive, setIsAutoHtmlTemplateActive] =
    useState(false);
  const [isAutoBashTemplateActive, setIsAutoBashTemplateActive] =
    useState(false);
  const loaderTimeoutRef = useRef<number | null>(null);
  const roomStateAppliedRef = useRef<boolean>(false);
  const wasHtmlModeRef = useRef(false);
  const wasBashModeRef = useRef(false);
  const [editorWidth, setEditorWidth] = useState<number>(() => {
    const saved = localStorage.getItem("innoprog-editor-width");
    return saved ? parseFloat(saved) : 50;
  });

  const { onOpen, onOpenChange, isOpen, onClose } = useDisclosure();

  const taskId = searchParams.get("task_id") || null;
  const language = searchParams.get("lang") || "py";
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
        console.log("render");
        webSocketData?.sendEditMember?.(savedUsername);
      }
    }
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
    const loadTask = async () => {
      if (!taskId) return;

      try {
        const taskData = await api.getTask(taskId);
        setTask(taskData);
        if (taskData.answers && taskData.answers.length > 1) {
          setCurrentAnswer({
            ...taskData.answers[0],
          });
        }
      } catch (error) {
        console.error("Failed to load task:", error);
      }
    };

    loadTask();
  }, [taskId]);

  // Загрузка кода с приоритетами
  useEffect(() => {
    const loadCode = async () => {
      // Если есть roomId, ждем сначала загрузки из комнаты
      if (roomId && !roomCodeLoaded) {
        return;
      }

      // Если код уже загружен из комнаты, не перезаписываем его
      if (codeSource === "room") {
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
          if (data.code) {
            setCode(data.code);
            setCodeSource("api");
          }
        } catch (error) {
          console.error("Failed to load answer code:", error);
        }
      } else if (taskId && !answer_id && codeSource === "none") {
        setCode("");
        setCodeSource("api");
      }
    };

    loadCode();
  }, [taskId, answer_id, roomId, roomCodeLoaded, codeSource, userId]);

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
    if (!webSocketData) return undefined;

    console.log(webSocketData.isConnected);

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
    };
  }, [
    webSocketData?.isTeacher,
    telegramId,
    webSocketData?.sendSelection,
    webSocketData?.selections,
    webSocketData?.onSendUpdate,
    webSocketData?.updatesFromProps,
    webSocketData?.joinedCode,
    webSocketData?.isConnected,
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

  const handleResize = (newWidth: number) => {
    setEditorWidth(newWidth);
    localStorage.setItem("innoprog-editor-width", newWidth.toString());
  };

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

      <TaskDescription task={task} hideTopSpacing={isEmbeddedApp} />

      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col md:flex-row">
        <CodeEditorSection
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
          />

          {!isHtmlMode && (
            <Resizer
              onResize={handleResize}
              minSize={20}
              maxSize={80}
            />
          )}

          <OutputSection
            output={output}
            status={status}
            activeTab={activeTab}
            language={language}
            htmlPreview={htmlPreviewContent}
            width={100 - editorWidth}
          />
        </div>
      </main>

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
      />
    </div>
  );
});

export default IDE;
