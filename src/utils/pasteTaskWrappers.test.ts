import { extractPasteRoomCode, pasteTaskWrappers, missingWrapperInsertions } from "./pasteTaskWrappers";

const task = { task_type: "paste", has_multiple_tests: false, has_public_example: true,
  answers: [{ code_before: "", code_after: 'print(-robot1)' }] } as any;

it("keeps suffix-only room wrappers out of learner code after rejoining", () => {
  const wrappers = pasteTaskWrappers(task);
  const full = wrappers.before + "class PurpleRobot: pass" + wrappers.after;
  expect(extractPasteRoomCode(full, task)).toBe("class PurpleRobot: pass");
  expect(extractPasteRoomCode(wrappers.after, task)).toBe("");
});

it("separates both protected blocks from a learner program without a final newline", () => {
  const prefixed = { ...task, answers: [{ code_before: "import math", code_after: "print(result)" }] };
  const wrappers = pasteTaskWrappers(prefixed);
  expect(wrappers.before).toBe("import math\n\n");
  expect(wrappers.after).toBe("\n\nprint(result)\n\n");
  expect(extractPasteRoomCode(wrappers.before + "result=1" + wrappers.after, prefixed)).toBe("result=1");
});

it("leaves wrapper-free saved learner code intact", () => {
  expect(extractPasteRoomCode("class PurpleRobot: pass", task)).toBe("class PurpleRobot: pass");
});

it("restores old room documents with raw prefix and padded suffix", () => {
  const oldTask = { ...task, answers: [{ code_before: "setup", code_after: "check" }] };
  expect(extractPasteRoomCode("setupsolutioncheck\n\n", oldTask)).toBe("solution");
  expect(extractPasteRoomCode("setupsolutioncheck", oldTask)).toBe("solution");
});

it("preserves the bounds of already-public multi-test collaborative documents", () => {
  const multi = { ...task, has_multiple_tests: true, answers: [{ code_before: "setup", code_after: "check" }] };
  expect(pasteTaskWrappers(multi)).toEqual({ before: "setup", after: "check\n\n" });
});

it("adds missing single-test bounds with insertions and is idempotent", () => {
  let source = "class PurpleRobot: pass";
  const { before, after } = pasteTaskWrappers(task);
  for (const insertion of missingWrapperInsertions(source, before, after)) {
    source = source.slice(0, insertion.index) + insertion.text + source.slice(insertion.index);
  }
  expect(source).toBe("class PurpleRobot: pass" + after);
  expect(missingWrapperInsertions(source, before, after)).toEqual([]);
});

it("normalizes an old suffix with trailing padding without duplicating it", () => {
  const { before, after } = pasteTaskWrappers(task);
  let source = "solutionprint(-robot1)\n\n";
  for (const insertion of missingWrapperInsertions(source, before, after)) {
    source = source.slice(0, insertion.index) + insertion.text + source.slice(insertion.index);
  }
  expect(source).toBe("solution" + after);
  expect(missingWrapperInsertions(source, before, after)).toEqual([]);
});
