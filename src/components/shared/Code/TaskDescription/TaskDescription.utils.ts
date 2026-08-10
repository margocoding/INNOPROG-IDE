import Prism from "prismjs";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-python";

const capitalizeFirstTextCharacter = (text: string): string => {
	const match = text.match(/^(\s*)(\S)([\s\S]*)$/);

	if (!match) {
		return text;
	}

	const [, leadingWhitespace, firstCharacter, rest] = match;
	return `${leadingWhitespace}${firstCharacter.toLocaleUpperCase()}${rest}`;
};

type DescriptionTextToken = {
	type: "text";
	content: string;
};

type DescriptionTagToken = {
	type: "tag";
	content: string;
	tagName: string;
	attributes: string;
	isClosing: boolean;
	isSelfClosing: boolean;
	shouldRender: boolean;
	matchingTagIndex?: number;
};

type DescriptionToken = DescriptionTextToken | DescriptionTagToken;

const allowedTags: Record<string, true> = {
	a: true,
	b: true,
	blockquote: true,
	code: true,
	del: true,
	div: true,
	em: true,
	h1: true,
	h2: true,
	h3: true,
	h4: true,
	h5: true,
	h6: true,
	i: true,
	ins: true,
	li: true,
	mark: true,
	ol: true,
	p: true,
	pre: true,
	s: true,
	small: true,
	span: true,
	strong: true,
	sub: true,
	sup: true,
	table: true,
	tbody: true,
	td: true,
	th: true,
	thead: true,
	tr: true,
	u: true,
	ul: true,
};

const decodeHtmlEntities = (text: string): string => {
	let decoded = text;

	for (let i = 0; i < 3; i += 1) {
		// Keep angle brackets encoded so task text can mention HTML tags literally.
		const next = decoded
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&");

		if (next === decoded) {
			break;
		}

		decoded = next;
	}

	return decoded;
};

const escapeText = (text: string): string =>
	text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeCode = (text: string): string =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const renderTextWithInlineCode = (text: string): string => {
	const inlineCodePattern = /`([^`\n]+)`/g;
	const renderedParts: string[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = inlineCodePattern.exec(text)) !== null) {
		renderedParts.push(escapeText(text.slice(lastIndex, match.index)));
		renderedParts.push(
			`<code class="task-description-inline-code">${escapeCode(match[1])}</code>`
		);
		lastIndex = inlineCodePattern.lastIndex;
	}

	renderedParts.push(escapeText(text.slice(lastIndex)));
	return renderedParts.join("").replace(/\n/g, "<br>");
};

const escapeAttribute = (text: string): string =>
	text
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

const isAllowedTag = (tagName: string): boolean => Boolean(allowedTags[tagName]);

const isSafeUrl = (url: string): boolean => {
	const normalizedUrl = url
		.trim()
		.split("")
		.filter((character) => {
			const characterCode = character.charCodeAt(0);
			return characterCode > 31 && characterCode !== 127 && !/\s/.test(character);
		})
		.join("");
	const lowerUrl = normalizedUrl.toLocaleLowerCase();

	if (!lowerUrl) {
		return true;
	}

	if (
		lowerUrl.startsWith("#") ||
		lowerUrl.startsWith("/") ||
		lowerUrl.startsWith("./") ||
		lowerUrl.startsWith("../")
	) {
		return true;
	}

	const colonIndex = lowerUrl.indexOf(":");

	if (colonIndex === -1) {
		return true;
	}

	return ["http:", "https:", "mailto:", "tel:"].some((protocol) =>
		lowerUrl.startsWith(protocol)
	);
};

const isAllowedAttribute = (tagName: string, attributeName: string): boolean => {
	if (/^on/i.test(attributeName) || attributeName === "style") {
		return false;
	}

	if (
		attributeName === "class" ||
		attributeName === "id" ||
		attributeName === "role" ||
		attributeName === "title" ||
		/^aria-[a-z0-9-]+$/.test(attributeName) ||
		/^data-[a-z0-9-]+$/.test(attributeName)
	) {
		return true;
	}

	if (tagName === "a") {
		return ["href", "rel", "target"].includes(attributeName);
	}

	if (tagName === "td" || tagName === "th") {
		return ["colspan", "rowspan"].includes(attributeName);
	}

	if (tagName === "ol") {
		return ["start", "type"].includes(attributeName);
	}

	if (tagName === "li") {
		return attributeName === "value";
	}

	return false;
};

const sanitizeAttributes = (tagName: string, attributes: string): string => {
	const sanitizedAttributes: string[] = [];
	const attributeRegex =
		/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
	let match: RegExpExecArray | null;

	while ((match = attributeRegex.exec(attributes)) !== null) {
		const attributeName = match[1].toLocaleLowerCase();
		const attributeValue = match[2] ?? match[3] ?? match[4] ?? "";

		if (!/^[a-z][a-z0-9:-]*$/.test(attributeName)) {
			continue;
		}

		if (!isAllowedAttribute(tagName, attributeName)) {
			continue;
		}

		if (
			(attributeName === "href" || attributeName === "src") &&
			!isSafeUrl(attributeValue)
		) {
			continue;
		}

		sanitizedAttributes.push(
			`${attributeName}="${escapeAttribute(attributeValue)}"`
		);
	}

	if (
		tagName === "a" &&
		sanitizedAttributes.includes('target="_blank"') &&
		!sanitizedAttributes.some((attribute) => attribute.startsWith("rel="))
	) {
		sanitizedAttributes.push('rel="noopener noreferrer"');
	}

	return sanitizedAttributes.join(" ");
};

const parseTagToken = (content: string): DescriptionTagToken | null => {
	const match = content.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)([\s\S]*?)\s*(\/?)>$/);

	if (!match) {
		return null;
	}

	return {
		type: "tag",
		content,
		tagName: match[2].toLocaleLowerCase(),
		attributes: match[3] || "",
		isClosing: Boolean(match[1]),
		isSelfClosing: Boolean(match[4]),
		shouldRender: false,
	};
};

const tokenizeDescription = (description: string): DescriptionToken[] => {
	const tagRegex =
		/<\/?\s*[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^<>]*?)?\s*\/?>/g;
	const tokens: DescriptionToken[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = tagRegex.exec(description)) !== null) {
		if (match.index > lastIndex) {
			tokens.push({
				type: "text",
				content: description.substring(lastIndex, match.index),
			});
		}

		const tagToken = parseTagToken(match[0]);

		tokens.push(
			tagToken || {
				type: "text",
				content: match[0],
			}
		);

		lastIndex = tagRegex.lastIndex;
	}

	if (lastIndex < description.length) {
		tokens.push({
			type: "text",
			content: description.substring(lastIndex),
		});
	}

	return tokens;
};

const markBalancedTags = (tokens: DescriptionToken[]): void => {
	const openTagIndexes: number[] = [];

	tokens.forEach((token, index) => {
		if (
			token.type !== "tag" ||
			!isAllowedTag(token.tagName) ||
			token.isSelfClosing
		) {
			return;
		}

		if (!token.isClosing) {
			openTagIndexes.push(index);
			return;
		}

		const previousOpenTagIndex = openTagIndexes[openTagIndexes.length - 1];
		const previousOpenTag = tokens[previousOpenTagIndex];

		if (
			previousOpenTag &&
			previousOpenTag.type === "tag" &&
			previousOpenTag.tagName === token.tagName
		) {
			previousOpenTag.shouldRender = true;
			token.shouldRender = true;
			previousOpenTag.matchingTagIndex = index;
			token.matchingTagIndex = previousOpenTagIndex;
			openTagIndexes.pop();
		}
	});
};

const getRawTokenContent = (token: DescriptionToken): string => token.content;

const getTokensContent = (tokens: DescriptionToken[]): string =>
	tokens.map(getRawTokenContent).join("");

const trimOuterCodeBlockLines = (code: string): string =>
	code.replace(/^\n/, "").replace(/\n$/, "");

const decodeCodeEntities = (code: string): string =>
	code
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");

const inferCodeLanguage = (code: string): string => {
	const normalizedCode = code.trim();

	if (!normalizedCode) {
		return "text";
	}

	if (/<\/?[a-z][\s\S]*?>/i.test(normalizedCode)) {
		return "html";
	}

	if (
		/\b(console\.log|let|const|var|function|for\s*\(|while\s*\(|document\.|window\.|=>)\b/.test(
			normalizedCode
		)
	) {
		return "javascript";
	}

	if (/\b(print|def|import|from|range)\s*(\(|[a-zA-Z_])/.test(normalizedCode)) {
		return "python";
	}

	if (/#include\s*<|std::|cout\s*<</.test(normalizedCode)) {
		return "cpp";
	}

	return "text";
};

const renderCodeBlock = (tokens: DescriptionToken[]): string => {
	const code = decodeCodeEntities(trimOuterCodeBlockLines(getTokensContent(tokens)));
	const language = inferCodeLanguage(code);
	const grammar = Prism.languages[language];
	const highlightedCode = grammar
		? Prism.highlight(code, grammar, language)
		: escapeCode(code);

	return `<pre class="task-description-code-block language-${language}"><code class="language-${language}">${highlightedCode}</code></pre>`;
};

const renderTag = (token: DescriptionTagToken): string => {
	if (!token.shouldRender) {
		return escapeText(token.content);
	}

	if (token.isClosing) {
		return `</${token.tagName}>`;
	}

	const attributes = sanitizeAttributes(token.tagName, token.attributes);

	return attributes ? `<${token.tagName} ${attributes}>` : `<${token.tagName}>`;
};

export const stripInlineIdeFormattingHint = (description: string): string => {
	if (!description) return "";

	return description
		.replace(
			/<(p|div|span|li)[^>]*>(?:(?!<\/\1>)[\s\S])*?(?:❗\ufe0f?|!|⚠\ufe0f?)?\s*При отправке кода текстом,\s*примените форматирование(?:(?!<\/\1>)[\s\S])*?к коду\.?\s*<\/\1>/gi,
			""
		)
		.replace(
			/(?:❗\ufe0f?|!|⚠\ufe0f?)?\s*При отправке кода текстом,\s*примените форматирование[\s\S]{0,160}?к коду\.?\s*(?:<br\s*\/?>)?/gi,
			""
		)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
};

export const processTaskDescription = (description: string): string => {
	if (!description) return "";

	let processed = stripInlineIdeFormattingHint(decodeHtmlEntities(description));

	processed = processed.replace(/\r\n/g, "\n");
	processed = processed.replace(/\r/g, "\n");

	const tokens = tokenizeDescription(processed);
	markBalancedTags(tokens);

	let hasCapitalizedFirstTextCharacter = false;

	const renderedParts: string[] = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];

		if (
			token.type === "tag" &&
			token.tagName === "code" &&
			token.shouldRender &&
			!token.isClosing &&
			typeof token.matchingTagIndex === "number"
		) {
			const codeTokens = tokens.slice(index + 1, token.matchingTagIndex);
			const codeContent = trimOuterCodeBlockLines(getTokensContent(codeTokens));

			if (codeContent.includes("\n")) {
				renderedParts.push(renderCodeBlock(codeTokens));
				index = token.matchingTagIndex;
				continue;
			}
		}

		if (token.type === "tag") {
			const renderedTag = renderTag(token);

			if (!token.shouldRender && renderedTag.trim()) {
				hasCapitalizedFirstTextCharacter = true;
			}

			renderedParts.push(renderedTag);
			continue;
		}

		const normalizedText = hasCapitalizedFirstTextCharacter
			? token.content
			: capitalizeFirstTextCharacter(token.content);

		if (normalizedText.trim()) {
			hasCapitalizedFirstTextCharacter = true;
		}

		renderedParts.push(renderTextWithInlineCode(normalizedText));
	}

	return renderedParts.join("");
};
