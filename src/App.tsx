import React, { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "./App.css";
import Cursor from "./components/shared/Room/Cursor/Cursor";
import IDE from "./components/shared/Code/IDE/IDE";
import { useWebSocket } from "./hooks/useWebSocket";

const TELEGRAM_ID_STORAGE_KEY = "innoprog-telegram-id";

const App = React.memo(() => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const telegramIdFromUrl = searchParams.get("telegramId");
  const legacyTelegramId = localStorage.getItem("telegramId") || "";
  const telegramIdFromStorage =
    localStorage.getItem(TELEGRAM_ID_STORAGE_KEY) ||
    (/^\d+$/.test(legacyTelegramId) ? legacyTelegramId : "");
  const telegramIdFromWebApp =
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() || "";
  const telegramId =
    telegramIdFromUrl || telegramIdFromStorage || telegramIdFromWebApp || "";

  useEffect(() => {
    if (telegramIdFromUrl) {
      localStorage.setItem(TELEGRAM_ID_STORAGE_KEY, telegramIdFromUrl);
      return;
    }

    if (
      !localStorage.getItem(TELEGRAM_ID_STORAGE_KEY) &&
      /^\d+$/.test(legacyTelegramId)
    ) {
      localStorage.setItem(TELEGRAM_ID_STORAGE_KEY, legacyTelegramId);
    }
  }, [telegramIdFromUrl, legacyTelegramId]);

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
