import { Language } from "../types/task";
import { resolveTaskLanguage } from "./taskLanguage";

describe("resolveTaskLanguage", () => {
  it.each(["230001", "230073", "330001", "330052"])(
    "defaults Java course task %s to Java",
    (taskId) => {
      expect(resolveTaskLanguage(taskId, null)).toBe(Language.JAVA);
    }
  );

  it("keeps an explicitly selected language", () => {
    expect(resolveTaskLanguage("230001", Language.CPP)).toBe(Language.CPP);
  });

  it("keeps Python as the default outside the Java modules", () => {
    expect(resolveTaskLanguage("20311", null)).toBe(Language.PY);
  });
});
