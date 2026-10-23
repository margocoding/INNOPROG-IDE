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
	const resizeBounds = () => ({ min: 64, max: Math.max(64, window.innerHeight - 200) });
	const resizeTo = (nextHeight: number) => {
		const { min, max } = resizeBounds();
		setHeight(Math.max(min, Math.min(max, nextHeight)));
	};
	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		isResizing.current = true;
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!isResizing.current || !containerRef.current) return;
		resizeTo(event.clientY - containerRef.current.getBoundingClientRect().top);
	};
	const stopResize = () => { isResizing.current = false; };

	if (!task) return null;

	const isPasteTask = getTaskType(task) === "paste";
	const taskAnswer = task.answers?.[0];
	const showPublicExample = task.has_public_example ?? (task.has_multiple_tests !== false);
	const rawTaskInput = showPublicExample
		? (isPasteTask
			? taskAnswer?.code_before?.trim()
			: taskAnswer?.input?.trim())
		: "";
	const taskInput = rawTaskInput && !/^[-–—]$/.test(rawTaskInput)
		? rawTaskInput
		: "";
	const hasPublicExample = showPublicExample
		&& !task.description?.includes("<b>Пример автоматической проверки</b>")
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
					role="separator"
					aria-label="Изменить высоту условия задания"
					aria-orientation="horizontal"
					aria-valuemin={resizeBounds().min}
					aria-valuemax={resizeBounds().max}
					aria-valuenow={height}
					tabIndex={0}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={stopResize}
					onPointerCancel={stopResize}
					onLostPointerCapture={stopResize}
					onKeyDown={(event) => {
						if (event.key === "ArrowUp" || event.key === "ArrowDown") {
							event.preventDefault();
							resizeTo(height + (event.key === "ArrowUp" ? -24 : 24));
						}
					}}
				><span /></div>
			</div>
		</div>
	);
};

export default TaskDescription;
