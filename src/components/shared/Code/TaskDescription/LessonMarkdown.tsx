import { Marked, Renderer, type MarkedExtension, type Tokens } from 'marked';
import markedFootnote from 'marked-footnote';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
import { MouseEvent, useId, useMemo, useState } from 'react';
import './LessonMarkdown.css';
import { highlightDescriptionCode } from './DescriptionSyntax';
import { callout, escapeAttribute, escapeText, imageMarkup, lessonDialect, mathOptions, safeLessonHtml } from './LessonMarkdownExtensions';

const languageNames = new Map([
  ['py', 'Python'], ['python', 'Python'], ['cpp', 'C++'], ['c++', 'C++'],
  ['js', 'JavaScript'], ['javascript', 'JavaScript'], ['ts', 'TypeScript'], ['typescript', 'TypeScript'],
  ['java', 'Java'], ['sh', 'Shell'], ['bash', 'Bash'], ['shell', 'Shell'],
  ['sql', 'SQL'], ['html', 'HTML'], ['css', 'CSS'], ['dart', 'Dart'],
  ['json', 'JSON'], ['yaml', 'YAML'], ['yml', 'YAML'], ['md', 'Markdown'], ['markdown', 'Markdown'],
  ['bat', 'Windows CMD'], ['powershell', 'PowerShell'], ['mermaid', 'Mermaid'], ['plantuml', 'PlantUML'], ['dot', 'Graphviz DOT'], ['diff', 'Diff'],
]);
function lessonHtml(source: string, prefix: string, defaultLanguage: string) {
  const renderer = new Renderer();
  const headings: { level: number; id: string; title: string }[] = [];
  const headingIds = new Set<string>();
  const abbreviations = new Map<string, string>();
  const inlineNotes: string[] = [];
  const tocMarker = `<!--${prefix}toc-->`;

  renderer.code = ({ text, lang }) => {
    const language = lang?.trim().split(/\s+/, 1)[0] || '';
    const name = languageNames.get(language.toLowerCase()) ?? (language || 'Код');
    const filename = /(?:^|\s)title="([^"\n]{1,100})"/.exec(lang ?? '')?.[1];
    const lineStart = /(?:^|\s)linenums="([1-9]\d{0,4})"/.exec(lang ?? '')?.[1];
    const highlighted = new Set(/(?:^|\s)hl_lines="([\d ]{1,100})"/.exec(lang ?? '')?.[1].trim().split(/ +/).map(Number));
    const formatted = Boolean(lineStart || highlighted.size);
    const lines = highlightDescriptionCode(text, language || defaultLanguage);
    const gutter = lineStart ? Math.max(2, String(Number(lineStart) + lines.length - 1).length) : 0;
    const attributes = formatted ? ` class="lesson-markdown-code-lines"${gutter ? ` style="--lesson-code-number-width:${gutter}ch"` : ''}` : '';
    const code = formatted ? lines.map((line, index) => {
      const number = lineStart ? ` data-line-number="${Number(lineStart) + index}"` : '';
      const emphasis = highlighted.has(index + 1) ? ' lesson-markdown-highlight-line' : '';
      return `<span class="lesson-markdown-code-line${emphasis}"${number}>${line}</span>`;
    }).join('\n') : lines.join('\n');
    return `<div class="lesson-markdown-code"><div class="lesson-markdown-code-toolbar">
      <span>${escapeText(name)}${filename ? `, ${escapeText(filename)}` : ''}</span><button type="button" data-copy-code>
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg>
        Копировать
      </button></div><pre class="description-syntax"><code${attributes}>${code}</code></pre></div>`;
  };

  renderer.html = ({ text }) => safeLessonHtml(text);
  renderer.image = ({ href, text, title }) => imageMarkup(href, text, title);
  renderer.link = function ({ href, title, tokens }) {
    const label = this.parser.parseInline(tokens);
    const tooltip = title ? ` title="${escapeAttribute(title)}"` : '';
    if (href.startsWith('#')) {
      let anchor = href.slice(1);
      try { anchor = decodeURIComponent(anchor); } catch { return label; }
      return anchor ? `<a href="#${escapeAttribute(prefix + anchor)}"${tooltip}>${label}</a>` : label;
    }
    if (/^https?:\/\/[^\s/]/i.test(href)) {
      return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer"${tooltip}>${label}</a>`;
    }
    if (/^mailto:[^\s<>]+$/i.test(href) || /^tel:\+?[0-9().-]+$/i.test(href)) {
      return `<a href="${escapeAttribute(href)}"${tooltip}>${label}</a>`;
    }
    return label;
  };
  renderer.heading = function ({ tokens, depth }) {
    let title = this.parser.parseInline(tokens);
    const custom = /[ \t]*\{#([\w-]+)\}\s*$/.exec(title);
    if (custom) title = title.slice(0, custom.index).trimEnd();
    const plain = title.replace(/<[^>]*>/g, '').trim();
    const slugTitle = plain.replace(/\s+\[(?:GFM|расширение)\]$/i, '');
    const slug = custom?.[1] ?? (slugTitle.normalize('NFKC').toLowerCase()
      .replace(/&[a-z0-9#]+;|[^\p{L}\p{N}\p{M}_\s-]/gu, '').trim().replace(/\s+/g, '-') || 'раздел');
    let id = prefix + slug;
    for (let suffix = 1; headingIds.has(id); suffix++) id = `${prefix}${slug}-${suffix}`;
    headingIds.add(id);
    headings.push({ level: depth, id, title: plain });
    return `<h${depth} id="${escapeAttribute(id)}">${title}</h${depth}>`;
  };
  renderer.paragraph = function ({ tokens }) {
    let content = this.parser.parseInline(tokens);
    const attrs = /[ \t]*\{#([\w-]+)(?:\s+\.([\w-]+))?\}\s*$/.exec(content);
    if (!attrs) return `<p>${content}</p>\n`;
    content = content.slice(0, attrs.index);
    const style = attrs[2] === 'highlight' ? ' class="lesson-markdown-callout"' : '';
    return `<p id="${prefix}${attrs[1]}"${style}>${content}</p>\n`;
  };
  renderer.blockquote = function ({ tokens }) {
    const body = this.parser.parse(tokens);
    const alert = /^<p>\[!([a-z]+)\]([^\n<]*)(?:<br\s*\/?>|<\/p>)/i.exec(body);
    if (!alert || !/^(note|tip|important|warning|caution|info)$/i.test(alert[1])) return `<blockquote>\n${body}</blockquote>\n`;
    const content = body.slice(alert[0].length);
    return callout(alert[1], alert[2].trim(), alert[0].endsWith('</p>') ? content : '<p>' + content);
  };
  renderer.text = function (token) {
    const text: string = Renderer.prototype.text.call(this, token);
    if (token.type !== 'text' || token.tokens?.length || token.escaped) return text;
    return text.replace(/\(c\)|\(r\)|\(tm\)|\.{3}|(?<=\s)---?(?=\s)|\b[A-Z][A-Z0-9-]{1,15}\b/gi, value => {
      const symbol = ({ '(c)': '©', '(r)': '®', '(tm)': '™', '...': '…', '--': '–', '---': '—' } as Record<string, string>)[value.toLowerCase()];
      const description = abbreviations.get(value);
      return symbol ?? (description ? `<abbr title="${escapeAttribute(description)}">${value}</abbr>` : value);
    });
  };
  const documentExtensions: MarkedExtension = {
    extensions: [{
      name: 'lessonToc', level: 'block',
      tokenizer(source) {
        const match = /^(?:\[TOC\]|\[\[TOC\]\]|\[\[_TOC_\]\]|\{toc\}|<!--\s*toc\s*-->)[ \t]*(?:\n|$)/i.exec(source);
        if (match) return { type: 'lessonToc', raw: match[0] };
      },
      renderer: () => tocMarker,
    }, {
      name: 'lessonAbbreviation', level: 'block',
      tokenizer(source) {
        const match = /^\*\[([A-Z][A-Z0-9-]{1,15})\]:[ \t]+([^\n]+)(?:\n|$)/.exec(source);
        if (match) {
          abbreviations.set(match[1], match[2].trim());
          return { type: 'lessonAbbreviation', raw: match[0] };
        }
      },
      renderer: () => '',
    }, {
      name: 'lessonInlineNote', level: 'inline', start: source => source.indexOf('^['),
      tokenizer(source) {
        const match = /^\^\[([^\]\n]+)\]/.exec(source);
        if (match) return { type: 'lessonInlineNote', raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
      },
      childTokens: ['tokens'],
      renderer(token) {
        const number = inlineNotes.length + 1;
        const id = `${prefix}inline-note-${number}`;
        inlineNotes.push(`<li id="${id}">${this.parser.parseInline(token.tokens ?? [])} <a href="#${id}-ref" aria-label="К ссылке на сноску">↩</a></li>`);
        return `<sup><a id="${id}-ref" href="#${id}">*${number}</a></sup>`;
      },
    }],
  };
  const markdown = new Marked(
    { renderer, breaks: true },
    lessonDialect,
    markedKatex(mathOptions),
    markedFootnote({ prefixId: prefix + 'footnote-', description: 'Сноски', backRefLabel: 'К ссылке на сноску' }),
    documentExtensions,
  );
  // A leading YAML block is document metadata, not lesson body.
  const withoutMetadata = source.replace(/^(?:\uFEFF)?(?:[ \t]*\r?\n)*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
    (block, metadata: string) => /^[\w-]+:[ \t]/.test(metadata) &&
      metadata.split(/\r?\n/).every(line => !line.trim() || /^[\w-]+:[ \t]|^[ \t]+\S/.test(line)) ? '' : block);
  const html = markdown.parse(withoutMetadata, { async: false });
  const contents = `<nav class="lesson-markdown-toc" aria-label="Оглавление"><strong>Оглавление</strong><ul>${headings.filter(heading => heading.level <= 3).map(heading =>
    `<li><a href="#${escapeAttribute(heading.id)}">${heading.title}</a></li>`,
  ).join('')}</ul></nav>`;
  const notes = inlineNotes.length ? `<section class="footnotes"><h2>Встроенные сноски</h2><ol>${inlineNotes.join('')}</ol></section>` : '';
  return html.replace(tocMarker, contents).replaceAll(tocMarker, '') + notes;
}

export function LessonMarkdown({ source, language = '' }: { source: string; language?: string }) {
  const id = useId().replace(/[^a-z0-9_-]/gi, '');
  const prefix = `lesson-${id}-`;
  const html = useMemo(() => {
    try { return lessonHtml(source, prefix, language); }
    catch { return null; }
  }, [source, prefix, language]);
  const [message, setMessage] = useState('');
  const copyCode = async (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    const href = anchor?.getAttribute('href');
    if (href?.startsWith('#' + prefix)) {
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
