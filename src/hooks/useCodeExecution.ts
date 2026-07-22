import { useState } from "react";
import { api } from "../services/api";
import { Answer, Language, Task, TaskAnswerCheckRequest } from "../types/task";

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
	setRunInputData: (inputData: string) => void;
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
	setRunInputData,
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

	const getSelectedAnswer = () => currentAnswer || task?.answers?.[0] || null;

	const extractEditableCode = (
		sourceCode: string,
		codeBefore: string,
		codeAfter: string
	) => {
		if (
			codeBefore &&
			codeAfter &&
			sourceCode.startsWith(codeBefore) &&
			sourceCode.endsWith(codeAfter)
		) {
			return sourceCode.slice(codeBefore.length, sourceCode.length - codeAfter.length);
		}

		return sourceCode;
	};

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
		setRunInputData("");

		try {
			const runLanguage =
				taskId && language !== Language.CPP ? Language.PY : language;
			const selectedAnswer = getSelectedAnswer();
			const codeBefore = selectedAnswer?.code_before || "";
			const codeAfter = selectedAnswer?.code_after || "";
			const editableCode = extractEditableCode(
				code || currentCode,
				codeBefore,
				codeAfter
			);
			const fullCode = `${codeBefore}\n${editableCode}\n${codeAfter}`;

			const checkData = {
				input_data: selectedAnswer?.input || inputData || "-",
				output_data:
					selectedAnswer?.output?.trim() || outputData.trim() || "-",
				program: fullCode,
				test_number: -1,
				timeout: selectedAnswer?.timeout || 30,
			};

			const canCheckPublicTaskExample = Boolean(
				taskId && selectedAnswer?.input != null && selectedAnswer?.output?.trim()
			);

			if (!canCheckPublicTaskExample && (taskId || !outputData.trim())) {
				const runInputData = inputData || "";
				const result = await api.runCode(
					{
						input_data: runInputData,
						program: fullCode,
						timeout: selectedAnswer?.timeout || 30,
					},
					runLanguage
				);

				setRunInputData(result.input ?? runInputData);
				setOutput(
					taskId && result.result
						? "Первый тест пройден. Для сдачи задания отправь решение на полную проверку"
						: result.output || result.comment || ""
				);
				setStatus(result.result ? (taskId ? "success" : "idle") : "error");
				return;
			}

			const result = await api.checkCode(checkData, runLanguage);
			setRunInputData(checkData.input_data === "-" ? "" : checkData.input_data);

			if (result.result) {
				if (!outputData && !taskId) {
					setOutput(result.output!);
					return;
				}
				setOutput(
					taskId
						? "Первый тест пройден. Для сдачи задания отправь решение на полную проверку"
						: `Программа успешно выполнена${result.output ? `\nРезультат программы: ${result.output}` : ""}`
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
		const resolvedUserId = Number.parseInt(clientId, 10) || 0;

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
				program: code,
				user_id: resolvedUserId,
				answer_id: resolvedAnswerId,
				task_id: resolvedTaskId,
			});
			setSubmitMessage("");
			setSubmitResult("success");
			shouldOpenModal = true;
		} catch {
			setSubmitMessage(
				isInIframe
					? "Не удалось проверить решение. Попробуйте еще раз"
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
