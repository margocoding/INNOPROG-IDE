import { api } from "./api";

jest.mock("./api", () => ({
  api: { getTask: jest.fn(), getSubmitCode: jest.fn() },
}));

function startup() {
  let module!: typeof import("./initialTask");
  jest.isolateModules(() => { module = require("./initialTask"); });
  return module;
}

describe("early task loading", () => {
  const originalSelf = window.self;
  const originalReferrer = document.referrer;

  beforeEach(() => {
    jest.clearAllMocks();
    (api.getTask as jest.Mock).mockImplementation(() => Promise.resolve({ id: 10006 }));
    (api.getSubmitCode as jest.Mock).mockImplementation(() => Promise.resolve({ code: "print(1)" }));
    Object.defineProperty(window, "self", { configurable: true, value: {} });
    Object.defineProperty(document, "referrer", { configurable: true, value: "https://app.innoprog.ru/" });
    window.history.replaceState(null, "", "/?task_id=10006&client_id=42&answer_id=first&platforma=app#launch_code=sample&target_service=ide");
  });

  afterEach(() => {
    Object.defineProperty(window, "self", { configurable: true, value: originalSelf });
    Object.defineProperty(document, "referrer", { configurable: true, value: originalReferrer });
    window.history.replaceState(null, "", "/");
  });

  it("shares the eager reads with the editor for the same launch", async () => {
    const { prefetchEmbeddedTask, getInitialTask, getInitialCode } = startup();
    prefetchEmbeddedTask();
    expect(api.getTask).toHaveBeenCalledWith("10006", "42", true);
    expect(api.getSubmitCode).toHaveBeenCalledWith("first", 42, 10006);
    await expect(getInitialTask("10006", "42", true)).resolves.toEqual({ id: 10006 });
    await expect(getInitialCode("first", 42, 10006)).resolves.toEqual({ code: "print(1)" });
    expect(api.getTask).toHaveBeenCalledTimes(1);
    expect(api.getSubmitCode).toHaveBeenCalledTimes(1);
  });

  it("reloads when the route or answer changes before hydration", async () => {
    const { prefetchEmbeddedTask, getInitialTask, getInitialCode } = startup();
    prefetchEmbeddedTask();
    await getInitialTask("10007", "42", true);
    await getInitialCode("second", 42, 10007);
    expect(api.getTask).toHaveBeenLastCalledWith("10007", "42", true);
    expect(api.getSubmitCode).toHaveBeenLastCalledWith("second", 42, 10007);
  });

  it("skips speculative reads when the editor has already started", async () => {
    const { prefetchEmbeddedTask, getInitialTask } = startup();
    await getInitialTask("10006", "42", true);
    prefetchEmbeddedTask();
    expect(api.getTask).toHaveBeenCalledTimes(1);
    expect(api.getSubmitCode).not.toHaveBeenCalled();
  });

  it("ignores a launch from a different origin", () => {
    Object.defineProperty(document, "referrer", { configurable: true, value: "https://example.test/" });
    startup().prefetchEmbeddedTask();
    expect(api.getTask).not.toHaveBeenCalled();
    expect(api.getSubmitCode).not.toHaveBeenCalled();
  });
});
