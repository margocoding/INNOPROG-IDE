import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "../../../../services/api";
import { postToParent } from "../../../../utils/parentMessaging";
import IDE from "./IDE";

const mockHandleRunCode = jest.fn();
const mockOnSendCheck = jest.fn();
const mockSendChangeLanguage = jest.fn();
const mockSendEditMember = jest.fn();
const mockPostToParent = postToParent as jest.Mock;

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
jest.mock("../../../../utils/parentMessaging", () => ({
  postToParent: jest.fn(),
}));
jest.mock("../CodeEditorSection/CodeEditorSection", () => ({
  __esModule: true,
  default: ({
    code,
    setCode,
    handleLanguageChange,
    webSocketData,
    collaborativeCodeSeed,
    canInitializeCollaborativeCode,
    desktopSinglePane,
    desktopStackedPane,
    desktopPaneSize,
  }: any) => (
    <section
      data-testid="editor"
      data-desktop-single-pane={String(Boolean(desktopSinglePane))}
      data-desktop-stacked-pane={String(Boolean(desktopStackedPane))}
      data-desktop-pane-size={desktopPaneSize}
      data-has-websocket={String(Boolean(webSocketData))}
      data-can-initialize={String(Boolean(canInitializeCollaborativeCode))}
    >
      <span>{code}</span>
      <span data-testid="collaborative-seed">{collaborativeCodeSeed}</span>
      <button onClick={() => setCode("changed")}>change-code</button>
      <button onClick={() => handleLanguageChange("js")}>change-language</button>
    </section>
  ),
}));
jest.mock("../OutputSection/OutputSection", () => ({
  __esModule: true,
  default: ({
    htmlPreview,
    desktopSinglePane,
    desktopStackedPane,
    activeTab,
  }: any) => (
    <div
      data-testid="output"
      data-desktop-single-pane={String(Boolean(desktopSinglePane))}
      data-desktop-stacked-pane={String(Boolean(desktopStackedPane))}
      data-active-tab={activeTab}
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
  default: ({ onResize, orientation = "vertical" }: any) => (
    <button
      data-testid={`resizer-${orientation}`}
      onClick={() => onResize(60)}
    >
      resize
    </button>
  ),
}));
jest.mock("../../Header/Header", () => ({
  __esModule: true, default: () => <header>header</header>,
}));
jest.mock("../../Footer/Footer", () => ({
  __esModule: true,
  default: ({
    onRunCode,
    onSubmitCheck,
    desktopTaskMode,
    setActiveTab,
  }: any) => (
    <footer data-desktop-task-mode={String(Boolean(desktopTaskMode))}>
      <button onClick={onRunCode}>run</button>
      <button onClick={onSubmitCheck}>submit</button>
      <button onClick={() => setActiveTab("output")}>show-output</button>
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
    Object.defineProperty(window, "self", {
      configurable: true,
      value: window,
    });
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

  it("does not render synchronization notifications", () => {
    window.history.replaceState({}, "", "/?telegramId=123&roomId=room-1");
    render(<IDE telegramId="123" webSocketData={socketData({
      connectionError: "Не удается восстановить связь с сервером",
      codeSyncState: "synchronized",
      showSyncSuccess: true,
      hasDurableStorageError: true,
      isPersistRetrying: true,
    })} />);

    expect(screen.queryByText("Изменения синхронизированы")).toBeNull();
    expect(screen.queryByText("Не удалось сохранить изменения на устройстве — не закрывайте страницу")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
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
      "data-desktop-stacked-pane",
      "true",
    );
    expect(screen.getByTestId("output")).toHaveAttribute(
      "data-desktop-stacked-pane",
      "true",
    );
    expect(screen.getByTestId("editor")).toHaveAttribute(
      "data-desktop-pane-size",
      "100",
    );
    expect(screen.queryByTestId("resizer-horizontal")).toBeNull();
    expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-desktop-task-mode",
      "true",
    );
    fireEvent.click(screen.getByText("resize"));
    expect(localStorage.getItem("innoprog-task-panel-width")).toBe("60");

    fireEvent.click(screen.getByText("show-output"));
    expect(screen.getByTestId("editor")).toHaveAttribute(
      "data-desktop-pane-size",
      "58",
    );
    expect(screen.getByTestId("output")).toHaveAttribute(
      "data-active-tab",
      "output",
    );
    expect(screen.getByTestId("resizer-horizontal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("resizer-horizontal"));
    expect(localStorage.getItem("innoprog-task-editor-height")).toBe("60");
  });

  it("loads submitted code when the app supplies an inactive socket facade", async () => {
    let resolveCode: (value: unknown) => void = () => undefined;
    const codePromise = new Promise((resolve) => {
      resolveCode = resolve;
    });
    window.history.replaceState(
      {}, "", "/?telegramId=123&task_id=7&answer_id=a&lang=py",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      id: 7,
      title: "Task",
      answers: [{ code_before: "", code_after: "" }],
    });
    (api.getSubmitCode as jest.Mock).mockReturnValue(codePromise);

    render(<IDE telegramId="123" webSocketData={socketData()} />);
    expect(screen.getByTestId("editor")).toHaveAttribute(
      "data-has-websocket",
      "false",
    );

    await act(async () => {
      resolveCode({ code: "restored answer" });
      await codePromise;
    });
    expect(screen.getByText("restored answer")).toBeInTheDocument();
  });

  it("announces embedded readiness only after both task and initial code are loaded", async () => {
    let resolveTask: (value: unknown) => void = () => undefined;
    let resolveCode: (value: unknown) => void = () => undefined;
    const taskPromise = new Promise((resolve) => {
      resolveTask = resolve;
    });
    const codePromise = new Promise((resolve) => {
      resolveCode = resolve;
    });

    Object.defineProperty(window, "self", {
      configurable: true,
      value: {},
    });
    window.history.replaceState(
      {},
      "",
      "/?telegramId=123&task_id=7&answer_id=a&lang=py&platforma=app",
    );
    (api.getTask as jest.Mock).mockReturnValue(taskPromise);
    (api.getSubmitCode as jest.Mock).mockReturnValue(codePromise);

    render(<IDE telegramId="123" />);
    expect(mockPostToParent).not.toHaveBeenCalled();

    await act(async () => {
      resolveCode({ code: "saved" });
      await codePromise;
    });
    expect(mockPostToParent).not.toHaveBeenCalled();

    await act(async () => {
      resolveTask({
        id: 7,
        title: "Task",
        answers: [{ code_before: "", code_after: "" }, {}],
      });
      await taskPromise;
    });

    await waitFor(() => {
      expect(mockPostToParent).toHaveBeenCalledWith({
        source: "innoprog-ide",
        type: "ide-ready",
        event: "task-rendered",
        taskId: 7,
        language: "py",
        ready: true,
      });
    });
    expect(mockPostToParent).toHaveBeenCalledTimes(1);
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

  it("offers the HTML template to the recovered room only through the teacher", () => {
    window.history.replaceState({}, "", "/?lang=html&roomId=r1&telegramId=123");
    render(<IDE telegramId="123" webSocketData={socketData({
      joinedCode: "",
      isCodeQueueRestored: true,
      isTeacher: true,
    })} />);

    expect(screen.getByTestId("editor")).toHaveAttribute("data-has-websocket", "true");
    expect(screen.getByTestId("editor")).toHaveAttribute("data-can-initialize", "true");
    expect(screen.getByTestId("collaborative-seed")).toHaveTextContent("<!DOCTYPE html>");
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
