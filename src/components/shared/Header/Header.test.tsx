import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Header from "./Header";
import { toast } from "react-toastify";

const mockOpen = jest.fn();
jest.mock("@heroui/react", () => ({
  useDisclosure: () => ({
    isOpen: true, onOpen: mockOpen, onOpenChange: jest.fn(),
  }),
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onPress, ...props }: any) => (
    <button onClick={onPress} {...props}>{children}</button>
  ),
}));
jest.mock("../../..", () => ({ isDesktop: () => true }));
jest.mock("react-toastify", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("../Room/Settings/Settings", () => ({
  __esModule: true, default: () => <div>settings</div>,
}));
jest.mock("../Room/StartFormModal/StartFormModal", () => ({
  __esModule: true,
  default: ({ onSendForm, currentUsername }: any) => (
    <button onClick={() => onSendForm(`${currentUsername || "New"} edited`)}>
      edit-profile
    </button>
  ),
}));

const members = [
  {
    telegramId: "self",
    username: "Self",
    online: true,
    isYourself: true,
    userColor: "#ff0000",
  },
  {
    telegramId: "other",
    username: "Other",
    online: false,
    isYourself: false,
    userColor: "#00ff00",
  },
] as any;

describe("Header", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("sorts members, opens editing and submits a changed name", () => {
    const onEditMember = jest.fn();
    render(
      <Header
        members={members}
        myTelegramId="self"
        roomId="room-1"
        isTeacher
        roomPermissions={{
          studentCursorEnabled: true,
          studentSelectionEnabled: true,
          studentEditCodeEnabled: true,
        }}
        onPermissionsChange={jest.fn()}
        onCompleteSession={jest.fn()}
        onEditMember={onEditMember}
      />,
    );
    expect(screen.getByText("settings")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Нажмите чтобы изменить имя"));
    expect(mockOpen).toHaveBeenCalled();
    fireEvent.click(screen.getByText("edit-profile"));
    expect(onEditMember).toHaveBeenCalledWith("Self edited", "self");
    expect(screen.getByText(/Всего: 2/)).toBeInTheDocument();
  });

  it("copies a clean student room link", async () => {
    render(
      <Header
        members={members}
        myTelegramId="self"
        roomId="room-1"
        isTeacher
        roomPermissions={{
          studentCursorEnabled: true,
          studentSelectionEnabled: true,
          studentEditCodeEnabled: true,
        }}
        onPermissionsChange={jest.fn()}
        onCompleteSession={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Поделиться"));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("roomId=room-1"),
    ));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Ссылка скопирована")
    );
  });

  it("renders a simple header without room collaboration controls", () => {
    render(<Header members={[]} />);
    expect(screen.getByAltText("INNOPROG")).toBeInTheDocument();
    expect(screen.queryByText("settings")).toBeNull();
  });
});
