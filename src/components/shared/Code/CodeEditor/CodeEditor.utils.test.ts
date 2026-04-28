import { Language } from "../../../../types/task";
import {
  getLanguageFromFileName,
  mergeImportedCode,
  normalizeImportedCode,
  shouldReplaceCurrentCodeOnImport,
} from "./CodeEditor.utils";

describe("CodeEditor import helpers", () => {
  it("detects editor languages by file extension", () => {
    expect(getLanguageFromFileName("solution.py")).toBe(Language.PY);
    expect(getLanguageFromFileName("index.HTML")).toBe(Language.HTML);
    expect(getLanguageFromFileName("main.cpp")).toBe(Language.CPP);
    expect(getLanguageFromFileName("README.md")).toBeNull();
  });

  it("normalizes imported file line endings", () => {
    expect(normalizeImportedCode("\uFEFFprint(1)\r\nprint(2)\r")).toBe(
      "print(1)\nprint(2)\n"
    );
  });

  it("replaces empty or comment-only placeholders", () => {
    expect(shouldReplaceCurrentCodeOnImport("")).toBe(true);
    expect(shouldReplaceCurrentCodeOnImport("# Напишите код здесь")).toBe(true);
    expect(shouldReplaceCurrentCodeOnImport("#!/bin/bash")).toBe(true);
    expect(shouldReplaceCurrentCodeOnImport("#include <iostream>")).toBe(false);
    expect(shouldReplaceCurrentCodeOnImport("print(1)")).toBe(false);
  });

  it("replaces the default html starter template", () => {
    expect(
      shouldReplaceCurrentCodeOnImport(
        "<h1>Привет, HTML!</h1>\n<p>Начните редактировать код слева.</p>"
      )
    ).toBe(true);
  });

  it("inserts imported code at the first position when current code is placeholder", () => {
    expect(mergeImportedCode("# Напишите код здесь", "print(1)")).toEqual({
      code: "print(1)\n",
      insertedFrom: 0,
      replacedCurrentCode: true,
    });
  });

  it("appends imported code from the left edge after existing real code", () => {
    expect(mergeImportedCode("print(1)", "print(2)")).toEqual({
      code: "print(1)\nprint(2)\n",
      insertedFrom: "print(1)\n".length,
      replacedCurrentCode: false,
    });
  });
});
