import Prism from 'prismjs';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-dart';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-batch';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-diff';

const aliases = new Map([['c++', 'cpp'], ['shell', 'bash'], ['bat', 'batch']]);
const escapeCode = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlightDescriptionCode(text: string, language: string): string[] {
  const name = language.toLowerCase();
  const id = aliases.get(name) ?? name;
  const grammar = Object.prototype.hasOwnProperty.call(Prism.languages, id) && Prism.languages[id];
  if (!grammar || typeof grammar !== 'object') return text.split('\n').map(escapeCode);

  // Tokenize the complete block so multiline strings and comments keep their
  // colors, then give each rendered line its own balanced markup.
  const renderLines = (stream: Prism.TokenStream): string[] => {
    if (typeof stream === 'string') return stream.split('\n').map(escapeCode);
    if (stream instanceof Prism.Token) {
      return renderLines(stream.content).map(line =>
        Prism.Token.stringify(new Prism.Token(stream.type, line, stream.alias), id));
    }
    const lines = [''];
    for (const token of stream) {
      const [first, ...rest] = renderLines(token);
      lines[lines.length - 1] += first;
      lines.push(...rest);
    }
    return lines;
  };

  return renderLines(Prism.tokenize(text, grammar));
}
