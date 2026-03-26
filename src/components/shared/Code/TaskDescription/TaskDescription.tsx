import React, { useRef, useState } from "react";
import { isDesktop } from "../../../../index";
import { Task } from "../../../../types/task";
import { getTaskType } from "../../../../utils/taskType";
import "./TaskDescription.css";

interface TaskDescriptionProps {
	task: Task | null;
	hideTopSpacing?: boolean;
}

const TaskDescription: React.FC<TaskDescriptionProps> = ({
	task,
	hideTopSpacing = false,
}) => {
	const [height, setHeight] = useState(200);
	const isResizing = useRef(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const startTouchY = useRef(0);
	const windowHeight = window.innerHeight;

	const preventSelection = (event: Event) => {
		event.preventDefault();
	};

	const startResize = () => {
		document.addEventListener("selectstart", preventSelection);
		document.body.style.overflow = "hidden";
		document.body.style.userSelect = "none";
		document.body.style.cursor = "row-resize";
		window.getSelection()?.removeAllRanges();
	};

	const stopResize = () => {
		document.removeEventListener("selectstart", preventSelection);
		document.body.style.overflow = "";
		document.body.style.userSelect = "";
		document.body.style.cursor = "";
	};

	const handleMouseDown = (event: React.MouseEvent) => {
		event.preventDefault();
		isResizing.current = true;
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		startResize();
	};

	const handleTouchStart = (event: React.TouchEvent) => {
		if (event.touches.length === 1) {
			event.preventDefault();
			isResizing.current = true;
			startTouchY.current = event.touches[0].clientY;
			document.addEventListener("touchmove", handleTouchMove, {
				passive: false,
			});
			document.addEventListener("touchend", handleTouchEnd);
			startResize();
		}
	};

	const handleMouseMove = (event: MouseEvent) => {
		if (!isResizing.current) return;

		if (containerRef.current) {
			const containerRect = containerRef.current.getBoundingClientRect();
			const newHeight = event.clientY - containerRect.top;

			const minHeight = 10;
			const maxHeight = windowHeight - 200;
			setHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
		}
	};

	const handleTouchMove = (event: TouchEvent) => {
		if (!isResizing.current) return;

		if (containerRef.current) {
			const containerRect = containerRef.current.getBoundingClientRect();
			const newHeight = event.touches[0].clientY - containerRect.top;

			const minHeight = 10;
			const maxHeight = windowHeight - 200;
			setHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));

			event.preventDefault();
		}
	};

	const handleMouseUp = () => {
		isResizing.current = false;
		document.removeEventListener("mousemove", handleMouseMove);
		document.removeEventListener("mouseup", handleMouseUp);
		stopResize();
	};

	const handleTouchEnd = () => {
		isResizing.current = false;
		document.removeEventListener("touchmove", handleTouchMove);
		document.removeEventListener("touchend", handleTouchEnd);
		stopResize();
	};

	if (!task) return null;

	const isPasteTaskWithMultipleAnswers =
		getTaskType(task) === "paste" && (task.answers?.length || 0) > 1;
	const taskAnswer = task.answers?.[0];
	const taskInput = isPasteTaskWithMultipleAnswers
		? taskAnswer?.code_before?.trim()
		: taskAnswer?.input?.trim();

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
			const next = decoded
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
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

	const processDescription = (html: string): string => {
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

	return (
		<div className={`${!hideTopSpacing && !isDesktop() ? "mt-[25px]" : ""}`}>
			<div
				ref={containerRef}
				style={{
					position: "relative",
					height: `${height}px`,
				}}
				className={`flex-none bg-ide-secondary p-4 border-b border-ide-border`}
			>
				<div
					style={{
						overflow: "auto",
						height: "100%",
					}}
				>
					<div className="container mx-auto">
						<div className="prose prose-invert max-w-none">
							<div 
								className="task-description-content"
								dangerouslySetInnerHTML={{ __html: processDescription(task.description) }} 
							/>
							{task.answers && task.answers.length > 1 && (
								<>
									{taskInput && (
										<>
											<div>Входные данные:</div>
											<pre>{taskInput}</pre>
										</>
									)}
									<div className="mt-3">Выходные данные:</div>
									<pre>{taskAnswer?.output}</pre>
								</>
							)}
						</div>
					</div>
				</div>

				<div
					style={{
						position: "absolute",
						bottom: 0,
						left: 0,
						right: 0,
						height: "8px",
						cursor: "row-resize",
						touchAction: "none",
						userSelect: "none",
					}}
					onMouseDown={handleMouseDown}
					onTouchStart={handleTouchStart}
					onDragStart={(event) => event.preventDefault()}
				>
					<div
						style={{
							width: "60px",
							height: "4px",
							background: "#666",
							margin: "2px auto",
							borderRadius: "2px",
							zIndex: "999",
						}}
					/>
				</div>
			</div>
		</div>
	);
};

export default TaskDescription;
