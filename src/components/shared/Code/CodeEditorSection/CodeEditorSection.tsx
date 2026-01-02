import React, { Dispatch, SetStateAction } from "react";
import { Answer, Language, Task } from "../../../../types/task";
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
    updatesFromProps?: Uint8Array[];
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
  }) => {
    console.log(webSocketData?.isConnected);

    return (
      <div
        className={`h-full p-4 ${
          activeTab === "editor" ? "block" : "hidden md:block"
        }`}
        style={
          activeTab === "editor"
            ? { width: "100%" }
            : { flex: `0 0 ${width}%`, minWidth: 0 }
        }
      >
        <CodeEditor
          value={code}
          onChange={setCode}
          language={language}
          codeBefore={currentAnswer?.code_before || ""}
          codeAfter={currentAnswer?.code_after || ""}
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
            task?.type === "Дополнение кода" && task.answers!.length > 1
              ? !currentAnswer
              : false
          }
          sendSelection={webSocketData?.sendSelection}
          selections={webSocketData?.selections}
          onSendUpdate={webSocketData?.onSendUpdate}
          updatesFromProps={webSocketData?.updatesFromProps}
          myTelegramId={webSocketData?.myTelegramId}
          isTeacher={webSocketData?.isTeacher}
          isWebSocket={!!webSocketData?.isConnected}
        />
      </div>
    );
  }
);

export default CodeEditorSection;
