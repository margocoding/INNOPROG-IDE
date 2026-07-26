import {
  clearRoomSessionToken,
  readRoomSessionBootstrap,
  saveRoomSession,
} from "./roomSession";

describe("room session bootstrap", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearRoomSessionToken("room-1");
    window.history.replaceState({}, "", "/");
  });

  it("moves legacy room credentials out of the URL immediately", () => {
    window.history.replaceState({}, "", "/?roomId=room-1&lang=py&telegramId=42&roomToken=secret-token");
    expect(readRoomSessionBootstrap("room-1")).toEqual({
      telegramId: "42", roomToken: "secret-token", launchCode: null,
    });
    expect(window.location.search).toBe("?roomId=room-1&lang=py");
    expect(window.location.href).not.toContain("secret-token");
  });

  it("takes a one-time launch code from the fragment and clears it", () => {
    window.history.replaceState({}, "", "/?roomId=room-1#launchCode=single-use-code");
    expect(readRoomSessionBootstrap("room-1").launchCode).toBe("single-use-code");
    expect(window.location.hash).toBe("");
  });

  it("keeps the captured launch code stable across React-style repeated reads", () => {
    window.history.replaceState({}, "", "/?roomId=room-strict#launchCode=single-use-code");

    expect(readRoomSessionBootstrap("room-strict").launchCode).toBe("single-use-code");
    expect(readRoomSessionBootstrap("room-strict").launchCode).toBe("single-use-code");
    expect(window.location.hash).toBe("");
  });

  it("stores credentials only for the browser session", () => {
    saveRoomSession("room-1", "42", "secret-token");
    expect(readRoomSessionBootstrap("room-1")).toEqual({
      telegramId: "42", roomToken: "secret-token", launchCode: null,
    });
    expect(window.localStorage.getItem("innoprog-room-token:room-1")).toBeNull();
    expect(window.sessionStorage.getItem("innoprog-room-token:room-1")).toBeNull();
  });
});
