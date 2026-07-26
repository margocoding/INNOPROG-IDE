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

  it("removes the editor from the desktop task result pane", () => {
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
        desktopSinglePane
      />,
    );
    expect(container.firstElementChild).toHaveClass("hidden");
    expect(container.firstElementChild).toHaveStyle("width: 100%");
  });
});
