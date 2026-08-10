import { render } from "@testing-library/react";
import CodeEditorSection from "./CodeEditorSection";
import CodeEditor from "../CodeEditor/CodeEditor";

jest.mock("../CodeEditor/CodeEditor", () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="code-editor" />),
}));

const mockedEditor = CodeEditor as jest.MockedFunction<typeof CodeEditor>;

describe("CodeEditorSection", () => {
  beforeEach(() => mockedEditor.mockClear());

  it("passes wrappers and room permissions for multi-answer tasks", () => {
    render(
      <CodeEditorSection
        code="x"
        setCode={jest.fn()}
        language="py"
        currentAnswer={null}
        task={{
          task_type: "paste",
          answers: [{ code_before: "before", code_after: "after" }, {}],
        } as any}
        activeTab="editor"
        setCurrentCode={jest.fn()}
        handleLanguageChange={jest.fn()}
        webSocketData={{
          isConnected: true,
          isTeacher: false,
          completed: false,
          roomPermissions: { studentEditCodeEnabled: false },
          sendSelection: jest.fn(),
          selections: new Map(),
          myTelegramId: "1",
        }}
      />,
    );
    expect(mockedEditor.mock.calls[0][0]).toMatchObject({
      codeBefore: "before",
      codeAfter: "after\n\n",
      disabled: true,
      isWebSocket: true,
    });
  });

  it("hides private wrappers for a paste task with one server-side test", () => {
    render(
      <CodeEditorSection
        code="return 1"
        setCode={jest.fn()}
        language="py"
        currentAnswer={null}
        task={{
          task_type: "paste",
          has_multiple_tests: false,
          answers: [
            {
              code_before: "",
              code_after: "print(f('public'))",
            },
          ],
        } as any}
        activeTab="editor"
        setCurrentCode={jest.fn()}
        handleLanguageChange={jest.fn()}
      />,
    );

    expect(mockedEditor.mock.calls[0][0]).toMatchObject({
      codeBefore: "",
      codeAfter: "",
      disabled: false,
      isWebSocket: false,
    });
  });

  it("enables teachers and uses the selected answer", () => {
    const answer = { code_before: "b", code_after: "a" } as any;
    render(
      <CodeEditorSection
        code=""
        setCode={jest.fn()}
        language="js"
        currentAnswer={answer}
        task={{ answers: [answer, {}] } as any}
        activeTab="output"
        setCurrentCode={jest.fn()}
        handleLanguageChange={jest.fn()}
        webSocketData={{
          isConnected: false,
          isTeacher: true,
          completed: false,
          roomPermissions: { studentEditCodeEnabled: false },
          sendSelection: jest.fn(),
          selections: new Map(),
          myTelegramId: "1",
        }}
      />,
    );
    expect(mockedEditor.mock.calls[0][0].disabled).toBe(false);
  });

  it("keeps the editor visible on desktop when task output is open", () => {
    const { container } = render(
      <CodeEditorSection
        code="print(1)"
        setCode={jest.fn()}
        language="py"
        currentAnswer={null}
        task={{ answers: [{}] } as any}
        activeTab="output"
        setCurrentCode={jest.fn()}
        handleLanguageChange={jest.fn()}
        desktopStackedPane
        desktopPaneSize={58}
      />,
    );
    expect(container.firstElementChild).toHaveClass("hidden", "md:block");
    expect(container.firstElementChild).toHaveClass(
      "desktop-task-editor-pane",
    );
    expect(container.firstElementChild).toHaveStyle("width: 100%");
    expect(container.firstElementChild).toHaveStyle(
      "--desktop-pane-size: 58%",
    );
  });
});
