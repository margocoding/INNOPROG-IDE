import { render, screen } from "@testing-library/react";
import Loader from "./Loader";

jest.mock("@heroui/react", () => ({ Spinner: () => <div data-testid="spinner" /> }));

describe("Loader", () => {
  it("shows connection progress and errors", () => {
    const { rerender } = render(<Loader />);
    expect(screen.getByText("Подключение")).toBeInTheDocument();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    rerender(<Loader message="Соединение потеряно" />);
    expect(screen.getByText("Ошибка подключения")).toBeInTheDocument();
    expect(screen.queryByTestId("spinner")).toBeNull();
    rerender(<Loader message="Custom" isError />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });
});
