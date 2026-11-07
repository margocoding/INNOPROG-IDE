import type { MarkedExtension, Tokens } from 'marked';
import katex, { type KatexOptions } from 'katex';

export const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttribute = (text: string) => escapeText(text).replace(/"/g, '&quot;');
export const mathOptions: KatexOptions = { throwOnError: false, trust: false, maxExpand: 300, maxSize: 10 };
const safeTags = new Set('u ins del sub sup mark small s span div p strong em code kbd abbr q details summary figure figcaption ruby rt rp time dl dt dd blockquote table thead tbody tr th td img'.split(' '));
const attributePattern = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g;

export function imageMarkup(href: string, alt: string, title?: string | null, dimensions = '') {
  if (!/^https:\/\/[^\s/]/i.test(href)) return escapeText(alt);
  const tooltip = title ? ` title="${escapeAttribute(title)}"` : '';
  return `<img src="${escapeAttribute(href)}" alt="${escapeAttribute(alt)}"${tooltip}${dimensions} loading="lazy" referrerpolicy="no-referrer">`;
}

export function safeLessonHtml(text: string): string {
  const tokens = /<!--[\s\S]*?-->|<\/?([a-z][\w-]*)((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi;
  let result = '';
  let offset = 0;
  const safeText = (value: string) => value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const match of text.matchAll(tokens)) {
    result += safeText(text.slice(offset, match.index));
    offset = match.index! + match[0].length;
    if (!match[1]) continue;
    const tag = match[1].toLowerCase();
    if (!safeTags.has(tag)) { result += escapeText(match[0]); continue; }
    if (match[0].startsWith('</')) {
      if (tag !== 'img') result += `</${tag}>`;
      continue;
    }
    const attributes = new Map([...match[2].matchAll(attributePattern)].map(item =>
      [item[1].toLowerCase(), item[2] ?? item[3] ?? item[4] ?? ''],
    ));
    const attr = (name: string) => attributes.has(name)
      ? ` ${name}="${escapeAttribute(attributes.get(name)!)}"` : '';
    const size = (name: string) => /^[1-9]\d{0,3}$/.test(attributes.get(name) ?? '') ? attr(name) : '';
    if (tag === 'img') {
      result += imageMarkup(attributes.get('src') ?? '', attributes.get('alt') ?? '', attributes.get('title'), size('width') + size('height'));
      continue;
    }
    let extra = '';
    if (tag === 'details' && attributes.has('open')) extra = ' open';
    if (tag === 'abbr') extra = attr('title');
    if (tag === 'time') extra = attr('datetime');
    if (tag === 'td' || tag === 'th') extra = size('colspan') + size('rowspan');
    if (tag === 'span') {
      const color = /^\s*color\s*:\s*(#[0-9a-f]{3,8}|[a-z]{1,20})\s*;?\s*$/i.exec(attributes.get('style') ?? '')?.[1];
      if (color) extra = ` style="color:${color}"`;
    }
    if (tag === 'div' && attributes.get('class') === 'note') extra = ' class="lesson-markdown-callout"';
    result += `<${tag}${extra}>`;
  }
  return result + safeText(text.slice(offset));
}

const calloutLabels = new Map([
  ['note', 'Примечание'], ['info', 'Информация'], ['tip', 'Совет'], ['important', 'Важно'],
  ['warning', 'Предупреждение'], ['caution', 'Осторожно'],
]);
export function callout(kind: string, label: string, body: string, collapsible = false) {
  const type = calloutLabels.has(kind.toLowerCase()) ? kind.toLowerCase() : 'note';
  const heading = escapeText(label || calloutLabels.get(type)!);
  const css = `lesson-markdown-callout lesson-markdown-callout--${type}`;
  return collapsible
    ? `<details class="${css}"><summary>${heading}</summary>${body}</details>`
    : `<aside class="${css}"><p class="lesson-markdown-callout-title">${heading}</p>${body}</aside>`;
}

const inlineFormats = [
  ['lessonMark', '==', /^==([^=\n]+)==/, 'mark'],
  ['lessonUnderline', '++', /^\+\+([^+\n]+)\+\+/, 'u'],
  ['lessonSub', '~', /^~([^~\s]+)~(?!~)/, 'sub'],
  ['lessonSup', '^', /^\^([^\s^]+)\^/, 'sup'],
  ['lessonSpoiler', '||', /^\|\|([^|\n]+)\|\|/, 'details'],
] as const;
const emoji = new Map([
  ['smile', '😄'], ['rocket', '🚀'], ['tada', '🎉'], ['warning', '⚠️'], ['+1', '👍'], ['heart', '❤️'], ['octocat', '🐙'],
]);

export const lessonDialect: MarkedExtension = {
  extensions: [
    ...inlineFormats.map(([name, prefix, pattern, tag]) => ({
      name, level: 'inline' as const, start: (source: string) => source.indexOf(prefix),
      tokenizer(this: import('marked').TokenizerThis, source: string) {
        const match = pattern.exec(source);
        if (!match || (name === 'lessonSub' && source.startsWith('~~'))) return;
        return { type: name, raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
      },
      childTokens: ['tokens'],
      renderer(this: import('marked').RendererThis, token: Tokens.Generic) {
        const body = this.parser.parseInline(token.tokens as Tokens.Generic[]);
        return tag === 'details'
          ? `<details class="lesson-markdown-spoiler"><summary>Спойлер</summary>${body}</details>`
          : `<${tag}>${body}</${tag}>`;
      },
    })),
    {
      name: 'lessonEmoji', level: 'inline', start: source => source.indexOf(':'),
      tokenizer(source) {
        const match = /^:([a-z0-9+_-]+):/.exec(source);
        const text = match && emoji.get(match[1]);
        if (match && text) return { type: 'lessonEmoji', raw: match[0], text };
      },
      renderer: token => token.text,
    },
    {
      name: 'lessonInlineTex', level: 'inline', start: source => source.indexOf('\\('),
      tokenizer(source) {
        const match = /^\\\(([^\n]+?)\\\)/.exec(source);
        if (match && !/^\p{Script=Cyrillic}+(?: +\p{Script=Cyrillic}+)*$/u.test(match[1])) return { type: 'lessonInlineTex', raw: match[0], text: match[1] };
      },
      renderer: token => katex.renderToString(token.text, mathOptions),
    },
    {
      name: 'lessonBlockTex', level: 'block', start: source => source.indexOf('\\['),
      tokenizer(source) {
        const match = /^\\\[[ \t]*\n([\s\S]+?)\n[ \t]*\\\][ \t]*(?:\n|$)/.exec(source);
        if (match) return { type: 'lessonBlockTex', raw: match[0], text: match[1] };
      },
      renderer: token => katex.renderToString(token.text, { ...mathOptions, displayMode: true }),
    },
    {
      name: 'lessonImageSize', level: 'inline', start: source => source.indexOf('!['),
      tokenizer(source) {
        const match = /^(!\[[^\]\n]*\]\([^()\n]+\))\{width=([1-9]\d{0,3})px height=([1-9]\d{0,3})px\}/.exec(source);
        if (!match) return;
        const image = this.lexer.inlineTokens(match[1])[0];
        if (image?.type === 'image') return { type: 'lessonImageSize', raw: match[0], image, width: match[2], height: match[3] };
      },
      renderer(token) { return imageMarkup(token.image.href, token.image.text, token.image.title,
        ` width="${token.width}" height="${token.height}"`); },
    },
    {
      name: 'lessonContainer', level: 'block',
      tokenizer(source) {
        const match = /^:::[ \t]+(?:\{\.([\w-]+)(?:[ \t]+#([\w-]+))?\}|(center))[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/i.exec(source);
        if (!match || match[1]?.startsWith('callout-')) return;
        return { type: 'lessonContainer', raw: match[0], center: Boolean(match[3]), tokens: this.lexer.blockTokens(match[4]) };
      },
      childTokens: ['tokens'],
      renderer(token) {
        const style = token.center ? 'lesson-markdown-center' : 'lesson-markdown-container';
        return `<div class="${style}">${this.parser.parse(token.tokens ?? [])}</div>`;
      },
    },
    {
      name: 'lessonCallout', level: 'block',
      tokenizer(source) {
        const colon = /^:::(?:\s*\{\.callout-([a-z]+)\}|([a-z]+)(?:\[([^\]\n]+)\])?)[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/i.exec(source);
        if (colon) return { type: 'lessonCallout', raw: colon[0], kind: colon[1] || colon[2], title: colon[3] || '', tokens: this.lexer.blockTokens(colon[4]) };
        const indented = /^(!!!|\?\?\?)\s+([a-z]+)(?:[ \t]+"([^"\n]+)")?[ \t]*\n((?:(?: {4}|\t)[^\n]*(?:\n|$))+)/i.exec(source);
        if (indented) return {
          type: 'lessonCallout', raw: indented[0], kind: indented[2], title: indented[3] || '',
          collapsed: indented[1] === '???', tokens: this.lexer.blockTokens(indented[4].replace(/^(?: {4}|\t)/gm, '')),
        };
      },
      childTokens: ['tokens'],
      renderer(token) { return callout(token.kind, token.title, this.parser.parse(token.tokens ?? []), token.collapsed); },
    },
    {
      name: 'lessonDefinition', level: 'block',
      start: source => /(?:^|\n)[^\n]+\n:[ \t]+/.exec(source)?.index,
      tokenizer(source) {
        const match = /^([^\n]+)\n((?::[ \t]+[^\n]+(?:\n|$))+)/.exec(source);
        if (match) return {
          type: 'lessonDefinition', raw: match[0], term: this.lexer.inlineTokens(match[1]),
          definitions: match[2].trimEnd().split('\n').map(item => this.lexer.inlineTokens(item.replace(/^:[ \t]+/, ''))),
        };
      },
      renderer(token) {
        const definitions = token.definitions.map((item: Tokens.Generic[]) => `<dd>${this.parser.parseInline(item)}</dd>`).join('');
        return `<dl><dt>${this.parser.parseInline(token.term)}</dt>${definitions}</dl>`;
      },
    },
  ],
};
