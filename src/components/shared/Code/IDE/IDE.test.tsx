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
    fileName,
  }: any) => (
    <section
      data-testid="editor"
      data-desktop-single-pane={String(Boolean(desktopSinglePane))}
      data-desktop-stacked-pane={String(Boolean(desktopStackedPane))}
      data-desktop-pane-size={desktopPaneSize}
      data-has-websocket={String(Boolean(webSocketData))}
      data-can-initialize={String(Boolean(canInitializeCollaborativeCode))}
      data-file-name={fileName || ""}
    >
      <span data-testid="editable-code">{code}</span>
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
	__esModule: true,
	default: ({ showNextAction, onNext }: any) => (
		<div data-testid="submit-modal">
			{showNextAction ? <button onClick={onNext}>modal-next</button> : null}
		</div>
	),
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
    isRunning,
    onPrimaryAction,
  }: any) => (
    <footer
      data-desktop-task-mode={String(Boolean(desktopTaskMode))
      }
      data-action-disabled={String(Boolean(isRunning))}
    >
      <button onClick={onRunCode}>run</button>
      <button onClick={onSubmitCheck}>submit</button>
      <button onClick={onPrimaryAction}>primary</button>
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

  it("opens an attached starter file when no submitted code exists", async () => {
    window.history.replaceState(
      {}, "", "/?telegramId=123&task_id=80026&answer_id=a&lang=py",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      id: 80026,
      title: "Complete the file",
      type: "Дополнение кода",
      initial_code: "from sklearn.datasets import load_wine\n\nX = wine.data",
      answers: [{ code_before: "", code_after: "" }],
    });
    (api.getSubmitCode as jest.Mock).mockResolvedValue({
      code: "\n# Напишите код здесь\n\n",
      has_saved_code: false,
    });

    render(<IDE telegramId="123" />);

    await screen.findByText("Complete the file");
    await waitFor(() => expect(api.getSubmitCode).toHaveBeenCalled());
    expect(screen.getByTestId("editable-code")).toHaveTextContent("");
    expect(screen.queryByText(/Напишите код здесь/)).toBeNull();
  });

  it("keeps a saved answer instead of replacing it with the starter file", async () => {
    window.history.replaceState(
      {}, "", "/?telegramId=123&task_id=80026&answer_id=a&lang=py",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      id: 80026,
      title: "Complete the file",
      type: "Дополнение кода",
      initial_code: "starter code",
      answers: [{ code_before: "", code_after: "" }],
    });
    (api.getSubmitCode as jest.Mock).mockResolvedValue({
      code: "student solution",
      has_saved_code: true,
    });

    render(<IDE telegramId="123" />);

    await screen.findByText("student solution");
    expect(screen.getByTestId("editable-code")).toHaveTextContent("student solution");
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

  it("requests the next platform task from the successful result action", async () => {
    Object.defineProperty(window, "self", {
      configurable: true,
      value: {},
    });
    window.history.replaceState(
      {},
      "",
      "/?telegramId=123&task_id=230024&answer_id=a&lang=java&platforma=app",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      id: 230024,
      title: "Task",
      answers: [{ code_before: "", code_after: "" }, {}],
    });
    (api.getSubmitCode as jest.Mock).mockResolvedValue({ code: "saved" });

    render(<IDE telegramId="123" />);
    await screen.findByText("Task");
    fireEvent.click(screen.getByText("modal-next"));

    expect(mockPostToParent).toHaveBeenCalledWith({
      source: "innoprog-ide",
      type: "task-next-requested",
      event: "advance-to-next-task",
      taskId: 230024,
    });
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

  it.each([
    ["360145", "dockerfile"],
    ["360156", "yaml"],
  ])(
    "submits task %s as %s with Ctrl+Enter without running it",
    async (taskId) => {
      window.history.replaceState(
        {},
        "",
        `/?telegramId=123&task_id=${taskId}&answer_id=a&lang=py`,
      );
      (api.getTask as jest.Mock).mockResolvedValue({
        id: Number(taskId),
        title: "Docker configuration",
        answers: [{ code_before: "", code_after: "" }],
      });
      (api.getSubmitCode as jest.Mock).mockResolvedValue({ code: "saved" });

      render(<IDE telegramId="123" />);
      await screen.findByText("Docker configuration");
      await screen.findByText("saved");
      await waitFor(() => expect(screen.getByRole("contentinfo")).toHaveAttribute(
        "data-action-disabled",
        "false",
      ));
      fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

      await waitFor(() => expect(mockOnSendCheck).toHaveBeenCalledTimes(1));
      expect(mockHandleRunCode).not.toHaveBeenCalled();
    },
  );

  it("does not submit a configuration task before task and code hydration", async () => {
    let resolveTask: (value: unknown) => void = () => undefined;
    let resolveCode: (value: unknown) => void = () => undefined;
    window.history.replaceState(
      {},
      "",
      "/?telegramId=123&task_id=360145&answer_id=a&lang=py",
    );
    (api.getTask as jest.Mock).mockReturnValue(new Promise((resolve) => {
      resolveTask = resolve;
    }));
    (api.getSubmitCode as jest.Mock).mockReturnValue(new Promise((resolve) => {
      resolveCode = resolve;
    }));

    render(<IDE telegramId="123" />);
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(mockOnSendCheck).not.toHaveBeenCalled();

    await act(async () => {
      resolveTask({
        id: 360145,
        title: "Docker configuration",
        answers: [{ code_before: "", code_after: "" }],
      });
    });
    await screen.findByText("Docker configuration");
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(mockOnSendCheck).not.toHaveBeenCalled();

    await act(async () => {
      resolveCode({ code: "FROM alpine", has_saved_code: true });
    });
    await screen.findByText("FROM alpine");
    await waitFor(() => expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-action-disabled",
      "false",
    ));
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(mockOnSendCheck).toHaveBeenCalledTimes(1));
    expect(mockHandleRunCode).not.toHaveBeenCalled();
  });

  it("reports saved-code failure to the platform instead of leaving its loader forever", async () => {
    Object.defineProperty(window, "self", { configurable: true, value: {} });
    window.history.replaceState({}, "", "/?client_id=123&task_id=10030&answer_id=a&platforma=app");
    (api.getTask as jest.Mock).mockResolvedValue({ id: 10030, title: "Операции со списками", answers: [{}] });
    (api.getSubmitCode as jest.Mock).mockRejectedValue(new Error("network"));
    render(<IDE telegramId="123" />);
    await waitFor(() => expect(mockPostToParent).toHaveBeenCalledWith(expect.objectContaining({
      type: "ide-load-error", event: "saved-code-load-failed", taskId: 10030, ready: false,
    })));
    expect(mockPostToParent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ide-ready" }));
    expect(screen.getByRole("contentinfo")).toHaveAttribute("data-action-disabled", "true");
  });

  it("keeps configuration submission blocked when saved-code hydration fails", async () => {
    window.history.replaceState(
      {},
      "",
      "/?telegramId=123&task_id=360145&answer_id=a",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      id: 360145,
      title: "Docker configuration",
      answers: [{ code_before: "", code_after: "" }],
    });
    (api.getSubmitCode as jest.Mock).mockRejectedValue(new Error("network"));

    render(<IDE telegramId="123" />);
    await screen.findByText("Docker configuration");
    await waitFor(() => expect(api.getSubmitCode).toHaveBeenCalled());
    expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-action-disabled",
      "true",
    );

    fireEvent.click(screen.getByText("primary"));
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(mockOnSendCheck).not.toHaveBeenCalled();
    expect(mockHandleRunCode).not.toHaveBeenCalled();
  });

  it("keeps submission blocked for a fulfilled hydration error payload", async () => {
    window.history.replaceState(
      {},
      "",
      "/?telegramId=123&task_id=360145&answer_id=a",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      id: 360145,
      title: "Docker configuration",
      answers: [{ code_before: "", code_after: "" }],
    });
    (api.getSubmitCode as jest.Mock).mockResolvedValue({
      status: "error",
      message: "backend failed",
    });

    render(<IDE telegramId="123" />);
    await screen.findByText("Docker configuration");
    await waitFor(() => expect(api.getSubmitCode).toHaveBeenCalled());
    expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-action-disabled",
      "true",
    );
    fireEvent.click(screen.getByText("primary"));
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(mockOnSendCheck).not.toHaveBeenCalled();
  });

  it("uses server presentation metadata for rebuilt configuration tasks", async () => {
    window.history.replaceState(
      {},
      "",
      "/?telegramId=123&task_id=361376&answer_id=a&lang=py",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      id: 361376,
      title: "Compose configuration",
      submission_ui: "ide",
      editor_language: "yaml",
      answers: [{ code_before: "", code_after: "" }],
    });
    (api.getSubmitCode as jest.Mock).mockResolvedValue({
      code: "services: {}",
      has_saved_code: true,
    });

    render(<IDE telegramId="123" />);
    await screen.findByText("services: {}");
    expect(screen.getByTestId("editor")).toHaveAttribute("data-file-name", "");
    await waitFor(() => expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-action-disabled",
      "false",
    ));
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(mockOnSendCheck).toHaveBeenCalledTimes(1));
    expect(mockHandleRunCode).not.toHaveBeenCalled();
  });

  it("single-flights a mixed footer and keyboard submission", async () => {
    let resolveSubmission: () => void = () => undefined;
    mockOnSendCheck.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveSubmission = resolve;
    }));
    window.history.replaceState(
      {},
      "",
      "/?telegramId=123&task_id=360145&answer_id=a",
    );
    (api.getTask as jest.Mock).mockResolvedValue({
      id: 360145,
      title: "Docker configuration",
      answers: [{ code_before: "", code_after: "" }],
    });
    (api.getSubmitCode as jest.Mock).mockResolvedValue({
      code: "FROM alpine",
      has_saved_code: true,
    });

    render(<IDE telegramId="123" />);
    await screen.findByText("FROM alpine");
    await waitFor(() => expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-action-disabled",
      "false",
    ));
    fireEvent.click(screen.getByText("primary"));
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(mockOnSendCheck).toHaveBeenCalledTimes(1);

    await act(async () => resolveSubmission());
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
