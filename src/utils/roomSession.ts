export interface RoomSessionBootstrap {
  telegramId: string | null;
  roomToken: string | null;
  launchCode: string | null;
}

const tokenKey = (roomId: string) => `innoprog-room-token:${roomId}`;
const userKey = (roomId: string) => `innoprog-room-user:${roomId}`;

export function saveRoomSession(roomId: string, telegramId: string, roomToken: string): void {
  window.sessionStorage.setItem(tokenKey(roomId), roomToken);
  window.sessionStorage.setItem(userKey(roomId), telegramId);
}

export function clearRoomSessionToken(roomId: string): void {
  window.sessionStorage.removeItem(tokenKey(roomId));
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

  return {
    telegramId: legacyTelegramId || window.sessionStorage.getItem(userKey(roomId)),
    roomToken: legacyToken || window.sessionStorage.getItem(tokenKey(roomId)),
    launchCode,
  };
}
