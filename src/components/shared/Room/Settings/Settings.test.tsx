import { fireEvent, render, screen } from "@testing-library/react";
import Settings from "./Settings";

jest.mock("@heroui/react", () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onPress, ...props }: any) => (
    <button onClick={onPress} {...props}>{children}</button>
  ),
  Switch: ({ isSelected, onValueChange, isDisabled }: any) => (
    <input
      type="checkbox"
      checked={isSelected}
      disabled={isDisabled}
      onChange={(event) => onValueChange(event.target.checked)}
    />
  ),
}));

const permissions = {
  studentCursorEnabled: true,
  studentSelectionEnabled: false,
  studentEditCodeEnabled: true,
};

describe("Settings", () => {
  it("changes individual permissions and completes a teacher session", () => {
    const onPermissionsChange = jest.fn();
    const onCompleteSession = jest.fn();
    render(
      <Settings
        isTeacher
        completedSession={false}
        roomPermissions={permissions}
        onPermissionsChange={onPermissionsChange}
        onCompleteSession={onCompleteSession}
      />,
    );
    const toggles = screen.getAllByRole("checkbox");
    fireEvent.click(toggles[1]);
    expect(onPermissionsChange).toHaveBeenCalledWith({
      ...permissions, studentSelectionEnabled: true,
    });
    fireEvent.click(screen.getByText("Завершить сессию"));
    expect(onCompleteSession).toHaveBeenCalled();
  });

  it("disables settings for a completed student", () => {
    render(
      <Settings
        isTeacher={false}
        completedSession
        roomPermissions={permissions}
        onPermissionsChange={jest.fn()}
        onCompleteSession={jest.fn()}
      />,
    );
    expect(screen.getAllByRole("checkbox").every((item) => item.hasAttribute("disabled")))
      .toBe(true);
    expect(screen.queryByText("Завершить сессию")).toBeNull();
  });
});
