import { fireEvent, render, screen } from "@testing-library/react";
import StartFormModal from "./StartFormModal";

jest.mock("@heroui/react", () => ({
  Modal: ({ children }: any) => <div>{children}</div>,
  ModalContent: ({ children }: any) => <div>{children}</div>,
  ModalHeader: ({ children }: any) => <div>{children}</div>,
  ModalBody: ({ children }: any) => <div>{children}</div>,
  ModalFooter: ({ children }: any) => <div>{children}</div>,
  Input: (props: any) => <input {...props} />,
  Button: ({ children, onPress }: any) => <button onClick={onPress}>{children}</button>,
}));

describe("StartFormModal", () => {
  it("prefills, edits and saves a trimmed username", () => {
    const send = jest.fn();
    const change = jest.fn();
    render(
      <StartFormModal
        isOpen
        onOpen={jest.fn()}
        onOpenChange={change}
        onSendForm={send}
        currentUsername="Old"
      />,
    );
    const input = screen.getByPlaceholderText("Введите имя");
    expect(input).toHaveValue("Old");
    fireEvent.change(input, { target: { value: " Alice " } });
    fireEvent.keyUp(input, { key: "Enter" });
    expect(send).toHaveBeenCalledWith("Alice");
    expect(localStorage.getItem("innoprog-username")).toBe("Alice");
    expect(change).toHaveBeenCalledWith(false);
  });

  it("does not submit an empty username", () => {
    const send = jest.fn();
    render(
      <StartFormModal
        isOpen
        onOpen={jest.fn()}
        onOpenChange={jest.fn()}
        onSendForm={send}
      />,
    );
    fireEvent.click(screen.getByText("Сохранить"));
    expect(send).not.toHaveBeenCalled();
  });
});
