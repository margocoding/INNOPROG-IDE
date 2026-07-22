import React, { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "./App.css";
import Cursor from "./components/shared/Room/Cursor/Cursor";
import IDE from "./components/shared/Code/IDE/IDE";
import { useWebSocket } from "./hooks/useWebSocket";
import { readRoomSessionBootstrap } from "./utils/roomSession";

const App = React.memo(() => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const roomBootstrap = useMemo(
    () => roomId ? readRoomSessionBootstrap(roomId) : null,
    [roomId],
  );
  const roomToken = roomBootstrap?.roomToken || null;
  const telegramWebAppUserId = roomId
    ? null
    : window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString();
  const urlTelegramId = roomId
    ? roomBootstrap?.telegramId || null
    : searchParams.get("telegramId");
  const savedTelegramId = localStorage.getItem("telegramId");
  const savedRoomClientId = roomId
    ? localStorage.getItem(`innoprog-room-client-id:${roomId}`)
    : null;
  const telegramId =
    (roomId
      ? urlTelegramId || savedRoomClientId
      : urlTelegramId || telegramWebAppUserId || savedTelegramId);

  useEffect(() => {
    if (roomId && urlTelegramId) {
      localStorage.removeItem(`innoprog-room-client-id:${roomId}`);
    }
  }, [roomId, urlTelegramId]);

  const webSocketParams = useMemo(
    () => ({
      socketUrl: process.env.REACT_APP_WS_URL || "https://ide.innoprog.ru",
      myTelegramId: telegramId,
      roomId,
      roomToken,
      roomLaunchCode: roomBootstrap?.launchCode || null,
    }),
    [telegramId, roomId, roomToken, roomBootstrap?.launchCode]
  );

  const webSocketData = useWebSocket(webSocketParams);

  return (
    <>
      <Cursor
        myTelegramId={webSocketData.telegramId || telegramId}
        roomId={roomId}
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
