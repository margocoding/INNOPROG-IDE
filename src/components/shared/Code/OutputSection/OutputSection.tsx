import React, { useRef } from "react";

interface OutputSectionProps {
	output: string;
	status: "idle" | "success" | "error";
	activeTab: "editor" | "output";
	width?: number;
}

const OutputSection: React.FC<OutputSectionProps> = ({
	output,
	status,
	activeTab,
	width = 50,
}) => {
	const outputRef = useRef<HTMLPreElement>(null);

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
			className={`h-full ${
				activeTab === "output" ? "block" : "hidden md:block"
			}`}
			style={
				activeTab === "output"
					? { width: "100%" }
					: { flex: `0 0 ${width}%`, minWidth: 0 }
			}
		>
			<div className="h-full p-4">
				<div className="flex flex-col h-full bg-ide-editor rounded-lg overflow-hidden">
					<div className="bg-ide-secondary px-3 py-2 border-b border-ide-border flex items-center justify-between">
						<span className="text-ide-text-secondary text-sm">Output</span>
						{getStatusIcon()}
					</div>
					<div className="flex-1 p-4 overflow-auto">
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
					</div>
				</div>
			</div>
		</div>
	);
};

export default OutputSection;
