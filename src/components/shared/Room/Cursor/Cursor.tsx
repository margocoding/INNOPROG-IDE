import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { Socket } from "socket.io-client";
import { RoomPermissions } from "../../../../types/room";
import "./Cursor.css";

interface RoomMember {
  telegramId: string;
  online: boolean;
  userColor?: string;
  username?: string;
}

interface CursorData {
  telegramId: string;
  position: [number, number];
  userColor: string;
  isYourself: boolean;
  username?: string;
  isOffline?: boolean;
}

interface WebSocketData {
  socket: Socket | null;
  isConnected: boolean;
  isJoinedRoom: boolean;
  roomMembers: RoomMember[];
  cursors: Map<string, CursorData>;
  selections: Map<
    string,
    {
      line?: number;
      column?: number;
      selectionStart?: { line: number; column: number };
      selectionEnd?: { line: number; column: number };
      selectedText?: string;
      userColor: string;
    }
  >;
  myUserColor: string;
  roomPermissions: RoomPermissions;
  sendCursorPosition: (position: [number, number]) => void;
  sendSelection: (selectionData: {
    line?: number;
    column?: number;
    selectionStart?: { line: number; column: number };
    selectionEnd?: { line: number; column: number };
    selectedText?: string;
  }) => void;
}

type LiveCursorsProps = {
  myTelegramId: string;
  roomId: string | null;
  webSocketData: WebSocketData;
};

const HIDDEN_CURSOR_POSITION: [number, number] = [-1, -1];

const getEditorView = (): EditorView | null => {
  const editorElement = document.querySelector<HTMLElement>(".cm-editor");
  if (!editorElement) return null;
  return EditorView.findFromDOM(editorElement);
};

const isHiddenPosition = (position: [number, number]) =>
  position[0] < 0 || position[1] < 0;

const isLegacyNormalizedPosition = (position: [number, number]) => {
  const [x, y] = position;
  return (
    x >= 0 &&
    x <= 1 &&
    y >= 0 &&
    y <= 1 &&
    (x < 1 || !Number.isInteger(y))
  );
};

const getCursorPixelPosition = (
  position: [number, number]
): { x: number; y: number } | null => {
  const view = getEditorView();
  if (!view) return null;

  if (isLegacyNormalizedPosition(position)) {
    const rect = view.dom.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: rect.left + position[0] * rect.width,
      y: rect.top + position[1] * rect.height,
    };
  }

  const lineNumber = Math.floor(position[0]);
  const rawColumn = Math.floor(position[1]);
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
    return null;
  }

  const line = view.state.doc.line(lineNumber);
  const column = Math.max(0, Math.min(rawColumn, line.length));
  const pos = line.from + column;
  const coords = view.coordsAtPos(pos);
  if (!coords) return null;

  return { x: coords.left, y: coords.top };
};

const darkenColor = (color: string, amount: number = 0.2): string => {
  const cleanColor =
    color && color.startsWith("#") ? color.replace("#", "") : "ff0000";

  const r = parseInt(cleanColor.substring(0, 2), 16);
  const g = parseInt(cleanColor.substring(2, 4), 16);
  const b = parseInt(cleanColor.substring(4, 6), 16);

  const newR = Math.round(r * (1 - amount));
  const newG = Math.round(g * (1 - amount));
  const newB = Math.round(b * (1 - amount));

  return `#${newR.toString(16).padStart(2, "0")}${newG
    .toString(16)
    .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
};

const SingleCursor = React.memo(
  ({ cursorData }: { cursorData: CursorData }) => {
    if (isHiddenPosition(cursorData.position)) {
      return null;
    }

    const pixelPosition = getCursorPixelPosition(cursorData.position);
    if (!pixelPosition) {
      return null;
    }

    const opacity = cursorData.isOffline ? 0.4 : 1;

    const hasUsername = !!cursorData.username;
    const displayName = cursorData.username || cursorData.telegramId;
    const truncatedName =
      displayName.length > 10
        ? `${displayName.substring(0, 10)}...`
        : displayName;

    const userColorDark = darkenColor(cursorData.userColor);

    return (
      <div
        className="live-cursor"
        style={
          {
            position: "fixed",
            left: pixelPosition.x,
            top: pixelPosition.y,
            pointerEvents: "none",
            zIndex: 10000,
            transform: "translateX(-2px) translateY(-2px)",
            opacity: opacity,
            transition: "opacity 0.3s ease-out",
            "--user-color": cursorData.userColor,
            "--user-color-dark": userColorDark,
          } as React.CSSProperties
        }
      >
        {/* Курсор-стрелка */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
          }}
        >
          <path
            d="M2 2L22 12L12 14L8 22L2 2Z"
            fill={cursorData.userColor}
            stroke="white"
            strokeWidth="1"
          />
        </svg>

        <div
          className={`live-cursor-label ${
            hasUsername ? "with-username" : "fallback"
          }`}
          style={{
            position: "absolute",
            top: "20px",
            left: "8px",
            backgroundColor: hasUsername
              ? cursorData.userColor
              : "rgba(0, 0, 0, 0.7)",
            color: "white",
            padding: "3px 8px",
            borderRadius: "6px",
            fontSize: "11px",
            fontWeight: hasUsername ? "600" : "400",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            maxWidth: "120px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            transition: "all 0.2s ease-out",
          }}
        >
          {truncatedName}
          {cursorData.isOffline && " (offline)"}
        </div>
      </div>
    );
  }
);

const Cursor: React.FC<LiveCursorsProps> = ({
  myTelegramId,
  roomId,
  webSocketData,
}) => {
  const { cursors, sendCursorPosition, isConnected, roomPermissions } =
    webSocketData;

  const lastSentTime = useRef(0);
  const lastPosition = useRef<[number, number] | null>(null);

  const throttledSendCursor = useCallback(
    (position: [number, number]) => {
      const now = Date.now();
      if (now - lastSentTime.current <= 33) {
        return;
      }

      const [newX, newY] = position;
      const [lastX, lastY] = lastPosition.current || HIDDEN_CURSOR_POSITION;

      if (newX === lastX && newY === lastY) {
        return;
      }

      sendCursorPosition(position);
      lastSentTime.current = now;
      lastPosition.current = position;
    },
    [sendCursorPosition]
  );

  useEffect(() => {
    if (!roomId || !isConnected) return;

    const handleMouseMove = (e: MouseEvent) => {
      const view = getEditorView();
      if (!view) {
        throttledSendCursor(HIDDEN_CURSOR_POSITION);
        return;
      }

      const editorRect = view.dom.getBoundingClientRect();
      const isInsideEditor =
        e.clientX >= editorRect.left &&
        e.clientX <= editorRect.right &&
        e.clientY >= editorRect.top &&
        e.clientY <= editorRect.bottom;

      if (!isInsideEditor) {
        throttledSendCursor(HIDDEN_CURSOR_POSITION);
        return;
      }

      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) {
        throttledSendCursor(HIDDEN_CURSOR_POSITION);
        return;
      }

      const line = view.state.doc.lineAt(pos);
      const column = pos - line.from;
      throttledSendCursor([line.number, column]);
    };

    const hideCursor = () => {
      throttledSendCursor(HIDDEN_CURSOR_POSITION);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("blur", hideCursor);
    document.addEventListener("mouseleave", hideCursor);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("blur", hideCursor);
      document.removeEventListener("mouseleave", hideCursor);
    };
  }, [roomId, isConnected, throttledSendCursor]);

  const cursorElements = useMemo(() => {
    if (!roomPermissions.studentCursorEnabled) {
      return [];
    }

    return Array.from(cursors.entries())
      .map(([id, cursorData]) => {
        if (id === myTelegramId) return null;

        return <SingleCursor key={id} cursorData={cursorData} />;
      })
      .filter(Boolean);
  }, [cursors, myTelegramId, roomPermissions.studentCursorEnabled]);

  if (!roomId) return null;

  return <>{cursorElements}</>;
};

export default React.memo(Cursor);
