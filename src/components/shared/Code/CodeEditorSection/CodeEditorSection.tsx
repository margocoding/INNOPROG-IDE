import React, { Dispatch, SetStateAction } from "react";
import { Answer, Language, Task } from "../../../../types/task";
import { getTaskType } from "../../../../utils/taskType";
import CodeEditor from "../CodeEditor/CodeEditor";

interface CodeEditorSectionProps {
  code: string;
  setCode: (code: string) => void;
  language: string;
  currentAnswer: Answer | null;
  task: Task | null;
  activeTab: string;
  setCurrentCode: Dispatch<SetStateAction<string>>;
  width?: number;
  desktopSinglePane?: boolean;
  webSocketData?: {
    isTeacher?: boolean;
    isConnected?: boolean;
    roomPermissions: {
      studentEditCodeEnabled: boolean;
    };
    sendSelection: (selectionData: {
      line?: number;
      column?: number;
      selectionStart?: { line: number; column: number };
      selectionEnd?: { line: number; column: number };
      selectedText?: string;
    }) => void;
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
    onSendUpdate?: (update: Uint8Array) => void;
    updatesFromProps?: unknown[];
    joinedCode?: string;
    myTelegramId: string;
    completed: boolean;
  };
  handleLanguageChange: (language: Language) => void;
}

const CodeEditorSection: React.FC<CodeEditorSectionProps> = React.memo(
  ({
    code,
    setCode,
    language,
    currentAnswer,
    task,
    activeTab,
    webSocketData,
    handleLanguageChange,
    setCurrentCode,
    width = 50,
    desktopSinglePane = false,
  }) => {
    const selectedAnswer = currentAnswer ?? task?.answers?.[0] ?? null;
    const hasMultipleAnswers = (task?.answers?.length || 0) > 1;
    const visualCodeBefore = hasMultipleAnswers
      ? selectedAnswer?.code_before || ""
      : "";
    const visualCodeAfter = hasMultipleAnswers && selectedAnswer?.code_after
      ? `${selectedAnswer.code_after}\n\n`
      : "";

    return (
      <div
        className={`h-full min-w-0 p-4 ${
          activeTab === "editor"
            ? "block"
            : desktopSinglePane
            ? "hidden"
            : "hidden md:block"
        }`}
        style={
          desktopSinglePane || activeTab === "editor"
            ? { width: "100%" }
            : { flex: `0 0 ${width}%`, minWidth: 0 }
        }
      >
        <CodeEditor
          value={code}
          onChange={setCode}
          language={language}
          codeBefore={visualCodeBefore}
          codeAfter={visualCodeAfter}
          setCurrentCode={setCurrentCode}
          handleLanguageChange={handleLanguageChange}
          disabled={
            !(
              Boolean(
                webSocketData?.roomPermissions.studentEditCodeEnabled ||
                  webSocketData?.completed
              ) || Boolean(webSocketData?.isTeacher)
            )
          }
          readOnly={
            getTaskType(task) === "paste" && (task?.answers?.length || 0) > 1
              ? !selectedAnswer
              : false
          }
          sendSelection={webSocketData?.sendSelection}
          selections={webSocketData?.selections}
          onSendUpdate={webSocketData?.onSendUpdate}
          updatesFromProps={webSocketData?.updatesFromProps}
          joinedCode={webSocketData?.joinedCode}
          myTelegramId={webSocketData?.myTelegramId}
          isTeacher={webSocketData?.isTeacher}
          isWebSocket={!!webSocketData?.isConnected}
        />
      </div>
    );
  }
);

export default CodeEditorSection;
