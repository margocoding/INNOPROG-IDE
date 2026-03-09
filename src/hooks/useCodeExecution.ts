import { useState } from "react";
import { api } from "../services/api";
import { Answer, Task, TaskAnswerCheckRequest } from "../types/task";

interface UseCodeExecutionProps {
	currentAnswer: Answer | null;
	task: Task | null;
	code: string;
	inputData: string;
	outputData: string;
	taskId: string | null;
	answer_id: string | null;
	clientId: string;
	language: string;
	setOutput: (output: string) => void;
	setStatus: (status: "idle" | "success" | "error") => void;
	setActiveTab: (tab: "editor" | "output") => void;
	setSubmitResult: (result: "success" | "error" | "no_data") => void;
	onOpen: () => void;
	status: "idle" | "success" | "error";
	isInIframe: boolean;
	setSubmitMessage: (message: string) => void;
}

export const useCodeExecution = ({
	currentAnswer,
	task,
	code,
	inputData,
	outputData,
	taskId,
	answer_id,
	clientId,
	language,
	setOutput,
	setStatus,
	setActiveTab,
	setSubmitResult,
	onOpen,
	status,
	isInIframe,
	setSubmitMessage,
}: UseCodeExecutionProps) => {
	const [isRunning, setIsRunning] = useState<boolean>(false);
	const [currentCode, setCurrentCode] = useState<string>('');

	const getSubmittedCode = () =>
		task?.answers && task.answers.length > 1
			? code
				: `${currentAnswer?.code_before ? currentAnswer.code_before : ""
					}${code}${currentAnswer?.code_after ? currentAnswer.code_after : ""}`;

	const getIframeAnswerPayload = (): TaskAnswerCheckRequest => {
		return {
			client_id: clientId,
			answer_id: answer_id || "",
			program: code,
		};
	};

	const handleRunCode = async () => {
		if (status === "success" && taskId) {
			await onSendCheck();
			return;
		}
		setIsRunning(true);
		setStatus("idle");
		setOutput("");

		try {
			const fullCode = `${currentAnswer?.code_before || task?.answers![0].code_before
				? task?.answers![0].code_before
				: ""
				}\n${currentCode || code}\n${currentAnswer?.code_after || task?.answers![0].code_after
					? task?.answers![0].code_after
					: ""
				}`;

			const checkData = {
				input_data: currentAnswer?.input || inputData || "-",
				output_data:
					task?.answers![0].output.trim() || outputData.trim() || "-",
				program: fullCode,
				test_number: -1,
				timeout: currentAnswer?.timeout || 30,
			};

			const result = await api.checkCode(checkData, language);

			if (result.result) {
				if (!outputData && !taskId) {
					setOutput(result.output!);
					return;
				}
				setOutput(
					`Тест пройден успешно!\n${task?.answers?.length! > 1
						? `Результат программы: ${result.output}`
						: ""
					}`
				);
				setStatus("success");
			} else {
				setOutput(
					`Ошибка: ${result.comment || "Неверный результат"}${result.output !== "error"
						? `\nПолучено: ${result.output}\nОжидалось: ${task?.answers![0]?.output || outputData.trim()
						}`
						: ""
					}`
				);
				setStatus("error");
			}
		} catch (error: any) {
			setOutput(`Ошибка выполнения: ${error.message}`);
			setStatus("error");
		} finally {
			setIsRunning(false);
			if (window.innerWidth < 768) {
				setActiveTab("output");
			}
		}
	};

	const onSendCheck = async () => {
		setIsRunning(true);
		let shouldOpenModal = false;
		const resolvedAnswerId = answer_id || "";
		const resolvedTaskId = Number(taskId);

		try {
			if (isInIframe && taskId) {
				const result = await api.checkTaskAnswer(
					Number(taskId),
					getIframeAnswerPayload()
				);

				setSubmitMessage(result.message);
				shouldOpenModal = true;

				if (result.result) {
					setSubmitResult("success");
					window.parent.postMessage(
						{
							source: "innoprog-ide",
							type: "task-completed",
							event: "check-answer-success",
							taskId: Number(taskId),
							result: true,
							checked: true,
							completed: true,
							taskCompleted: true,
							status: "success",
							message: result.message,
						},
						"*"
					);
					return;
				}

				setSubmitResult("error");
				setStatus("idle");
				return;
			}

			await api.submitCode({
				program: getSubmittedCode(),
				user_id: clientId,
				answer_id: resolvedAnswerId,
				task_id: resolvedTaskId,
			});
			setSubmitMessage("");
			setSubmitResult("success");
			shouldOpenModal = true;
		} catch {
			setSubmitMessage(
				isInIframe
					? "Не удалось проверить решение. Попробуйте еще раз."
					: ""
			);
			setSubmitResult("error");
			setStatus("idle");
			shouldOpenModal = true;
		} finally {
			if (shouldOpenModal) {
				onOpen();
			}
			setIsRunning(false);

			if (!isInIframe) {
				try {
					window.Telegram?.WebApp?.close?.();
				} catch (error) {
					console.error("Failed to close Telegram WebApp:", error);
				}
			}
		}
	};

	return {
		isRunning,
		handleRunCode,
		onSendCheck,
		currentCode,
		setCurrentCode
	};
};
