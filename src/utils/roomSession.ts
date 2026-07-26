export interface RoomSessionBootstrap {
  telegramId: string | null;
  roomToken: string | null;
  launchCode: string | null;
}

const roomSessions = new Map<string, { telegramId: string; roomToken: string }>();

export function saveRoomSession(roomId: string, telegramId: string, roomToken: string): void {
  roomSessions.set(roomId, { telegramId, roomToken });
}

export function clearRoomSessionToken(roomId: string): void {
  roomSessions.delete(roomId);
}

export function readRoomSessionBootstrap(roomId: string): RoomSessionBootstrap {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const launchCode = fragment.get("launchCode");
  const legacyToken = url.searchParams.get("roomToken") || fragment.get("roomToken");
  const legacyTelegramId = url.searchParams.get("telegramId") || fragment.get("telegramId");

  if (legacyToken && legacyTelegramId) {
    saveRoomSession(roomId, legacyTelegramId, legacyToken);
  }

  url.searchParams.delete("roomToken");
  url.searchParams.delete("telegramId");
  fragment.delete("launchCode");
  fragment.delete("roomToken");
  fragment.delete("telegramId");
  const sanitizedFragment = fragment.toString();
  url.hash = sanitizedFragment ? `#${sanitizedFragment}` : "";
  window.history.replaceState(window.history.state, "", url.toString());
  const memorySession = roomSessions.get(roomId);

  return {
    telegramId: legacyTelegramId || memorySession?.telegramId || null,
    roomToken: legacyToken || memorySession?.roomToken || null,
    launchCode,
  };
}
