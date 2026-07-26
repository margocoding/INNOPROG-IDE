export interface RoomSessionBootstrap {
  telegramId: string | null;
  roomToken: string | null;
  launchCode: string | null;
}

const roomSessions = new Map<string, { telegramId: string; roomToken: string }>();
const roomBootstraps = new Map<string, RoomSessionBootstrap>();

export function saveRoomSession(roomId: string, telegramId: string, roomToken: string): void {
  roomSessions.set(roomId, { telegramId, roomToken });
}

export function clearRoomSessionToken(roomId: string): void {
  roomSessions.delete(roomId);
  roomBootstraps.delete(roomId);
}

export function clearRoomLaunchCode(roomId: string): void {
  const bootstrap = roomBootstraps.get(roomId);
  if (bootstrap) {
    roomBootstraps.set(roomId, { ...bootstrap, launchCode: null });
  }
}

export function readRoomSessionBootstrap(roomId: string): RoomSessionBootstrap {
  const captured = roomBootstraps.get(roomId);
  if (captured?.launchCode) {
    return captured;
  }

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

  const bootstrap = {
    telegramId: legacyTelegramId || memorySession?.telegramId || null,
    roomToken: legacyToken || memorySession?.roomToken || null,
    launchCode,
  };
  roomBootstraps.set(roomId, bootstrap);
  return bootstrap;
}
