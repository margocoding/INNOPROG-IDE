import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SubmitModal from "./SubmitModal";

jest.mock("@heroui/react", () => ({
  Modal: ({ children }: any) => <div>{children}</div>,
  ModalContent: ({ children }: any) => <div>{children}</div>,
  ModalHeader: ({ children }: any) => <div>{children}</div>,
  ModalBody: ({ children }: any) => <div>{children}</div>,
  ModalFooter: ({ children }: any) => <div>{children}</div>,
  Spinner: () => <span>loading</span>,
  Button: ({ children, onPress, ...props }: any) => (
    <button onClick={onPress} {...props}>{children}</button>
  ),
  Switch: ({ isSelected, onValueChange }: any) => (
    <input
      type="checkbox"
      checked={isSelected}
      onChange={(event) => onValueChange(event.target.checked)}
    />
  ),
  Textarea: ({ label, ...props }: any) => <textarea aria-label={label} {...props} />,
}));

const props = (overrides: Record<string, unknown> = {}) => ({
  isOpen: true,
  onOpenChange: jest.fn(),
  onClose: jest.fn(),
  submitResult: "no_data" as const,
  submitMessage: "",
  isRunning: false,
  inputData: "in",
  setInputData: jest.fn(),
  outputData: "out",
  setOutputData: jest.fn(),
  isInputData: true,
  setIsInputData: jest.fn(),
  isOutputData: true,
  setIsOutputData: jest.fn(),
  onApply: jest.fn().mockResolvedValue(undefined),
  showNextAction: false,
  onNext: jest.fn(),
  ...overrides,
});

describe("SubmitModal", () => {
  it("edits optional data and applies it", async () => {
    const state = props();
    render(<SubmitModal {...state} />);
    fireEvent.change(screen.getByLabelText("Входные данные"), {
      target: { value: "new input" },
    });
    expect(state.setInputData).toHaveBeenCalledWith("new input");
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(state.setIsOutputData).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByText("Применить"));
    expect(state.onApply).toHaveBeenCalled();
    await waitFor(() => expect(state.onClose).toHaveBeenCalled());
  });

  it("shows the Apply spinner until execution finishes and blocks repeat submission", async () => {
    let finish = () => {};
    const onApply = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const state = props({ onApply });
    render(<SubmitModal {...state} />);
    const apply = screen.getByRole("button", { name: "Применить" });

    fireEvent.click(apply);
    expect(apply).toHaveAttribute("aria-busy", "true");
    expect(apply).toBeDisabled();
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(state.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(onApply).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(state.onClose).toHaveBeenCalledTimes(1);
    expect(apply).toHaveAttribute("aria-busy", "false");
  });

  it("submits with keyboard shortcut and ignores typing Enter", async () => {
    const state = props();
    render(<SubmitModal {...state} />);
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(state.onApply).toHaveBeenCalled();
    await waitFor(() => expect(state.onClose).toHaveBeenCalled());
    state.onApply.mockClear();
    const input = screen.getByLabelText("Входные данные");
    input.focus();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(state.onApply).not.toHaveBeenCalled();
  });

  it.each([
    ["success", "Верно"],
    ["error", "Не все проверки прошли"],
  ])("renders %s result", (result, text) => {
    render(<SubmitModal {...props({ submitResult: result as any })} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows only the success heading even when an explanation is supplied", () => {
    render(<SubmitModal {...props({
      submitResult: "success",
      submitMessage: "Верно. Проверьте вывод.",
    })} />);
    expect(screen.getByText("Верно")).toBeInTheDocument();
    expect(screen.queryByText(/Проверьте вывод/)).not.toBeInTheDocument();
    expect(screen.queryByText("Верно. Проверьте вывод")).not.toBeInTheDocument();
  });

  it("does not apply while running", () => {
    const state = props({ isRunning: true });
    render(<SubmitModal {...state} />);
    fireEvent.click(screen.getByText("Применить"));
    expect(state.onApply).not.toHaveBeenCalled();
  });

  it("renders the embedded task next action under a successful result", () => {
    const state = props({ submitResult: "success", showNextAction: true });
    render(<SubmitModal {...state} />);

    fireEvent.click(screen.getByRole("button", { name: "Дальше" }));

    expect(state.onNext).toHaveBeenCalledTimes(1);
  });
});
