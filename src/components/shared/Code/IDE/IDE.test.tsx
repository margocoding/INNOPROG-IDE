import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "../../../../services/api";
import IDE from "./IDE";

const mockHandleRunCode = jest.fn();
const mockOnSendCheck = jest.fn();
const mockSendChangeLanguage = jest.fn();
const mockSendEditMember = jest.fn();

jest.mock("@heroui/react", () => ({
  useDisclosure: () => ({
    isOpen: false,
    onOpen: jest.fn(),
    onOpenChange: jest.fn(),
    onClose: jest.fn(),
  }),
}));
jest.mock("../../../../hooks/useCodeExecution", () => ({
  useCodeExecution: () => ({
    isRunning: false,
    handleRunCode: mockHandleRunCode,
    onSendCheck: mockOnSendCheck,
    setCurrentCode: jest.fn(),
  }),
}));
jest.mock("../../../../services/api", () => ({
  api: { getTask: jest.fn(), getSubmitCode: jest.fn() },
}));
jest.mock("../CodeEditorSection/CodeEditorSection", () => ({
  __esModule: true,
  default: ({ code, setCode, handleLanguageChange, desktopSinglePane }: any) => (
    <section
      data-testid="editor"
      data-desktop-single-pane={String(Boolean(desktopSinglePane))}
    >
      <span>{code}</span>
      <button onClick={() => setCode("changed")}>change-code</button>
      <button onClick={() => handleLanguageChange("js")}>change-language</button>
    </section>
  ),
}));
jest.mock("../OutputSection/OutputSection", () => ({
  __esModule: true,
  default: ({ htmlPreview, desktopSinglePane }: any) => (
    <div
      data-testid="output"
      data-desktop-single-pane={String(Boolean(desktopSinglePane))}
    >
      {htmlPreview}
    </div>
  ),
}));
jest.mock("../SubmitModal/SubmitModal", () => ({
  __esModule: true, default: () => <div data-testid="submit-modal" />,
}));
jest.mock("../TaskDescription/TaskDescription", () => ({
  __esModule: true,
  default: ({ task, desktopSidebar, desktopWidth }: any) => (
    <div
      data-testid="task"
      data-desktop-sidebar={String(Boolean(desktopSidebar))}
      data-desktop-width={desktopWidth}
    >
      {task?.title}
    </div>
  ),
}));
jest.mock("../Resizer/Resizer", () => ({
  __esModule: true,
  default: ({ onResize }: any) => <button onClick={() => onResize(60)}>resize</button>,
}));
jest.mock("../../Header/Header", () => ({
  __esModule: true, default: () => <header>header</header>,
}));
jest.mock("../../Footer/Footer", () => ({
  __esModule: true,
  default: ({ onRunCode, onSubmitCheck, desktopTaskMode }: any) => (
    <footer data-desktop-task-mode={String(Boolean(desktopTaskMode))}>
      <button onClick={onRunCode}>run</button>
      <button onClick={onSubmitCheck}>submit</button>
    </footer>
  ),
}));
jest.mock("../../Room/Loader/Loader", () => ({
  __esModule: true,
  default: ({ message }: any) => <div data-testid="loader">{message}</div>,
}));
jest.mock("../../Room/StartFormModal/StartFormModal", () => ({
  __esModule: true,
  default: ({ onSendForm }: any) => (
    <button onClick={() => onSendForm("Alice")}>start-form</button>
  ),
}));

const socketData = (overrides: Record<string, unknown> = {}) => ({
  socket: null,
  isConnected: true,
  isJoinedRoom: true,
  connectionError: null,
  roomMembers: [{ telegramId: "123", online: true, isYourself: true }],
  cursors: new Map(),
  selections: new Map(),
  myUserColor: "#fff",
  roomPermissions: {
    studentCursorEnabled: true,
    studentSelectionEnabled: true,
    studentEditCodeEnabled: true,
  },
  completeSession: jest.fn(),
  sendCursorPosition: jest.fn(),
  sendSelection: jest.fn(),
  sendEditMember: mockSendEditMember,
  sendRoomPermissions: jest.fn(),
  sendChangeLanguage: mockSendChangeLanguage,
  completed: false,
  isTeacher: true,
  ...overrides,
}) as any;

describe("IDE", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, "", "/?telegramId=123");
  });

  it("renders standalone editor, runs actions and remembers resizing", () => {
    render(<IDE telegramId="123" />);
    expect(screen.getByText("header")).toBeInTheDocument();
    fireEvent.click(screen.getByText("run"));
    expect(mockHandleRunCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("submit"));
    expect(mockOnSendCheck).toHaveBeenCalled();
    fireEvent.click(screen.getByText("resize"));
    expect(localStorage.getItem("innoprog-editor-width")).toBe("60");
    fireEvent.click(screen.getByText("change-code"));
    expect(screen.getByText("changed")).toBeInTheDocument();
  });

  it("loads a task and previously submitted code", async () => {
    window.history.replaceState(
      {}, "", "/?telegramId=123&task_id=7&answer_id=a&lang=py",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      title: "Task", answers: [{ code_before: "", code_after: "" }, {}],
    });
    (api.getSubmitCode as jest.Mock).mockResolvedValue({ code: "saved" });
    render(<IDE telegramId="123" />);
    await screen.findByText("Task");
    await screen.findByText("saved");
    expect(api.getSubmitCode).toHaveBeenCalledWith("a", 123, 7);
    expect(screen.getByTestId("task")).toHaveAttribute(
      "data-desktop-sidebar",
      "true",
    );
    expect(screen.getByTestId("task")).toHaveAttribute(
      "data-desktop-width",
      "38",
    );
    expect(screen.getByTestId("editor")).toHaveAttribute(
      "data-desktop-single-pane",
      "true",
    );
    expect(screen.getByTestId("output")).toHaveAttribute(
      "data-desktop-single-pane",
      "true",
    );
    expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-desktop-task-mode",
      "true",
    );
    fireEvent.click(screen.getByText("resize"));
    expect(localStorage.getItem("innoprog-task-panel-width")).toBe("60");
  });

  it("keeps HTML tasks and standalone IDE in the existing split mode", async () => {
    window.history.replaceState(
      {},
      "",
      "/?telegramId=123&task_id=9&lang=html",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      title: "HTML task",
      answers: [{}],
    });
    render(<IDE telegramId="123" />);
    await screen.findByText("HTML task");
    expect(screen.getByTestId("task")).toHaveAttribute(
      "data-desktop-sidebar",
      "false",
    );
    expect(screen.getByTestId("editor")).toHaveAttribute(
      "data-desktop-single-pane",
      "false",
    );
    expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-desktop-task-mode",
      "false",
    );
  });

  it("uses joined room code, synchronizes username and language", () => {
    localStorage.setItem("innoprog-username", "Alice");
    window.history.replaceState({}, "", "/?roomId=r1&telegramId=123&lang=py");
    const data = socketData({
      joinedCode: "room code",
      language: "js",
      roomMembers: [{ telegramId: "123", online: true, isYourself: true, username: "" }],
    });
    render(<IDE telegramId="123" webSocketData={data} />);
    expect(screen.getByText("room code")).toBeInTheDocument();
    expect(mockSendEditMember).toHaveBeenCalledWith("Alice");
    fireEvent.click(screen.getByText("change-language"));
    expect(mockSendChangeLanguage).toHaveBeenCalledWith("js");
  });

  it("shows room loader before joining and stops it after timeout", () => {
    jest.useFakeTimers();
    window.history.replaceState({}, "", "/?roomId=r1&telegramId=123");
    const data = socketData({ isConnected: false, isJoinedRoom: false });
    render(<IDE telegramId="123" webSocketData={data} />);
    expect(screen.getByTestId("loader")).toHaveTextContent("Подключение");
    act(() => jest.advanceTimersByTime(12000));
    expect(screen.queryByTestId("loader")).toBeNull();
    jest.useRealTimers();
  });

  it("installs default HTML and Bash templates", () => {
    window.history.replaceState({}, "", "/?lang=html&telegramId=123");
    const first = render(<IDE telegramId="123" />);
    expect(screen.getByTestId("output").textContent).toContain("<!DOCTYPE html>");
    first.unmount();
    window.history.replaceState({}, "", "/?lang=bash&telegramId=123");
    render(<IDE telegramId="123" />);
    expect(screen.getByText("#!/bin/bash")).toBeInTheDocument();
  });

  it("applies room state custom events once", () => {
    window.history.replaceState({}, "", "/?roomId=r1&telegramId=123");
    render(<IDE telegramId="123" webSocketData={socketData({ joinedCode: undefined })} />);
    act(() => window.dispatchEvent(new CustomEvent("roomStateLoaded", {
      detail: { lastCode: "restored" },
    })));
    expect(screen.getByText("restored")).toBeInTheDocument();
  });
});
