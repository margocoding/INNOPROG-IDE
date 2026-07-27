import { postToParent, resolveParentOrigin } from "./parentMessaging";

describe("parent messaging", () => {
  const originalParentOrigin = process.env.REACT_APP_PARENT_APP_ORIGIN;
  const originalAllowedOrigins = process.env.REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS;
  const originalParent = window.parent;

  afterEach(() => {
    process.env.REACT_APP_PARENT_APP_ORIGIN = originalParentOrigin;
    process.env.REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS = originalAllowedOrigins;
    window.history.replaceState({}, "", "/");
    Object.defineProperty(window, "parent", { configurable: true, value: originalParent });
  });

  it("canonicalizes and accepts an explicitly allowed parent origin", () => {
    process.env.REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS = "https://trusted.example/embed/,not-a-url";
    window.history.replaceState({}, "", "/?parent_origin=https%3A%2F%2Ftrusted.example%2Flesson%2F1");
    expect(resolveParentOrigin()).toBe("https://trusted.example");
  });

  it("fails closed for a hostile or missing parent origin", () => {
    process.env.REACT_APP_PARENT_APP_ORIGIN = "";
    process.env.REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS = "";
    window.history.replaceState({}, "", "/?parent_origin=https%3A%2F%2Fevil.example");
    expect(resolveParentOrigin()).toBe("");
    expect(postToParent({ type: "secret" })).toBe(false);
  });

  it("posts only to the resolved exact origin", () => {
    const postMessage = jest.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage },
    });
    window.history.replaceState({}, "", "/?parent_origin=https%3A%2F%2Fapp.innoprog.ru%2Ftasks");

    expect(postToParent({ type: "ide-ready" })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { type: "ide-ready" },
      "https://app.innoprog.ru",
    );
  });
});
