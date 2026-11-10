import { render, screen } from "@testing-library/react";
import Loader from "./Loader";

describe("Loader", () => {
  it("shows connection progress and errors", () => {
    const { rerender } = render(<Loader />);
    expect(screen.getByText("Подключение")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Подключение к комнате…");
    rerender(<Loader message="Соединение потеряно" />);
    expect(screen.getByText("Ошибка подключения")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Соединение потеряно");
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<Loader message="Custom" isError />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });
});
