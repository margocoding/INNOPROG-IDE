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

  it("uses semantic config filenames instead of treating every YAML file as Compose", () => {
    const generic = render(<CodeEditor {...props} language="yaml" />);
    expect(screen.getByText("config.yaml")).toBeInTheDocument();
    generic.unmount();

    render(<CodeEditor {...props} language="yaml" fileName="compose.yaml" />);
    expect(screen.getByText("compose.yaml")).toBeInTheDocument();
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

  it("does not switch a collaborative room to an unsupported config language", async () => {
    const { container } = render(
      <CodeEditor {...props} language="py" isTeacher isWebSocket value="existing" />,
    );
    const file = new File(["services: {}"], "compose.yaml", {
      type: "application/yaml",
    });
    Object.defineProperty(file, "text", {
      value: jest.fn().mockResolvedValue("services: {}"),
    });

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });

    await waitFor(() => expect(props.onChange).toHaveBeenCalled());
    expect(props.handleLanguageChange).not.toHaveBeenCalled();
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

  it("seeds an empty collaborative document only after room recovery is ready", () => {
    const onSendUpdate = jest.fn();
    let document: Y.Doc | null = null;
    const seed = "<!DOCTYPE html><html><body></body></html>";
    const { container, rerender } = render(
      <CodeEditor
        {...props}
        value=""
        language="html"
        isWebSocket
        joinedCode=""
        allowLegacyCodeSeed={false}
        canInitializeCollaborativeCode
        isCollaborativeStateReady
        onSendUpdate={onSendUpdate}
        onYDocReady={(value) => { document = value; }}
      />,
    );

    expect(container.querySelector(".cm-content")?.textContent).toBe("");
    expect(onSendUpdate).not.toHaveBeenCalled();

    rerender(
      <CodeEditor
        {...props}
        value={seed}
        language="html"
        isWebSocket
        joinedCode=""
        allowLegacyCodeSeed={false}
        collaborativeCodeSeed={seed}
        canInitializeCollaborativeCode
        isCollaborativeStateReady
        onSendUpdate={onSendUpdate}
        onYDocReady={(value) => { document = value; }}
      />,
    );

    expect(container.querySelector(".cm-content")?.textContent).toBe("");
    expect(onSendUpdate).not.toHaveBeenCalled();

    rerender(
      <CodeEditor
        {...props}
        value={seed}
        language="html"
        isWebSocket
        joinedCode=""
        allowLegacyCodeSeed
        collaborativeCodeSeed={seed}
        canInitializeCollaborativeCode
        isCollaborativeStateReady
        onSendUpdate={onSendUpdate}
        onYDocReady={(value) => { document = value; }}
      />,
    );

    expect((document as Y.Doc).getText("codemirror").toString()).toBe(seed);
    expect(container.querySelector(".cm-content")?.textContent).toContain("DOCTYPE html");
    expect(onSendUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not let a non-initiator seed a collaborative document", () => {
    const onSendUpdate = jest.fn();
    let document: Y.Doc | null = null;
    render(
      <CodeEditor
        {...props}
        value="template"
        language="html"
        isWebSocket
        joinedCode=""
        allowLegacyCodeSeed
        collaborativeCodeSeed="template"
        canInitializeCollaborativeCode={false}
        isCollaborativeStateReady
        onSendUpdate={onSendUpdate}
        onYDocReady={(value) => { document = value; }}
      />,
    );

    expect((document as Y.Doc).getText("codemirror").toString()).toBe("");
    expect(onSendUpdate).not.toHaveBeenCalled();
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
