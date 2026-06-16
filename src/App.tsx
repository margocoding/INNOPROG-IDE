import React, { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "./App.css";
import Cursor from "./components/shared/Room/Cursor/Cursor";
import IDE from "./components/shared/Code/IDE/IDE";
import { useWebSocket } from "./hooks/useWebSocket";

const App = React.memo(() => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const telegramWebAppUserId = roomId
    ? null
    : window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString();
  const urlTelegramId = searchParams.get("telegramId");
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

  useEffect(() => {
    if (roomId || window.Telegram?.WebApp) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script.onload = null;
      script.onerror = null;
    };

    script.onload = cleanup;
    script.onerror = cleanup;

    const timeoutId = window.setTimeout(() => {
      cleanup();
      script.remove();
    }, 1500);

    document.head.appendChild(script);

    return () => {
      cleanup();
      script.remove();
    };
  }, [roomId]);

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
