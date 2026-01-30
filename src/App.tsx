import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "./App.css";
import Cursor from "./components/shared/Room/Cursor/Cursor";
import IDE from "./components/shared/Code/IDE/IDE";
import { useWebSocket } from "./hooks/useWebSocket";

const App = React.memo(() => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const telegramId =
    searchParams.get("telegramId") ||
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() ||
    localStorage.getItem("telegramId");

  const webSocketParams = useMemo(
    () => ({
      socketUrl: process.env.REACT_APP_WS_URL || "https://ide.innoprog.ru",
      myTelegramId: telegramId,
      roomId,
    }),
    [telegramId, roomId]
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
