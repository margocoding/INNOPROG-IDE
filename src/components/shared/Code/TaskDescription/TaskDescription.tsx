import React, { useRef, useState } from "react";
import { isDesktop } from "../../../../index";
import { Task } from "../../../../types/task";
import { getTaskType } from "../../../../utils/taskType";
import { processTaskDescription } from "./TaskDescription.utils";
import "./TaskDescription.css";

interface TaskDescriptionProps {
	task: Task | null;
	hideTopSpacing?: boolean;
	desktopSidebar?: boolean;
	desktopWidth?: number;
}

const TaskDescription: React.FC<TaskDescriptionProps> = ({
	task,
	hideTopSpacing = false,
	desktopSidebar = false,
	desktopWidth = 38,
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

	const isPasteTask = getTaskType(task) === "paste";
	const taskAnswer = task.answers?.[0];
	const showPublicExample = task.has_multiple_tests !== false;
	const taskInput = showPublicExample
		? (isPasteTask
			? taskAnswer?.code_before?.trim()
			: taskAnswer?.input?.trim())
		: "";
	const hasPublicExample = showPublicExample
		&& Boolean(taskInput || taskAnswer?.output?.trim());

	return (
		<div
			className={`task-description-shell ${
				desktopSidebar ? "task-description-shell--sidebar" : ""
			} ${!hideTopSpacing && !isDesktop() ? "mt-[25px]" : ""}`}
			style={
				{
					"--task-panel-width": `${desktopWidth}%`,
				} as React.CSSProperties
			}
		>
			<div
				ref={containerRef}
				style={{
					position: "relative",
					height: `${height}px`,
				}}
				className="task-description-panel flex-none bg-ide-secondary p-4 border-b border-ide-border"
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
								dangerouslySetInnerHTML={{
									__html: processTaskDescription(task.description),
								}}
							/>
							{hasPublicExample && (
								<>
									{taskInput && (
										<>
											<div className="mt-3">Входные данные:</div>
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
					className="task-description-row-resizer"
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
