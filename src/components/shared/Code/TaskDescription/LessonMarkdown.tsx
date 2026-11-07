import { Marked, MarkedExtension, Renderer, Tokens } from 'marked';
import markedFootnote from 'marked-footnote';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
import { MouseEvent, useId, useMemo, useState } from 'react';
import './LessonMarkdown.css';

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const renderer = new Renderer();
const languageNames = new Map([
  ['py', 'Python'], ['python', 'Python'], ['cpp', 'C++'], ['c++', 'C++'],
  ['js', 'JavaScript'], ['javascript', 'JavaScript'], ['ts', 'TypeScript'], ['typescript', 'TypeScript'],
  ['java', 'Java'], ['sh', 'Shell'], ['bash', 'Bash'], ['shell', 'Shell'],
  ['sql', 'SQL'], ['html', 'HTML'], ['css', 'CSS'], ['dart', 'Dart'],
  ['json', 'JSON'], ['yaml', 'YAML'], ['yml', 'YAML'], ['md', 'Markdown'],
]);
renderer.code = ({ text, lang }) => {
  const language = lang?.trim().split(/\s+/, 1)[0] || '';
  const name = languageNames.get(language.toLowerCase()) ?? (language || 'Код');
  return `<div class="lesson-markdown-code"><div class="lesson-markdown-code-toolbar">
    <span>${escapeText(name)}</span><button type="button" data-copy-code>
      <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg>
      Копировать
    </button></div><pre><code>${escapeText(text)}</code></pre></div>`;
};
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;');
renderer.html = ({ text, block }) => {
  const tag = text.trim();
  if (!block && /^<\/?u>$/i.test(tag)) return tag.toLowerCase();
  if (block && /^<\/details>$/i.test(tag)) return '</details>';
  const summary = block && /^<details>[ \t\n]*<summary>([^\n]*)<\/summary>$/i.exec(tag);
  if (summary) return `<details><summary>${escapeText(summary[1])}</summary>`;
  return escapeText(text);
};
renderer.image = ({ href, text }) => {
  if (!/^https:\/\//i.test(href)) return escapeText(text);
  return `<img src="${escapeAttribute(href)}" alt="${escapeAttribute(text)}" loading="lazy" referrerpolicy="no-referrer">`;
};
renderer.link = function ({ href, tokens }) {
  const label = this.parser.parseInline(tokens);
  if (!/^https?:\/\//i.test(href)) return label;
  return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
};
const highlight: MarkedExtension = {
  extensions: [{
    name: 'lessonMark',
    level: 'inline',
    start: source => source.indexOf('=='),
    tokenizer(source) {
      const match = /^==([^=\n]+)==/.exec(source);
      if (match) return { type: 'lessonMark', raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
    },
    childTokens: ['tokens'],
    renderer(token) { return `<mark>${this.parser.parseInline(token.tokens as Tokens.Generic[])}</mark>`; },
  }],
};

export function LessonMarkdown({ source }: { source: string }) {
  const id = useId().replace(/[^a-z0-9_-]/gi, '');
  const footnotePrefix = `lesson-${id}-footnote-`;
  const html = useMemo(() => {
    try {
      const markdown = new Marked(
        { renderer, breaks: true },
        highlight,
        markedKatex({ throwOnError: false, trust: false, maxExpand: 300, maxSize: 10 }),
        markedFootnote({ prefixId: footnotePrefix, description: 'Сноски', backRefLabel: 'К ссылке на сноску' }),
      );
      return markdown.parse(source, { async: false });
    } catch { return null; }
  }, [source, footnotePrefix]);
  const [message, setMessage] = useState('');
  const copyCode = async (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    const href = anchor?.getAttribute('href');
    if (href?.startsWith('#' + footnotePrefix)) {
      event.preventDefault();
      const note = document.getElementById(href.slice(1));
      if (note && event.currentTarget.contains(note)) {
        note.tabIndex = -1;
        note.focus({ preventScroll: true });
        note.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    const button = target.closest('button[data-copy-code]');
    const code = button?.closest('.lesson-markdown-code')?.querySelector('pre code');
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      setMessage('Код скопирован');
    } catch {
      setMessage('Не удалось скопировать код');
    }
  };
  return html === null
    ? <div className="whitespace-pre-wrap break-words">{source}</div>
    : <div className="lesson-markdown">
      <div className="break-words [&>:first-child]:mt-0 [&>:last-child]:mb-0" onClick={copyCode} dangerouslySetInnerHTML={{ __html: html }} />
      <div className="lesson-markdown-copy-status" role="status">{message}</div>
    </div>;
}
