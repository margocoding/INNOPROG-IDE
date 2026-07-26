import axios from "axios";
import { api, clearPlatformAccessSession } from "./api";

jest.mock("axios", () => {
  const post = jest.fn();
  return {
    __esModule: true,
    default: {
      get: jest.fn(),
      create: jest.fn(() => ({ post })),
      __post: post,
    },
  };
});

const mockedAxios = axios as jest.Mocked<typeof axios> & { __post: jest.Mock };

describe("IDE API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPlatformAccessSession();
    window.history.replaceState({}, "", "/");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "short-access-token" }),
    } as any);
  });

  it("loads tasks", async () => {
    mockedAxios.get.mockResolvedValue({ data: { id: 1 } });
    window.location.hash = "launch_code=one-time-code&target_service=ide";
    await expect(api.getTask("1", "42")).resolves.toEqual({ id: 1 });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "https://api.innoprog.ru/task/1",
      expect.objectContaining({
        params: { client_id: "42" },
        headers: { Authorization: "Bearer short-access-token" },
      }),
    );
  });

  it("loads the explicit localhost task preview without production auth", async () => {
    window.history.replaceState(
      {},
      "",
      "/?task_id=10006&local_task_preview=10006",
    );

    await expect(api.getTask("10006", "42")).resolves.toMatchObject({
      id: 10006,
      title: "Сумма чисел от a до b",
      answers: [
        expect.objectContaining({
          input: "1\n16",
          output: "136",
        }),
      ],
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("silently refreshes the cookie session and retries a task after access-token expiry", async () => {
    mockedAxios.get
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ data: { id: 1, title: "Recovered task" } });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "launch-access-token" }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "refreshed-access-token" }),
      } as any);
    window.location.hash = "launch_code=one-time-code&target_service=ide";

    await expect(api.getTask("1", "42")).resolves.toEqual({
      id: 1,
      title: "Recovered task",
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://api.innoprog.ru/platform/session/launch/exchange",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.any(String),
      }),
    );
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      launch_code: "one-time-code",
      target_service: "ide",
      browser_nonce: expect.any(String),
    });
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.innoprog.ru/platform/session/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      "https://api.innoprog.ru/task/1",
      expect.objectContaining({
        headers: { Authorization: "Bearer launch-access-token" },
      }),
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      "https://api.innoprog.ru/task/1",
      expect.objectContaining({
        headers: { Authorization: "Bearer refreshed-access-token" },
      }),
    );
    expect(window.location.hash).toBe("");
  });

  it("does not retry non-authentication task failures", async () => {
    const failure = { response: { status: 500 } };
    mockedAxios.get.mockRejectedValueOnce(failure);

    await expect(api.getTask("1", "42")).rejects.toBe(failure);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("checks, runs and submits code through the configured client", async () => {
    const post = (axios as any).__post as jest.Mock;
    post
      .mockResolvedValueOnce({ data: { result: true } })
      .mockResolvedValueOnce({ data: { output: "ok" } })
      .mockResolvedValueOnce({ data: { saved: true } })
      .mockResolvedValueOnce({ data: { result: false }, status: 422 });
    await expect(api.checkCode({} as any, "py")).resolves.toEqual({ result: true });
    await expect(api.runCode({} as any, "sql")).resolves.toEqual({ output: "ok" });
    expect(post.mock.calls[1][0]).toBe("/code/run/sqlite");
    await expect(api.submitCode({} as any)).resolves.toEqual({ saved: true });
    await expect(api.checkTaskAnswer(3, {} as any)).resolves.toEqual({
      result: false, status: 422,
    });
    expect(post.mock.calls[3][2].headers).toEqual(expect.objectContaining({
      Authorization: "Bearer short-access-token",
    }));
  });

  it("loads submitted code with URL encoded parameters", async () => {
    const json = jest.fn().mockResolvedValue({ program: "print(1)" });
    global.fetch = jest.fn().mockResolvedValue({ json } as any);
    await expect(api.getSubmitCode("a b", 2, 3)).resolves.toEqual({
      program: "print(1)",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("answer_id=a+b&user_id=2&task_id=3"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
