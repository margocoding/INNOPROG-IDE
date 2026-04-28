import { Language } from "../../../../types/task";

export const CODE_FILE_ACCEPT = [
  ".py",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".json",
  ".java",
  ".cpp",
  ".cc",
  ".cxx",
  ".c",
  ".h",
  ".hpp",
  ".sql",
  ".sh",
  ".bash",
  ".dart",
  ".txt",
  ".md",
  ".xml",
  ".yaml",
  ".yml",
].join(",");

const languageByExtension: Record<string, Language> = {
  py: Language.PY,
  js: Language.JS,
  jsx: Language.JS,
  ts: Language.JS,
  tsx: Language.JS,
  html: Language.HTML,
  htm: Language.HTML,
  java: Language.JAVA,
  cpp: Language.CPP,
  cc: Language.CPP,
  cxx: Language.CPP,
  c: Language.CPP,
  h: Language.CPP,
  hpp: Language.CPP,
  sql: Language.SQL,
  sh: Language.BASH,
  bash: Language.BASH,
  dart: Language.DART,
};

export interface ImportedCodeMergeResult {
  code: string;
  insertedFrom: number;
  replacedCurrentCode: boolean;
}

export const getLanguageFromFileName = (fileName: string): Language | null => {
  const extension = fileName.trim().toLocaleLowerCase().split(".").pop();

  if (!extension || extension === fileName) {
    return null;
  }

  return languageByExtension[extension] || null;
};

export const normalizeImportedCode = (code: string): string =>
  code.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const ensureTrailingEditorLine = (code: string): string =>
  code.endsWith("\n") ? code : `${code}\n`;

const isCommentLine = (line: string): boolean => {
  const trimmedLine = line.trim();

  return (
    /^#(?!include\b|define\b|ifdef\b|ifndef\b|endif\b|pragma\b).*$/.test(
      trimmedLine
    ) ||
    /^\/\/.*$/.test(trimmedLine) ||
    /^--.*$/.test(trimmedLine) ||
    /^<!--.*-->$/.test(trimmedLine) ||
    /^\/\*.*\*\/$/.test(trimmedLine)
  );
};

const isDefaultHtmlTemplate = (code: string): boolean =>
  code.includes("Привет, HTML!") &&
  code.includes("Начните редактировать код слева.");

export const shouldReplaceCurrentCodeOnImport = (code: string): boolean => {
  const normalizedCode = normalizeImportedCode(code);
  const nonEmptyLines = normalizedCode
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (nonEmptyLines.length === 0) {
    return true;
  }

  if (isDefaultHtmlTemplate(normalizedCode)) {
    return true;
  }

  return nonEmptyLines.every(isCommentLine);
};

export const mergeImportedCode = (
  currentCode: string,
  importedCode: string
): ImportedCodeMergeResult => {
  const normalizedCurrentCode = normalizeImportedCode(currentCode);
  const normalizedImportedCode = ensureTrailingEditorLine(
    normalizeImportedCode(importedCode)
  );

  if (shouldReplaceCurrentCodeOnImport(normalizedCurrentCode)) {
    return {
      code: normalizedImportedCode,
      insertedFrom: 0,
      replacedCurrentCode: true,
    };
  }

  const currentCodeBody = normalizedCurrentCode.replace(/\s+$/g, "");
  const importedCodeBody = normalizedImportedCode.replace(/^\n+/g, "");
  const separator = currentCodeBody ? "\n" : "";

  return {
    code: `${currentCodeBody}${separator}${importedCodeBody}`,
    insertedFrom: currentCodeBody.length + separator.length,
    replacedCurrentCode: false,
  };
};
