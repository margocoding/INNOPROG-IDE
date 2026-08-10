import { act, renderHook } from "@testing-library/react";
import { api } from "../services/api";
import { Language } from "../types/task";
import { useCodeExecution } from "./useCodeExecution";

const mockPostToParent = jest.fn();

jest.mock("../services/api", () => ({
  api: {
    runCode: jest.fn(),
    checkCode: jest.fn(),
    submitCode: jest.fn(),
    checkTaskAnswer: jest.fn(),
  },
}));
jest.mock("../utils/parentMessaging", () => ({
  postToParent: (...args: unknown[]) => mockPostToParent(...args),
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

  it("checks task code against the single public sample without receiving hidden tests", async () => {
    mockedApi.checkCode.mockResolvedValue({ result: true, output: "out" } as any);
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
      task: { answers: [answer] },
    });
    await act(() => result.current.handleRunCode());
    expect(mockedApi.checkCode).toHaveBeenCalledWith(
      expect.objectContaining({
        input_data: "in",
        output_data: "out",
        program: "before\n\neditable\n\nafter",
      }),
      Language.PY,
    );
    expect(mockedApi.runCode).not.toHaveBeenCalled();
    expect(callbacks.setStatus).toHaveBeenCalledWith("success");
    expect(callbacks.setOutput).toHaveBeenLastCalledWith(
      "Первый тест пройден. Для сдачи задания отправь решение на полную проверку",
    );
  });

  it("runs Java task examples with the Java runtime", async () => {
    mockedApi.checkCode.mockResolvedValue({ result: true, output: "42" } as any);
    const answer = {
      code_before: "public class Main { public static void main(String[] args) {",
      code_after: "} }",
      input: "",
      output: "42",
      timeout: 5,
    };
    const { result } = setup({
      taskId: "230001",
      language: Language.JAVA,
      code: 'System.out.println(42);',
      currentAnswer: answer,
      task: { answers: [answer] },
    });

    await act(() => result.current.handleRunCode());

    expect(mockedApi.checkCode).toHaveBeenCalledWith(
      expect.objectContaining({ program: expect.stringContaining("System.out.println(42);") }),
      Language.JAVA,
    );
  });

  it("uses the first-test guidance for task runs without a public expected output", async () => {
    mockedApi.runCode.mockResolvedValue({
      result: true,
      output: "",
      comment: "Программа выполнена успешно.",
      input: "",
    } as any);
    const { result, callbacks } = setup({
      taskId: "11",
      currentAnswer: { code_before: "prefix", output: "" },
      task: {
        task_type: "paste",
        answers: [{ code_before: "prefix", output: "" }],
      },
    });

    await act(() => result.current.handleRunCode());

    expect(mockedApi.runCode).toHaveBeenCalled();
    expect(callbacks.setStatus).toHaveBeenLastCalledWith("success");
    expect(callbacks.setOutput).toHaveBeenLastCalledWith(
      "Первый тест пройден. Для сдачи задания отправь решение на полную проверку",
    );
  });

  it("submits an iframe task with a hidden single validator without running private wrappers", async () => {
    mockedApi.checkTaskAnswer.mockResolvedValue({
      result: true,
      message: "Верно",
      status: 200,
    });
    const { result } = setup({
      isInIframe: true,
      taskId: "180068",
      clientId: "77",
      answer_id: "answer",
      language: Language.JS,
      code: "function Settings() { return null; }",
      task: {
        task_type: "paste",
        has_multiple_tests: false,
        answers: [{ id: 1, hint: "hint" }],
      },
    });

    await act(() => result.current.handleRunCode());

    expect(mockedApi.checkTaskAnswer).toHaveBeenCalledWith(180068, {
      client_id: "77",
      answer_id: "answer",
      program: "function Settings() { return null; }",
    });
    expect(mockedApi.runCode).not.toHaveBeenCalled();
    expect(mockedApi.checkCode).not.toHaveBeenCalled();
  });

  it("runs a paste task with its public call but submits only editable code", async () => {
    mockedApi.runCode.mockResolvedValue({
      result: true,
      output: "k L",
      input: "",
    } as any);
    mockedApi.submitCode.mockResolvedValue({} as any);
    const answer = {
      code_before: "",
      code_after: 'print(f("kpVxLVsstFa", "Lkjm"))',
      output: "k L",
    };
    const { result } = setup({
      taskId: "10046",
      answer_id: "429",
      code: "def f(first, second):\n    return 'k L'",
      currentAnswer: answer,
      task: {
        task_type: "paste",
        answers: [answer],
      },
    });

    await act(() => result.current.handleRunCode());

    expect(mockedApi.runCode).toHaveBeenCalledWith(
      expect.objectContaining({
        program:
          "\ndef f(first, second):\n    return 'k L'\nprint(f(\"kpVxLVsstFa\", \"Lkjm\"))",
      }),
      Language.PY,
    );

    await act(() => result.current.onSendCheck());

    expect(mockedApi.submitCode).toHaveBeenCalledWith(
      expect.objectContaining({
        program: "def f(first, second):\n    return 'k L'",
      }),
    );
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

  it("opens the result pane for task runs on desktop", async () => {
    Object.defineProperty(window, "innerWidth", {
      value: 1280,
      configurable: true,
    });
    mockedApi.checkCode.mockResolvedValue({
      result: true,
      output: "136",
    } as any);
    const { result, callbacks } = setup({
      taskId: "10006",
      task: {
        answers: [{ input: "1\n16", output: "136" }],
      },
    });

    await act(() => result.current.handleRunCode());

    expect(callbacks.setActiveTab).toHaveBeenCalledWith("output");
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
    const { result, callbacks } = setup({
      taskId: "9", answer_id: "a", clientId: "77", isInIframe: true,
    });
    await act(() => result.current.onSendCheck());
    expect(mockedApi.checkTaskAnswer).toHaveBeenCalledWith(9, {
      client_id: "77", answer_id: "a", program: "print(1)",
    });
    expect(callbacks.setSubmitMessage).toHaveBeenCalledWith("Done");
    expect(mockPostToParent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "task-completed", taskId: 9 }),
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
