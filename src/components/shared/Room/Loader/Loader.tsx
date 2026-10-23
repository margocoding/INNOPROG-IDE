import React from "react";
import "./Loader.css";

interface LoaderProps {
	message?: string;
	isError?: boolean;
}

const Loader: React.FC<LoaderProps> = ({
	message = "Подключение к комнате...",
	isError = false,
}) => {
	const isErrorState =
		isError || message.includes("Ошибка") || message.includes("потеряно");

    if (!isErrorState) return <div className="ide-connection-skeleton" role="status" aria-label={message} aria-busy="true">
      <span className="ide-loading-label">Подключение</span><div aria-hidden="true"><div className="ide-skeleton-toolbar"/><div className="ide-skeleton-workspace"><aside>{[0,1,2,3,4].map(i=><span key={i}/>)}</aside><section>{[0,1,2,3,4,5,6,7].map(i=><span key={i}/>)}</section></div><div className="ide-skeleton-console"/></div>
    </div>;

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center loader-overlay">
			<div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-xl max-w-sm w-full mx-4 loader-content">
				<div className="flex flex-col items-center space-y-4">
					{isErrorState ? (
						<div className="text-red-500 text-4xl">⚠️</div>
					) : (
						<div className="loader-pulse">
							<span />
						</div>
					)}
					<div className="text-center">
						<h3
							className={`text-lg font-semibold mb-2 ${
								isErrorState
									? "text-red-600 dark:text-red-400"
									: "text-gray-900 dark:text-white"
							}`}
						>
							{isErrorState ? "Ошибка подключения" : "Подключение"}
						</h3>
						<p
							className={`text-sm ${
								isErrorState
									? "text-red-600 dark:text-red-400"
									: "text-gray-600 dark:text-gray-300"
							}`}
						>
							{message}
						</p>
						{!isErrorState && (
							<div className="mt-4 flex justify-center space-x-1">
								<div className="animate-bounce h-2 w-2 bg-primary rounded-full [animation-delay:-0.3s]"></div>
								<div className="animate-bounce h-2 w-2 bg-primary rounded-full [animation-delay:-0.15s]"></div>
								<div className="animate-bounce h-2 w-2 bg-primary rounded-full"></div>
							</div>
						)}
						{/* {isErrorState && (
							<div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
								Попытка переподключения...
							</div>
						)} */}
					</div>
				</div>
			</div>
		</div>
	);
};

export default Loader;
