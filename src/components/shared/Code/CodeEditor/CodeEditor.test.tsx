import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as Y from "yjs";
import CodeEditor from "./CodeEditor";

jest.mock("@heroui/react", () => ({
  Select: ({ children, onChange, ...props }: any) => (
    <select
      aria-label={props["aria-label"]}
      onChange={onChange}
    >
      {children}
    </select>
  ),
  SelectItem: ({ children }: any) => <option>{children}</option>,
}));

describe("CodeEditor", () => {
  const props = {
    value: "print(1)",
    onChange: jest.fn(),
    setCurrentCode: jest.fn(),
    disabled: false,
    handleLanguageChange: jest.fn(),
    isWebSocket: false,
  };

  beforeAll(() => {
    (global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(() => jest.clearAllMocks());

  it("renders an editable editor and language/file controls", () => {
    const { container } = render(<CodeEditor {...props} language="py" isTeacher />);
    expect(container.querySelector(".cm-editor")).toBeInTheDocument();
    expect(screen.getByText(/\.py/)).toBeInTheDocument();
    expect(screen.getByTestId("code-editor-shell")).toHaveClass(
      "overflow-clip",
    );
  });

  it("switches language through the teacher selector", () => {
    const { container } = render(<CodeEditor {...props} language="py" isTeacher />);
    const select = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "Python" } });
    expect(props.handleLanguageChange).toHaveBeenCalled();
  });

  it("renders read-only and HTML variants", () => {
    const first = render(
      <CodeEditor {...props} language="html" readOnly codeBefore="<main>" codeAfter="</main>" />,
    );
    expect(first.container.querySelector(".cm-editor")).toBeInTheDocument();
    first.unmount();
    render(<CodeEditor {...props} language="bash" disabled />);
  });

  it("imports a code file, detects its language and merges content", async () => {
    const { container } = render(
      <CodeEditor {...props} language="py" isTeacher value="existing" />,
    );
    const file = new File(["const x = 1"], "script.js", {
      type: "text/javascript",
    });
    Object.defineProperty(file, "text", {
      value: jest.fn().mockResolvedValue("const x = 1"),
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText("script.py");
    await waitFor(() => expect(props.handleLanguageChange).toHaveBeenCalled());
    expect(props.onChange).toHaveBeenCalledWith(expect.stringContaining("const x = 1"));
  });

  it("rejects oversized imports and downloads editable code", () => {
    const alert = jest.spyOn(window, "alert").mockImplementation();
    const createObjectURL = jest.fn(() => "blob:test");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURL, configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURL, configurable: true,
    });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation();
    const { container } = render(<CodeEditor {...props} language="py" value="print(2)" />);
    const tooLarge = new File(["x"], "large.py");
    Object.defineProperty(tooLarge, "size", { value: 3 * 1024 * 1024 });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [tooLarge] },
    });
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("слишком большой"));
    fireEvent.click(screen.getByLabelText("Скачать код"));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("synchronizes external values without recreating the editor", () => {
    const { container, rerender } = render(
      <CodeEditor {...props} value="first" language="java" />,
    );
    rerender(<CodeEditor {...props} value="second" language="java" />);
    expect(container.querySelector(".cm-content")?.textContent).toContain("second");
  });

  it("hands a local Yjs edit to the durable queue without debounce", () => {
    const onSendUpdate = jest.fn();
    let document: Y.Doc | null = null;
    render(
      <CodeEditor
        {...props}
        language="py"
        isWebSocket
        onSendUpdate={onSendUpdate}
        onYDocReady={(value) => { document = value; }}
      />,
    );

    expect(document).not.toBeNull();
    (document as Y.Doc).getText("codemirror").insert(0, "x");
    expect(onSendUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not let a delayed legacy snapshot overwrite restored offline code", () => {
    let document: Y.Doc | null = null;
    const { rerender } = render(
      <CodeEditor
        {...props}
        language="py"
        isWebSocket
        joinedCode="server seed"
        onYDocReady={(value) => { document = value; }}
      />,
    );

    const ytext = (document as Y.Doc).getText("codemirror");
    ytext.insert(ytext.length, " + offline edit");
    rerender(
      <CodeEditor
        {...props}
        language="py"
        isWebSocket
        joinedCode="late stale snapshot"
        onYDocReady={(value) => { document = value; }}
      />,
    );

    expect(ytext.toString()).toBe("server seed + offline edit");
  });

  it("does not resurrect legacy code after an offline deletion", () => {
    let document: Y.Doc | null = null;
    const { rerender } = render(
      <CodeEditor
        {...props}
        language="py"
        isWebSocket
        joinedCode="code deleted offline"
        allowLegacyCodeSeed
        onYDocReady={(value) => { document = value; }}
      />,
    );
    const ytext = (document as Y.Doc).getText("codemirror");
    ytext.delete(0, ytext.length);
    expect(ytext.toString()).toBe("");

    rerender(
      <CodeEditor
        {...props}
        language="py"
        isWebSocket
        joinedCode="stale server code"
        allowLegacyCodeSeed
        onYDocReady={(value) => { document = value; }}
      />,
    );
    expect(ytext.toString()).toBe("");
  });
});
