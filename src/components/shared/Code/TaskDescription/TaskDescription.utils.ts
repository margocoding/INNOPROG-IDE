const capitalizeFirstTextCharacter = (text: string): string => {
	const match = text.match(/^(\s*)(\S)([\s\S]*)$/);

	if (!match) {
		return text;
	}

	const [, leadingWhitespace, firstCharacter, rest] = match;
	return `${leadingWhitespace}${firstCharacter.toLocaleUpperCase()}${rest}`;
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

export const processTaskDescription = (html: string): string => {
	if (!html) return "";

	let processed = decodeHtmlEntities(html);

	processed = processed.replace(/\r\n/g, "\n");
	processed = processed.replace(/\r/g, "\n");

	const tagRegex = /<[^>]+>/g;
	const parts: Array<{ type: "text" | "tag"; content: string }> = [];
	let lastIndex = 0;
	let match;

	while ((match = tagRegex.exec(processed)) !== null) {
		if (match.index > lastIndex) {
			parts.push({
				type: "text",
				content: processed.substring(lastIndex, match.index),
			});
		}
		parts.push({
			type: "tag",
			content: match[0],
		});
		lastIndex = tagRegex.lastIndex;
	}

	if (lastIndex < processed.length) {
		parts.push({
			type: "text",
			content: processed.substring(lastIndex),
		});
	}

	let hasCapitalizedFirstTextCharacter = false;

	return parts
		.map((part) => {
			if (part.type === "text") {
				const normalizedText = hasCapitalizedFirstTextCharacter
					? part.content
					: capitalizeFirstTextCharacter(part.content);

				if (normalizedText.trim()) {
					hasCapitalizedFirstTextCharacter = true;
				}

				return normalizedText.replace(/\n/g, "<br>");
			}
			return part.content;
		})
		.join("");
};
