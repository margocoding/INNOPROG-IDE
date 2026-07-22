import { act, renderHook } from "@testing-library/react";
import { api } from "../services/api";
import { Language } from "../types/task";
import { useCodeExecution } from "./useCodeExecution";

jest.mock("../services/api", () => ({
  api: {
    runCode: jest.fn(),
    checkCode: jest.fn(),
    submitCode: jest.fn(),
    checkTaskAnswer: jest.fn(),
  },
}));

const mockedApi = api as jest.Mocked<typeof api>;

const setup = (overrides: Record<string, unknown> = {}) => {
  const callbacks = {
    setOutput: jest.fn(),
    setRunInputData: jest.fn(),
    setStatus: jest.fn(),
    setActiveTab: jest.fn(),
    setSubmitResult: jest.fn(),
    onOpen: jest.fn(),
    setSubmitMessage: jest.fn(),
  };
  const props: any = {
    currentAnswer: null,
    task: null,
    code: "print(1)",
    inputData: "",
    outputData: "",
    taskId: null,
    answer_id: null,
    clientId: "123",
    language: Language.PY,
    status: "idle",
    isInIframe: false,
    ...callbacks,
    ...overrides,
  };
  return { callbacks, ...renderHook(() => useCodeExecution(props)) };
};

describe("useCodeExecution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
  });

  it("runs standalone code and displays output", async () => {
    mockedApi.runCode.mockResolvedValue({ result: true, output: "1", input: "stdin" } as any);
    const { result, callbacks } = setup({ inputData: "stdin" });
    await act(() => result.current.handleRunCode());
    expect(mockedApi.runCode).toHaveBeenCalledWith(
      expect.objectContaining({ program: "\nprint(1)\n" }),
      Language.PY,
    );
    expect(callbacks.setOutput).toHaveBeenCalledWith("1");
    expect(callbacks.setStatus).toHaveBeenLastCalledWith("idle");
  });

  it("runs task code without receiving or comparing hidden expected answers", async () => {
    mockedApi.runCode.mockResolvedValue({ result: true, output: "ok" } as any);
    const answer = {
      code_before: "before\n",
      code_after: "\nafter",
      input: "in",
      output: "out",
      timeout: 5,
    };
    const { result, callbacks } = setup({
      taskId: "7",
      language: Language.JS,
      code: "before\neditable\nafter",
      currentAnswer: answer,
      task: { answers: [answer, answer] },
    });
    await act(() => result.current.handleRunCode());
    expect(mockedApi.runCode).toHaveBeenCalledWith(
      expect.objectContaining({ program: "before\n\neditable\n\nafter" }),
      Language.PY,
    );
    expect(mockedApi.checkCode).not.toHaveBeenCalled();
    expect(callbacks.setStatus).toHaveBeenCalledWith("success");
    expect(callbacks.setOutput).toHaveBeenLastCalledWith("ok");
  });

  it("reports failed checks and execution exceptions on the output tab", async () => {
    Object.defineProperty(window, "innerWidth", { value: 500, configurable: true });
    mockedApi.checkCode.mockResolvedValue({
      result: false, comment: "wrong", output: "actual",
    } as any);
    const first = setup({ outputData: "expected" });
    await act(() => first.result.current.handleRunCode());
    expect(first.callbacks.setOutput.mock.calls.at(-1)[0]).toContain("Ожидалось: expected");
    expect(first.callbacks.setActiveTab).toHaveBeenCalledWith("output");

    mockedApi.runCode.mockRejectedValue(new Error("offline"));
    const second = setup();
    await act(() => second.result.current.handleRunCode());
    expect(second.callbacks.setOutput).toHaveBeenCalledWith("Ошибка выполнения: offline");
    expect(second.callbacks.setStatus).toHaveBeenCalledWith("error");
  });

  it("submits regular solutions and closes Telegram WebApp", async () => {
    mockedApi.submitCode.mockResolvedValue({} as any);
    const close = jest.fn();
    window.Telegram = { WebApp: { close } } as any;
    const { result, callbacks } = setup({
      taskId: "8", answer_id: "answer", clientId: "42",
    });
    await act(() => result.current.onSendCheck());
    expect(mockedApi.submitCode).toHaveBeenCalledWith({
      program: "print(1)", user_id: 42, answer_id: "answer", task_id: 8,
    });
    expect(callbacks.setSubmitResult).toHaveBeenCalledWith("success");
    expect(callbacks.onOpen).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("checks embedded answers and notifies the parent on success", async () => {
    mockedApi.checkTaskAnswer.mockResolvedValue({ result: true, message: "Done", status: 200 });
    const postMessage = jest.spyOn(window.parent, "postMessage").mockImplementation();
    const { result, callbacks } = setup({
      taskId: "9", answer_id: "a", clientId: "77", isInIframe: true,
    });
    await act(() => result.current.onSendCheck());
    expect(mockedApi.checkTaskAnswer).toHaveBeenCalledWith(9, {
      client_id: "77", answer_id: "a", program: "print(1)",
    });
    expect(callbacks.setSubmitMessage).toHaveBeenCalledWith("Done");
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "task-completed", taskId: 9 }),
      "*",
    );
  });

  it("keeps the modal open with a useful embedded failure", async () => {
    mockedApi.checkTaskAnswer.mockRejectedValue(new Error("network"));
    const { result, callbacks } = setup({
      taskId: "9", isInIframe: true,
    });
    await act(() => result.current.onSendCheck());
    expect(callbacks.setSubmitMessage).toHaveBeenCalledWith(
      "Не удалось проверить решение. Попробуйте еще раз",
    );
    expect(callbacks.setSubmitResult).toHaveBeenCalledWith("error");
    expect(callbacks.onOpen).toHaveBeenCalled();
  });
});
