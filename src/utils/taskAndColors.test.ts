import { getTaskType } from "./taskType";
import { generateUserColor, getContrastColor, userColors } from "./userColors";

describe("task and colour helpers", () => {
  it("normalizes task types", () => {
    expect(getTaskType({ task_type: "paste" } as any)).toBe("paste");
    expect(getTaskType({ type: "Дополнение кода" } as any)).toBe("paste");
    expect(getTaskType(null)).toBe("code");
  });

  it("generates stable palette colours and readable contrast", () => {
    expect(userColors).toContain(generateUserColor("123"));
    expect(generateUserColor("123")).toBe(generateUserColor("123"));
    expect(getContrastColor("#ffffff")).toBe("#000000");
    expect(getContrastColor("#000000")).toBe("#FFFFFF");
  });
});
