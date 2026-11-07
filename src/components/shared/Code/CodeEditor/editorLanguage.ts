import { cpp } from "@codemirror/lang-cpp";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { dart } from "@codemirror/legacy-modes/mode/clike";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { StreamLanguage } from "@codemirror/language";
import { Language } from "../../../../types/task";

export function editorLanguage(language: string) {
  switch (language) {
    case Language.PY:
      return python();
    case Language.JS:
      return javascript();
    case Language.BASH:
      return StreamLanguage.define(shell);
    case Language.CPP:
      return cpp();
    case Language.JAVA:
      return java();
    case Language.SQL:
      return sql();
    case Language.DART:
      return StreamLanguage.define(dart);
    case Language.HTML:
      return html({
        autoCloseTags: true,
        selfClosingTags: true,
      });
    case Language.DOCKERFILE:
      return StreamLanguage.define(dockerFile);
    case Language.YAML:
      return StreamLanguage.define(yaml);
    default:
      return python();
  }
}
