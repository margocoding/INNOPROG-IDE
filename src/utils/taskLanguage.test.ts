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

  it.each(["360145", "360155"])(
    "defaults Dockerfile task %s to Dockerfile",
    (taskId) => expect(resolveTaskLanguage(taskId, null)).toBe(Language.DOCKERFILE),
  );

  it.each(["360156", "360168"])(
    "defaults Compose task %s to YAML",
    (taskId) => expect(resolveTaskLanguage(taskId, null)).toBe(Language.YAML),
  );

  it("does not let a stale launcher language override a configuration task", () => {
    expect(resolveTaskLanguage("360145", Language.PY)).toBe(Language.DOCKERFILE);
    expect(resolveTaskLanguage("360156", Language.PY)).toBe(Language.YAML);
  });
});
