import React, { useCallback, useEffect, useMemo, useRef } from "react";
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
    const pixelX = cursorData.position[0] * window.innerWidth;
    const pixelY = cursorData.position[1] * window.innerHeight;

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
            left: pixelX,
            top: pixelY,
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
  const { cursors, sendCursorPosition, isConnected, myUserColor, roomPermissions } =
    webSocketData;

  const lastSentTime = useRef(0);
  const lastPosition = useRef<[number, number] | null>(null);

  const throttledSendCursor = useCallback(
    (position: [number, number]) => {
      const now = Date.now();
      const [newX, newY] = position;
      const [lastX, lastY] = lastPosition.current || [0, 0];

      if (now - lastSentTime.current > 33) {
        const distance = Math.sqrt((newX - lastX) ** 2 + (newY - lastY) ** 2);

        if (distance > 0.005) {
          sendCursorPosition(position);
          lastSentTime.current = now;
          lastPosition.current = position;
        }
      }
    },
    [sendCursorPosition]
  );

  useEffect(() => {
    if (!roomId || !isConnected) return;

    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;

      throttledSendCursor([x, y]);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
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
