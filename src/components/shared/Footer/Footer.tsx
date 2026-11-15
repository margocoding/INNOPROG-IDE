import React, { useRef, useState } from "react";
import { Button } from "@heroui/react";
import "./Footer.css";
import { isDesktop } from "../../../utils/platform";

interface FooterProps {
  hideRetry?: boolean;
  runModeSelector?: React.ReactNode;
  status: "idle" | "success" | "error";
  taskId: string | null;
  isRunning: boolean;
  checkProgress?: { completed: number; total: number } | null;
  blockedReason?: string;
  activeTab: "editor" | "output";
  language?: string;
  onRunCode: () => Promise<void>;
  onSubmitCheck: () => Promise<void>;
  setActiveTab: (tab: "editor" | "output") => void;
  setStatus: (status: "idle" | "success" | "error") => void;
  desktopTaskMode?: boolean;
  compactEmbedded?: boolean;
  submitOnly?: boolean;
  onPrimaryAction?: () => Promise<void>;
}

const Footer: React.FC<FooterProps> = ({
  hideRetry = false,
  runModeSelector,
  status,
  taskId,
  isRunning,
  checkProgress,
  blockedReason,
  activeTab,
  language,
  onRunCode,
  onSubmitCheck,
  setActiveTab,
  setStatus,
  desktopTaskMode = false,
  compactEmbedded = false,
  submitOnly = false,
  onPrimaryAction,
}) => {
  const actionPendingRef = useRef(false);
  const [actionPending, setActionPending] = useState(false);
  const busy = isRunning || actionPending;
  const isHtmlMode = language === "html";
  const isSubmitOnlyMode = isHtmlMode || submitOnly;
  const hasTask = Boolean(taskId);
  const primaryColor = isSubmitOnlyMode || (status === "success" && taskId) ? "secondary" : "success";

  const handleButtonClick = async () => {
    if (isRunning || blockedReason || actionPendingRef.current) return;

    actionPendingRef.current = true;
    setActionPending(true);
    try {
      if (onPrimaryAction) {
        await onPrimaryAction();
        return;
      }

      if (isSubmitOnlyMode && hasTask) {
        await onSubmitCheck();
        return;
      }

      if (status === "success" && taskId) {
        await onSubmitCheck();
      } else {
        await onRunCode();
      }
    } finally {
      actionPendingRef.current = false;
      setActionPending(false);
    }
  };

  if (isSubmitOnlyMode && !hasTask) {
    return null;
  }

  return (
    <footer
      className={`ide-footer ${runModeSelector ? "ide-footer--modes" : ""} ${compactEmbedded ? "ide-footer--compact" : ""} bg-ide-secondary border-t border-ide-border flex-none ${
        !isDesktop() ? "pb-[env(safe-area-inset-bottom)]" : ""
      }`}
    >
      <div
        className={`container mx-auto px-4 py-3 md:py-4 flex items-center flex-col gap-3 ${
          desktopTaskMode ? "md:flex-row" : "lg:flex-row"
        }`}
      >
        <div className={`flex w-full items-center gap-3 ${desktopTaskMode ? "md:w-auto" : "lg:w-auto"}`}>
        {runModeSelector}
        <div className={runModeSelector ? "ide-footer-primary-frame" : "contents"}>
        <Button
          onPress={handleButtonClick}
          disabled={busy || Boolean(blockedReason)}
          aria-busy={busy}
          color={primaryColor}
          className={`ide-footer-primary w-full text-white ${
            desktopTaskMode ? "md:w-auto" : "lg:w-auto"
          }`}
        >
            {busy ? <span className="ide-output-spinner ide-footer-run-spinner shrink-0" aria-hidden="true" /> : <svg
              aria-hidden="true"
              className="ide-footer-run-icon w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>}
          {blockedReason || (isSubmitOnlyMode
            ? "Отправить решение"
            : status === "success" && taskId
            ? desktopTaskMode
              ? (
                <>
                  <span className="hidden md:inline">Отправить</span>
                  <span className="md:hidden">Отправить на проверку</span>
                </>
              )
              : "Отправить на проверку"
            : "Выполнить")}
        </Button>
        </div>
        {isRunning && checkProgress && (
          <span role="status" aria-live="polite" className="shrink-0 whitespace-nowrap text-sm text-default-600">
            Проверено {checkProgress.completed} из {checkProgress.total}
          </span>
        )}
        </div>
        {!hideRetry && !isSubmitOnlyMode && activeTab === "output" && (
          <div className="w-full md:hidden">
            <Button
              disabled={isRunning}
              onPress={() => {
                setActiveTab("editor");
                setStatus("idle");
              }}
              color="danger"
              className="ide-footer-retry w-full text-white"
            >
              <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11a8 8 0 1 1 2 6M4 5v6h6" />
              </svg>
              Попробовать снова
            </Button>
          </div>
        )}
      </div>
    </footer>
  );
};

export default Footer;
