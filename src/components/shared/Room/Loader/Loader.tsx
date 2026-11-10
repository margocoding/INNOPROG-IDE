import { createPortal } from "react-dom";
import "./Loader.css";

interface LoaderProps {
  message?: string;
  isError?: boolean;
}

export default function Loader({
  message = "Подключение к комнате…",
  isError = false,
}: LoaderProps) {
  const isErrorState =
    isError || message.includes("Ошибка") || message.includes("потеряно");

  return createPortal(
    <div className="room-loader-overlay">
      <div
        className="room-loader-card bg-ide-secondary border-ide-border text-ide-text-primary"
        role={isErrorState ? "alert" : "status"}
      >
        {isErrorState ? (
          <span className="room-loader-error text-red-400" aria-hidden="true">!</span>
        ) : (
          <span className="room-loader-spinner" aria-hidden="true" />
        )}
        <p className="text-base font-semibold">
          {isErrorState ? "Ошибка подключения" : "Подключение"}
        </p>
        <p className="mt-1 text-sm text-ide-text-secondary">{message}</p>
      </div>
    </div>,
    document.body
  );
}
