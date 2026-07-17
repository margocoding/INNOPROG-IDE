import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

const Broken = () => {
  throw new Error("boom");
};

describe("ErrorBoundary", () => {
  it("renders children and catches a failed child", () => {
    const error = jest.spyOn(console, "error").mockImplementation();
    const { rerender } = render(
      <ErrorBoundary><span>OK</span></ErrorBoundary>,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
    rerender(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.getByText(/произошла ошибка/i)).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
  });
});
