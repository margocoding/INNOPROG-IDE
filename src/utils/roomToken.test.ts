import { getRoomTokenExpiration, isRoomTokenExpired } from "./roomToken";

const encodePayload = (payload: Record<string, unknown>) => {
  const encoded = window
    .btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `v1.${encoded}.signature`;
};

describe("roomToken helpers", () => {
  it("reads expiration from a room token payload", () => {
    const token = encodePayload({
      v: 1,
      room_id: "room-1",
      user_id: "7488194158",
      exp: 1782860469,
    });

    expect(getRoomTokenExpiration(token)).toBe(1782860469);
  });

  it("detects expired room tokens", () => {
    const token = encodePayload({ exp: 100 });

    expect(isRoomTokenExpired(token, 101)).toBe(true);
    expect(isRoomTokenExpired(token, 100)).toBe(true);
    expect(isRoomTokenExpired(token, 99)).toBe(false);
  });

  it("treats malformed tokens as not locally expired", () => {
    expect(getRoomTokenExpiration("bad-token")).toBeUndefined();
    expect(isRoomTokenExpired("bad-token", 101)).toBe(false);
  });
});
