import React, { useId, useRef } from "react";

interface OutputSectionProps {
	output: string;
	inputData?: string;
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
	inputData = "",
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
	const outputRef = useRef<HTMLPreElement>(null);
	const contentId = useId();
	const isHtmlMode = language === "html";
	const hasInputData = inputData.length > 0;
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
				<div className="flex flex-col h-full bg-ide-editor rounded-lg overflow-hidden">
					<div className={`bg-ide-secondary px-3 py-2 border-b border-ide-border flex items-center justify-between ${canCollapse ? "md:hidden" : ""}`}>
						<span className="text-ide-text-secondary text-sm">
							{isHtmlMode ? "HTML Preview" : "Output"}
						</span>
						{!isHtmlMode && getStatusIcon()}
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
							{hasInputData && (
								<section className="space-y-2">
									<div className="text-xs font-medium uppercase tracking-wide text-ide-text-secondary">
										Входные данные
									</div>
									<pre className="font-mono text-sm md:text-base whitespace-pre-wrap break-words text-ide-text-primary">
										{inputData}
									</pre>
								</section>
							)}
							<section className="space-y-2">
								{hasInputData && (
									<div className="text-xs font-medium uppercase tracking-wide text-ide-text-secondary">
										Вывод программы
									</div>
								)}
								<pre
									ref={outputRef}
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
							</section>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default OutputSection;
