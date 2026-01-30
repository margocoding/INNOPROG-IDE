import React from "react";

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
        <div className="min-h-screen bg-ide-background text-ide-text-primary flex items-center justify-center p-6">
          <div className="bg-ide-secondary border border-ide-border rounded-lg p-6 max-w-md w-full text-center">
            <div className="text-2xl mb-2">Произошла ошибка</div>
            <p className="text-sm text-ide-text-secondary">
              Попробуйте обновить страницу.
            </p>
            <button
              className="mt-4 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              onClick={this.handleReload}
            >
              Обновить
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
