import axios from "axios";
import { api } from "./api";

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
  beforeEach(() => jest.clearAllMocks());

  it("loads tasks", async () => {
    mockedAxios.get.mockResolvedValue({ data: { id: 1 } });
    window.location.hash = "platform_auth=signed-token";
    await expect(api.getTask("1", "42")).resolves.toEqual({ id: 1 });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "https://api.innoprog.ru/task/1",
      expect.objectContaining({
        params: { client_id: "42" },
        headers: { "X-Platform-Auth": "signed-token" },
      }),
    );
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
      "X-Platform-Auth": "signed-token",
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
