import { fireEvent, render, screen } from "@testing-library/react";
import Cursor from "./Cursor";

const data = (overrides: Record<string, unknown> = {}) => ({
  socket: null,
  isConnected: true,
  isJoinedRoom: true,
  roomMembers: [],
  cursors: new Map(),
  selections: new Map(),
  myUserColor: "#fff",
  roomPermissions: {
    studentCursorEnabled: true,
    studentSelectionEnabled: true,
    studentEditCodeEnabled: true,
  },
  sendCursorPosition: jest.fn(),
  sendSelection: jest.fn(),
  ...overrides,
}) as any;

describe("Cursor", () => {
  it("renders remote cursors and sends normalized mouse positions", () => {
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    jest.spyOn(editor, "getBoundingClientRect").mockReturnValue({
      left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200,
    } as DOMRect);
    document.body.appendChild(editor);
    const ws = data({
      cursors: new Map([["other", {
        telegramId: "other",
        position: [0.5, 0.5],
        userColor: "#ff0000",
        isYourself: false,
        username: "Long username here",
      }]]),
    });
    render(<Cursor myTelegramId="self" roomId="room" webSocketData={ws} />);
    expect(screen.getByText("Long usern...")).toBeInTheDocument();
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
    expect(ws.sendCursorPosition).toHaveBeenCalledWith([0.5, 0.5]);
    editor.remove();
  });

  it("hides self, invalid and disabled cursors", () => {
    const ws = data({
      roomPermissions: {
        studentCursorEnabled: false,
        studentSelectionEnabled: true,
        studentEditCodeEnabled: true,
      },
      cursors: new Map([["self", {
        telegramId: "self", position: [-1, -1], userColor: "", isYourself: true,
      }]]),
    });
    const { container, rerender } = render(
      <Cursor myTelegramId="self" roomId="room" webSocketData={ws} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<Cursor myTelegramId="self" roomId={null} webSocketData={ws} />);
    expect(container).toBeEmptyDOMElement();
  });
});
