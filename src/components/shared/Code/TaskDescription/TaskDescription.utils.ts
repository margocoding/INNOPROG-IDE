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
			openTagIndexes.pop();
		}
	});
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

export const processTaskDescription = (description: string): string => {
	if (!description) return "";

	let processed = decodeHtmlEntities(description);

	processed = processed.replace(/\r\n/g, "\n");
	processed = processed.replace(/\r/g, "\n");

	const tokens = tokenizeDescription(processed);
	markBalancedTags(tokens);

	let hasCapitalizedFirstTextCharacter = false;

	return tokens
		.map((token) => {
			if (token.type === "tag") {
				const renderedTag = renderTag(token);

				if (!token.shouldRender && renderedTag.trim()) {
					hasCapitalizedFirstTextCharacter = true;
				}

				return renderedTag;
			}

			const normalizedText = hasCapitalizedFirstTextCharacter
				? token.content
				: capitalizeFirstTextCharacter(token.content);

			if (normalizedText.trim()) {
				hasCapitalizedFirstTextCharacter = true;
			}

			return escapeText(normalizedText).replace(/\n/g, "<br>");
		})
		.join("");
};
