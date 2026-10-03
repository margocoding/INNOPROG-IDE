import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import App from "./App";
import "./index.css";
import reportWebVitals from "./reportWebVitals";
import ErrorBoundary from "./components/shared/ErrorBoundary/ErrorBoundary";

declare global {
  interface Window {
    __ideStartupDiagnostics?: {
      mark: (event: "app_entry" | "render_scheduled") => void;
    };
    Telegram: {
      WebApp: {
        requestFullscreen: () => void;
        initData?: string;
        initDataUnsafe: any;
        close: () => void;
        expand: () => void;
        disableVerticalSwipes: () => void;
      };
    };
  }
}

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

export function isDesktop() {
  const userAgent = navigator.userAgent.toLowerCase();

  return (
    userAgent.includes("windows") ||
    userAgent.includes("macintosh")
  );
}

document.addEventListener("touchstart", function (event) {
  const activeElement = document.activeElement as HTMLElement;
  const target = event.target as Node;

  if (
    activeElement &&
    (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")
  ) {
    if (!activeElement.contains(target)) {
      activeElement.blur();
    }
  }
});
window.__ideStartupDiagnostics?.mark("app_entry");

root.render(
  <React.StrictMode>
    <ToastContainer theme="dark" />
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<App />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);

if (typeof window.requestAnimationFrame === "function") {
  window.requestAnimationFrame(() => window.__ideStartupDiagnostics?.mark("render_scheduled"));
} else {
  window.__ideStartupDiagnostics?.mark("render_scheduled");
}

reportWebVitals();
