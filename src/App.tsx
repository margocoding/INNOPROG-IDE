import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./App.css";
import Cursor from "./components/shared/Room/Cursor/Cursor";
import IDE from "./components/shared/Code/IDE/IDE";
import { useWebSocket } from "./hooks/useWebSocket";
import {
  readRoomSessionBootstrap,
  RoomSessionBootstrap,
} from "./utils/roomSession";

const App = React.memo(() => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const [capturedBootstrap, setCapturedBootstrap] = useState<{
    roomId: string | null;
    value: RoomSessionBootstrap | null;
  }>({ roomId: null, value: null });
  useLayoutEffect(() => {
    setCapturedBootstrap({
      roomId,
      value: roomId ? readRoomSessionBootstrap(roomId) : null,
    });
  }, [roomId]);
  const bootstrapReady = !roomId || capturedBootstrap.roomId === roomId;
  const roomBootstrap = bootstrapReady ? capturedBootstrap.value : null;
  const activeRoomId = bootstrapReady ? roomId : null;
  const roomToken = roomBootstrap?.roomToken || null;
  const authenticatedUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const authenticatedUsername = String(
    authenticatedUser?.first_name || authenticatedUser?.username || ""
  ).trim();
  const telegramWebAppUserId = activeRoomId
    ? null
    : window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString();
  const urlTelegramId = activeRoomId
    ? roomBootstrap?.telegramId || null
    : searchParams.get("telegramId");
  const savedTelegramId = localStorage.getItem("telegramId");
  const savedRoomClientId = activeRoomId
    ? localStorage.getItem(`innoprog-room-client-id:${activeRoomId}`)
    : null;
  const telegramId =
    (activeRoomId
      ? urlTelegramId || savedRoomClientId
      : urlTelegramId || telegramWebAppUserId || savedTelegramId);

  useEffect(() => {
    if (activeRoomId && urlTelegramId) {
      localStorage.removeItem(`innoprog-room-client-id:${activeRoomId}`);
    }
  }, [activeRoomId, urlTelegramId]);

  const webSocketParams = useMemo(
    () => ({
      socketUrl: process.env.REACT_APP_WS_URL || "https://ide.innoprog.ru",
      myTelegramId: telegramId,
      roomId: activeRoomId,
      roomToken,
      roomLaunchCode: roomBootstrap?.launchCode || null,
      suggestedUsername: authenticatedUsername || null,
    }),
    [authenticatedUsername, telegramId, activeRoomId, roomToken, roomBootstrap?.launchCode]
  );

  const webSocketData = useWebSocket(webSocketParams);

  return (
    <>
      <Cursor
        myTelegramId={webSocketData.telegramId || telegramId}
        roomId={activeRoomId}
        webSocketData={webSocketData}
      />
      <IDE
        webSocketData={webSocketData}
        telegramId={webSocketData.telegramId}
      />
    </>
  );
});

export default App;
