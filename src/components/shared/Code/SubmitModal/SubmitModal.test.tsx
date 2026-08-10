import { fireEvent, render, screen } from "@testing-library/react";
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
  });

  it("submits with keyboard shortcut and ignores typing Enter", () => {
    const state = props();
    render(<SubmitModal {...state} />);
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(state.onApply).toHaveBeenCalled();
    state.onApply.mockClear();
    const input = screen.getByLabelText("Входные данные");
    input.focus();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(state.onApply).not.toHaveBeenCalled();
  });

  it.each([
    ["success", "Все тесты прошли успешно!"],
    ["error", "Неверное решение."],
  ])("renders %s result", (result, text) => {
    render(<SubmitModal {...props({ submitResult: result as any })} />);
    expect(screen.getByText(text)).toBeInTheDocument();
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
