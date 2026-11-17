import React, { useId } from "react";
import type { OutputMismatch } from "../../../../hooks/useCodeExecution";
import type { OutputImage, SqlResult } from "../../../../types/task";
import SqlResultTable from "./SqlResultTable";
import "./OutputSection.css";

interface OutputSectionProps {
	output: string;
	mismatch?: OutputMismatch | null;
	running?: boolean;
	inputData?: string;
	inputFile?: { name: string; content: string };
	programOutput?: string | null;
	images?: OutputImage[];
	sqlResults?: SqlResult[];
	status: "idle" | "success" | "error";
	activeTab: "editor" | "output";
	language?: string;
	htmlPreview?: string;
	width?: number;
	desktopSinglePane?: boolean;
	desktopStackedPane?: boolean;
	collapsed?: boolean;
	onToggleCollapsed?: () => void;
}

const OutputSection: React.FC<OutputSectionProps> = ({
	output,
	mismatch,
	running = false,
	inputData = "",
	inputFile,
	programOutput = null,
	images = [],
	sqlResults = [],
	status,
	activeTab,
	language,
	htmlPreview,
	width = 50,
	desktopSinglePane = false,
	desktopStackedPane = false,
	collapsed = false,
	onToggleCollapsed,
}) => {
	const contentId = useId();
	const isHtmlMode = language === "html";
	const showSqlResults = language === "sql" && sqlResults.length > 0 && status !== "error" && !mismatch;
	const hasInputData = inputData.length > 0;
	const showSuccessMessage = status === "success" && Boolean(output) && (programOutput !== null || showSqlResults);
	const showPlainOutput = !mismatch && !showSuccessMessage
		&& (!showSqlResults || Boolean(output))
		&& (programOutput === null || (Boolean(output) && output !== programOutput));
	const canCollapse = Boolean(onToggleCollapsed) && !isHtmlMode;

	const getStatusIcon = () => {
		switch (status) {
			case "success":
				return (
					<svg
						className="w-4 h-4 text-green-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				);
			case "error":
				return (
					<svg
						className="w-4 h-4 text-red-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				);
			default:
				return null;
		}
	};

	return (
		<div
			className={`h-full min-w-0 ${
				isHtmlMode
					? "block"
					: activeTab === "output"
					? "block"
					: desktopStackedPane
					? "hidden"
					: desktopSinglePane
					? "hidden"
					: "hidden md:block"
			} ${desktopStackedPane ? "desktop-task-output-pane" : ""}`}
			style={
				isHtmlMode
					? { width: "100%", flex: `0 0 ${width}%`, minWidth: 0 }
					: desktopStackedPane
					? { width: "100%" }
					: desktopSinglePane || activeTab === "output"
					? { width: "100%" }
					: { flex: `0 0 ${width}%`, minWidth: 0 }
			}
		>
			<div className={`task-output-inner h-full p-4 ${canCollapse && collapsed ? "md:pt-0" : ""}`}>
				<div className="task-output-surface flex flex-col h-full bg-ide-editor rounded-lg overflow-hidden">
					<div className={`bg-ide-secondary px-3 py-2 border-b border-ide-border flex items-center justify-between ${canCollapse ? "md:hidden" : ""}`}>
						<span className="text-ide-text-secondary text-sm">
							{isHtmlMode ? "HTML Preview" : "Output"}
						</span>
						{!isHtmlMode && (running ? (
							<span className="ide-output-spinner" role="status" aria-label="Выполняется проверка" />
						) : getStatusIcon())}
					</div>
					{canCollapse && (
						<button
							type="button"
							aria-expanded={!collapsed}
							aria-controls={contentId}
							onClick={onToggleCollapsed}
							className="task-output-heading hidden md:flex w-full items-center justify-between gap-3 bg-ide-secondary border-b border-ide-border px-3 py-2 text-sm text-ide-text-secondary hover:bg-ide-editor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
						>
							<span>Output</span>
							<span className="flex items-center gap-2">
								{getStatusIcon()}
								<svg aria-hidden="true" className={`h-4 w-4 transition-transform duration-150 motion-reduce:transition-none ${collapsed ? "" : "rotate-180"}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
									<path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							</span>
						</button>
					)}
					{isHtmlMode ? (
						<div className="flex-1 bg-white">
							<iframe
								title="HTML Preview"
								srcDoc={htmlPreview || ""}
								sandbox="allow-scripts"
								className="h-full w-full border-0"
							/>
						</div>
					) : (
						<div id={contentId} className="task-output-content flex-1 p-4 overflow-auto space-y-4">
							{inputFile && (
								<section className="space-y-1" aria-label="Входные данные">
									<div className="text-xs font-medium uppercase tracking-wide text-ide-text-secondary">
										Входные данные
									</div>
									<a className="ide-output-file" download={inputFile.name}
										href={`data:text/csv;charset=utf-8,${encodeURIComponent(inputFile.content)}`}
										title={`Скачать ${inputFile.name}`}>
										{inputFile.name}
									</a>
								</section>
							)}
							{mismatch && (
								<div className="ide-check-result" role="status">
									<strong className="ide-check-verdict">Неверно 😕 — вывод не совпал</strong>
									{hasInputData && <div>Входные данные<pre>{inputData}</pre></div>}
									<div className="ide-check-comparison">
										<div>Получено<pre aria-label="Вывод вашей программы">{mismatch.actual.trim() ? mismatch.actual : "Программа ничего не вывела"}</pre></div>
										<div>Ожидалось<pre aria-label="Ожидаемый вывод">{mismatch.expected.trim() ? mismatch.expected : "Пустой вывод"}</pre></div>
									</div>
									<p>Сравните вывод с примером, поправьте код и попробуйте ещё раз</p>
								</div>
							)}
							{!mismatch && hasInputData && (
								<section className="space-y-2">
									<div className="text-xs font-medium uppercase tracking-wide text-ide-text-secondary">
										Входные данные
									</div>
									<pre className="font-mono text-sm md:text-base whitespace-pre-wrap break-words text-ide-text-primary">
										{inputData}
									</pre>
								</section>
							)}
							{showPlainOutput && <section className="space-y-2">
								{status === "error" && output && (
									<strong className="ide-check-verdict block">Не удалось выполнить проверку 😕</strong>
								)}
								{hasInputData && status !== "error" && programOutput === null && (
									<div className="text-xs font-medium uppercase tracking-wide text-ide-text-secondary">
										Вывод программы
									</div>
								)}
								<pre
									className={`font-mono text-sm md:text-base whitespace-pre-wrap break-words ${
										status === "error"
											? "error-output"
											: status === "success"
											? "text-green-500"
											: ""
									}`}
								>
									{output || "Нет результата"}
								</pre>
								{status === "error" && output && (
									<p className="text-sm">Проверьте сообщение об ошибке и попробуйте ещё раз</p>
								)}
							</section>}
							{showSqlResults && sqlResults.map((result, index) => (
								<SqlResultTable key={index} result={result} number={index + 1} />
							))}
							{((!mismatch && programOutput !== null) || images.length > 0) && (
								<div className={`ide-execution-results${images.length ? " has-images" : ""}`}>
									{!mismatch && programOutput !== null && (programOutput || !images.length) && (
										<section className="ide-execution-text" aria-label="Вывод программы">
											<div className="text-xs font-medium uppercase tracking-wide text-ide-text-secondary">Вывод программы</div>
											<pre>{programOutput || "Пустой вывод"}</pre>
										</section>
									)}
									{images.length > 0 && <div className="ide-execution-images">
										{images.map((image, index) => {
											const src = `data:${image.mime_type};base64,${image.base64}`;
											return <figure className="ide-execution-image" key={`${image.name}-${index}`}>
												<figcaption>{image.name}</figcaption>
												<a href={src} download={image.name} aria-label={`Скачать ${image.name}`}>Скачать</a>
												<img src={src} alt={`Результат программы: ${image.name}`} />
											</figure>;
										})}
									</div>}
								</div>
							)}
							{!mismatch && showSuccessMessage && <p className="text-sm text-green-500" role="status">{output}</p>}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default OutputSection;
