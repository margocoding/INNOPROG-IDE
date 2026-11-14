import type { RoomLessonTask } from '../../../../types/roomLesson';
import React, { useMemo, useRef, useState } from "react";
import { isDesktop } from "../../../../utils/platform";
import { Task } from "../../../../types/task";
import { getTaskType } from "../../../../utils/taskType";
import { isLegacyLessonTitle, processTaskDescription } from "./TaskDescription.utils";
import "./TaskDescription.css";
import { LessonMarkdown } from "./LessonMarkdown";
import { type TaskScrollSync, useTaskScrollSync } from "./useTaskScrollSync";

interface TaskDescriptionProps {
	task: Task | null;
	showTeacherTests?: boolean;
	lesson?: RoomLessonTask | null;
	language?: string;
	hideTopSpacing?: boolean;
	desktopSidebar?: boolean;
	desktopWidth?: number;
	scrollSync?: TaskScrollSync;
}

const TaskDescription: React.FC<TaskDescriptionProps> = ({
	task,
	showTeacherTests = false,
	lesson,
	language,
	hideTopSpacing = false,
	desktopSidebar = false,
	desktopWidth = 38,
	scrollSync,
}) => {
	const [height, setHeight] = useState<number | null>(null);
	const panelHeight = height ?? (task?.illustration ? 260 : 200);
	const isResizing = useRef(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	useTaskScrollSync(scrollRef, task ? scrollSync : undefined);
	const description = task?.description;
	const descriptionLanguage = lesson?.language || task?.editor_language || language;
	const renderLegacyDescription = Boolean(task && (!lesson || lesson.platformId));
	const legacyHtml = useMemo(() => renderLegacyDescription
		? { __html: processTaskDescription(description ?? "", descriptionLanguage) }
		: undefined, [renderLegacyDescription, description, descriptionLanguage]);
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

	const lessonTitle = lesson?.platformId && isLegacyLessonTitle(lesson.title, lesson.description)
		? lesson.topic?.trim()
		: lesson?.title;
	const headline = lesson && !lesson.platformId ? lessonTitle : task.title || lessonTitle;
	const isPasteTask = getTaskType(task) === "paste";
	const taskAnswer = task.answers?.[0];
	const teacherTests = showTeacherTests ? task.teacher_tests : undefined;
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
					height: `${panelHeight}px`,
				}}
				className="task-description-panel flex-none bg-ide-secondary p-4 border-b border-ide-border"
			>
				<div
					ref={scrollRef}
					data-room-focus-task
					style={{
						overflow: "auto",
						height: "100%",
					}}
				>
					<div className="container mx-auto">
						<div className="prose prose-invert max-w-none">
							{headline && <h2 className="lesson-task-title">{headline}</h2>}
							{task.illustration && (!lesson || lesson.platformId) && (
								<img className="task-description-illustration" src={task.illustration.src} alt={task.illustration.alt} />
							)}
							{lesson && !lesson.platformId
								? lesson.descriptionFormat === "markdown"
									? <LessonMarkdown source={lesson.description} language={lesson.language} />
								: <div className="room-focus-text whitespace-pre-wrap break-words">{lesson.description}</div>
								: <div className="task-description-content" dangerouslySetInnerHTML={legacyHtml} />}
							{hasPublicExample && (
								<>
									{taskInput && (
										<>
											<div className="mt-3">Входные данные:</div>
											<pre>{taskInput}</pre>
										</>
									)}
									{(!lesson || taskAnswer?.output) && <>
										<div className="mt-3">Выходные данные:</div>
										<pre>{taskAnswer?.output}</pre>
									</>}
								</>
							)}
							{Boolean(teacherTests?.length) && (
								<details className="task-teacher-tests" key={task.id}>
									<summary>
										<span>Посмотреть другие тесты</span>
										<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
											<path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									</summary>
									{teacherTests?.map(test => (
										<div className="task-teacher-test" key={test.number}>
											<p className="task-teacher-test-number">Тест {test.number}</p>
											{"append_code" in test ? (
												<>
													<div>Код, который добавится в конце</div>
													<pre>{test.append_code}</pre>
												</>
											) : (
												<>
													<div>Входные данные</div>
													<pre>{test.input}</pre>
													{!test.input.trim() && <div className="task-teacher-test-note">
														{test.input === "\n" ? "Одна пустая строка" : "Только пробельные символы"}
													</div>}
													{test.output !== undefined && <>
														<div>Выходные данные</div>
														<pre>{test.output}</pre>
													</>}
												</>
											)}
										</div>
									))}
								</details>
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
					aria-valuenow={panelHeight}
					tabIndex={0}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={stopResize}
					onPointerCancel={stopResize}
					onLostPointerCapture={stopResize}
					onKeyDown={(event) => {
						if (event.key === "ArrowUp" || event.key === "ArrowDown") {
							event.preventDefault();
							resizeTo(panelHeight + (event.key === "ArrowUp" ? -24 : 24));
						}
					}}
				><span /></div>
			</div>
		</div>
	);
};

export default TaskDescription;
