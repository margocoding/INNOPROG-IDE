import React from "react";
import "./ErrorBoundary.css";

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("App crashed:", error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="ide-error-screen">
          <header className="ide-error-header"><img src="/logo.svg" alt="INNOPROG"/></header>
          <main className="ide-error-content" role="alert">
            <div className="ide-error-illustration" aria-hidden="true">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m25 17-5-6m19 6 5-6M15 27l-7-3m7 16-7 3m41-16 7-3m-7 16 7 3M20 50l-5 6m29-6 5 6"/>
                <rect x="18" y="17" width="28" height="36" rx="14" fill="#292337"/>
                <path d="M18 30h28m-14 0v23"/>
                <circle cx="26" cy="24" r="1" fill="currentColor"/><circle cx="38" cy="24" r="1" fill="currentColor"/>
              </svg>
            </div>
            <span className="ide-error-label">UNEXPECTED BUG</span>
            <h1>Произошла ошибка</h1>
            <p className="ide-error-joke">Кажется, один баг решил стать фичей</p>
            <p className="ide-error-hint">Обновите страницу — попробуем ещё раз</p>
            <button className="ide-error-reload" onClick={this.handleReload}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M16 8a6 6 0 1 0 0 5M16 3v5h-5"/></svg>
              Обновить страницу
            </button>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
