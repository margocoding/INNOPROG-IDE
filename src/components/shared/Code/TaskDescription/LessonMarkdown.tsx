import { Marked, Renderer } from 'marked';
import { useMemo } from 'react';

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const renderer = new Renderer();
renderer.html = ({ text }) => escapeText(text);
renderer.image = ({ text }) => escapeText(text);
renderer.link = function (token) {
  if (!/^https?:\/\//i.test(token.href)) return this.parser.parseInline(token.tokens);
  return Renderer.prototype.link.call(this, token);
};

const markdown = new Marked({ renderer, breaks: true, async: false });

export function LessonMarkdown({ source }: { source: string }) {
  const html = useMemo(() => {
    try { return markdown.parse(source, { async: false }); }
    catch { return null; }
  }, [source]);
  return html === null
    ? <div className="whitespace-pre-wrap break-words">{source}</div>
    : <div className="break-words [&>:first-child]:mt-0 [&>:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: html }} />;
}
