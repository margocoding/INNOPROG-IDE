import { python } from "@codemirror/lang-python";
import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { Language } from "../../../../types/task";

const optionalLanguages: Record<string, () => Promise<Extension>> = {
  [Language.JS]: () => import("@codemirror/lang-javascript").then(m => m.javascript()),
  [Language.BASH]: () => import("@codemirror/legacy-modes/mode/shell").then(m => StreamLanguage.define(m.shell)),
  [Language.CPP]: () => import("@codemirror/lang-cpp").then(m => m.cpp()),
  [Language.JAVA]: () => import("@codemirror/lang-java").then(m => m.java()),
  [Language.SQL]: () => import("@codemirror/lang-sql").then(m => m.sql()),
  [Language.DART]: () => import("@codemirror/legacy-modes/mode/clike").then(m => StreamLanguage.define(m.dart)),
  [Language.HTML]: () => import("@codemirror/lang-html").then(m => m.html({
    autoCloseTags: true,
    selfClosingTags: true,
  })),
  [Language.DOCKERFILE]: () => import("@codemirror/legacy-modes/mode/dockerfile").then(m => StreamLanguage.define(m.dockerFile)),
  [Language.YAML]: () => import("@codemirror/legacy-modes/mode/yaml").then(m => StreamLanguage.define(m.yaml)),
};

const loaded = new Map<string, Extension>([[Language.PY, python()]]);

export function editorLanguage(language: string): Extension | Promise<Extension> {
  const current = loaded.get(language);
  if (current) return current;
  if (!Object.prototype.hasOwnProperty.call(optionalLanguages, language)) return python();

  return optionalLanguages[language]().then(extension => {
    loaded.set(language, extension);
    return extension;
  });
}
