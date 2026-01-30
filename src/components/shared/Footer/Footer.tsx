import React from "react";
import { Button } from "@heroui/react";
import { isDesktop } from "../../..";

interface FooterProps {
  status: "idle" | "success" | "error";
  taskId: string | null;
  isRunning: boolean;
  activeTab: "editor" | "output";
  onRunCode: () => Promise<void>;
  onSubmitCheck: () => Promise<void>;
  setActiveTab: (tab: "editor" | "output") => void;
  setStatus: (status: "idle" | "success" | "error") => void;
}

const Footer: React.FC<FooterProps> = ({
  status,
  taskId,
  isRunning,
  activeTab,
  onRunCode,
  onSubmitCheck,
  setActiveTab,
  setStatus,
}) => {
  const handleButtonClick = async () => {
    if (status === "success" && taskId) {
      await onSubmitCheck();
    } else {
      await onRunCode();
    }
  };

  return (
    <footer
      className={`bg-ide-secondary border-t border-ide-border flex-none ${
        !isDesktop() ? "pb-[env(safe-area-inset-bottom)]" : ""
      }`}
    >
      <div className="container mx-auto px-4 py-3 md:py-4 flex items-center lg:flex-row flex-col gap-3 ">
        <Button
          onPress={handleButtonClick}
          disabled={isRunning}
          color={status === "success" && taskId ? "secondary" : "success"}
          className="w-full lg:w-auto text-white"
        >
          {isRunning ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
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
            </svg>
          )}
          {status === "success" && taskId
            ? "Отправить на проверку"
            : isRunning
            ? "Выполняется..."
            : "Выполнить"}
        </Button>
        {activeTab === "output" && (
          <div className="lg:hidden w-full md:hidden">
            <Button
              onPress={() => {
                setActiveTab("editor");
                setStatus("idle");
              }}
              color="danger"
              className={`w-full`}
            >
              Попробовать снова
            </Button>
          </div>
        )}
      </div>
    </footer>
  );
};

export default Footer;
