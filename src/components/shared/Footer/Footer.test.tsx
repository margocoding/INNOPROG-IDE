import { fireEvent, render, screen } from "@testing-library/react";
import Footer from "./Footer";

jest.mock("@heroui/react", () => ({
  Button: ({ children, onPress, ...props }: any) => (
    <button onClick={onPress} {...props}>{children}</button>
  ),
}));
jest.mock("../../..", () => ({ isDesktop: () => true }));

const props = () => ({
  status: "idle" as const,
  taskId: null,
  isRunning: false,
  activeTab: "editor" as const,
  language: "py",
  onRunCode: jest.fn().mockResolvedValue(undefined),
  onSubmitCheck: jest.fn().mockResolvedValue(undefined),
  setActiveTab: jest.fn(),
  setStatus: jest.fn(),
});

describe("Footer", () => {
  it("runs code and submits a successful task", async () => {
    const first = props();
    const { rerender } = render(<Footer {...first} />);
    fireEvent.click(screen.getByText("Выполнить"));
    expect(first.onRunCode).toHaveBeenCalled();
    await first.onRunCode.mock.results[0].value;
    const second = { ...props(), status: "success" as const, taskId: "1" };
    rerender(<Footer {...second} />);
    fireEvent.click(screen.getByText("Отправить на проверку"));
    expect(second.onSubmitCheck).toHaveBeenCalled();
  });

  it("handles HTML task and hides standalone HTML controls", () => {
    const task = { ...props(), language: "html", taskId: "1" };
    const { rerender } = render(<Footer {...task} />);
    fireEvent.click(screen.getByText("Отправить решение"));
    expect(task.onSubmitCheck).toHaveBeenCalled();
    rerender(<Footer {...props()} language="html" />);
    expect(screen.queryByText("Выполнить")).toBeNull();
  });

  it.each(["dockerfile", "yaml"])(
    "submits %s tasks without trying to execute the configuration",
    (language) => {
      const task = { ...props(), language, taskId: "360145", submitOnly: true };
      render(<Footer {...task} />);
      fireEvent.click(screen.getByText("Отправить решение"));
      expect(task.onSubmitCheck).toHaveBeenCalled();
      expect(task.onRunCode).not.toHaveBeenCalled();
    },
  );

  it.each(["dockerfile", "yaml"])(
    "does not turn an ordinary %s-language task into submit-only mode",
    (language) => {
      const task = { ...props(), language, taskId: "7" };
      render(<Footer {...task} />);
      fireEvent.click(screen.getByText("Выполнить"));
      expect(task.onRunCode).toHaveBeenCalled();
      expect(task.onSubmitCheck).not.toHaveBeenCalled();
    },
  );

  it("returns from mobile output to editor", () => {
    const state = { ...props(), activeTab: "output" as const };
    render(<Footer {...state} />);
    fireEvent.click(screen.getByText("Попробовать снова"));
    expect(state.setActiveTab).toHaveBeenCalledWith("editor");
    expect(state.setStatus).toHaveBeenCalledWith("idle");
  });

  it("delegates button actions to the shared primary-action guard", () => {
    const state = { ...props(), onPrimaryAction: jest.fn().mockResolvedValue(undefined) };
    render(<Footer {...state} />);
    fireEvent.click(screen.getByText("Выполнить"));
    expect(state.onPrimaryAction).toHaveBeenCalledTimes(1);
    expect(state.onRunCode).not.toHaveBeenCalled();
  });

  it("hides retry on desktop task results without changing submit behavior", () => {
    const state = {
      ...props(),
      status: "success" as const,
      taskId: "1",
      activeTab: "output" as const,
      desktopTaskMode: true,
    };
    render(<Footer {...state} />);
    fireEvent.click(screen.getByText("Отправить"));
    expect(state.onSubmitCheck).toHaveBeenCalled();
    expect(screen.getByText("Попробовать снова").closest("div")).toHaveClass(
      "md:hidden",
    );
  });
});
