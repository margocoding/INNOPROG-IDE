import { TaskCheckProgress } from "../services/taskCheckProgress";
import { useEffect, useRef, useState } from "react";
import type { SqliteWorkspace } from "../services/sqliteWorkspace";
import { api } from "../services/api";
import { Answer, CheckResult, Language, OutputImage, SqlResult, Task, TaskAnswerCheckRequest } from "../types/task";
import { postToParent } from "../utils/parentMessaging";

const admissionMessage = (error: any): string | null => {
	const status = error?.response?.status;
	const code = error?.response?.data?.code;
	if (status === 503 && code === "execution_busy") {
		return "Предыдущий запуск ещё выполняется. Дождитесь его завершения и повторите.";
	}
	if (status === 429) {
		const seconds = Math.max(1, Math.min(60, Number(error?.response?.headers?.["retry-after"]) || 5));
		return `Слишком много запусков. Повторите через ${seconds} с. Код сохранён в редакторе.`;
	}
	return null;
};

const maintenanceMessage = (error: any): string | null =>
	error?.response?.status === 503 && error?.response?.data?.code === "runner_maintenance"
		? "Сервис выполнения кода обновляется. Код остаётся в редакторе. Повторите запуск через минуту."
		: null;

export interface OutputMismatch {
	actual: string;
	expected: string;
}

interface UseCodeExecutionProps {
	currentAnswer: Answer | null;
	roomWorkspace?: boolean;
	sqliteWorkspace?: SqliteWorkspace;
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
	onRunFinished?: () => void;
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
	roomWorkspace,
	sqliteWorkspace,
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
	onRunFinished,
	setStatus,
	setActiveTab,
	setSubmitResult,
	onOpen,
	status,
	isInIframe,
	setSubmitMessage,
}: UseCodeExecutionProps) => {
	const [outputMismatch, setOutputMismatch] = useState<OutputMismatch | null>(null);
	const [programOutput, setProgramOutput] = useState<string | null>(null);
	const [sqlResults, setSqlResults] = useState<SqlResult[]>([]);
	const [outputImages, setOutputImages] = useState<OutputImage[]>([]);
	useEffect(() => {
		setOutputMismatch(null);
		setProgramOutput(null);
		setOutputImages([]);
	}, [taskId]);
	useEffect(() => setSqlResults([]), [taskId, language]);

	function recordExecution(result: CheckResult) {
		const images = (result.artifacts ?? []).filter(
			(image) => image.mime_type === "image/png" || image.mime_type === "image/jpeg",
		);
		setOutputImages(images);
		const showProgramOutput = Boolean(task?.input_file || images.length);
		setProgramOutput(showProgramOutput && result.output !== "error" ? result.output ?? "" : null);
	}
	const executionInFlight = useRef(false);
	const activeRun = useRef<AbortController | null>(null);
	useEffect(() => () => activeRun.current?.abort(), []);
	const [checkProgress, setCheckProgress] = useState<TaskCheckProgress | null>(null);
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
		const selectedAnswer = getSelectedAnswer();
		const hasPublicTaskExample = Boolean(
			taskId && (selectedAnswer?.output?.trim() ||
				(task?.input_file && typeof selectedAnswer?.output === "string")) &&
			(selectedAnswer?.input != null || task?.has_public_example === true)
		);
		const shouldAutoSubmitAfterPublicTest = Boolean(
			isInIframe &&
			taskId &&
			task?.has_multiple_tests === false &&
			hasPublicTaskExample
		);
		if (
			isInIframe &&
			taskId &&
			task?.has_multiple_tests === false &&
			!hasPublicTaskExample &&
			language !== Language.SQL
		) {
			await onSendCheck();
			return;
		}
		if (status === "success" && taskId) {
			await onSendCheck();
			return;
		}
		if (executionInFlight.current) return;
		executionInFlight.current = true;
		setIsRunning(true);
		// Keep the previous result visible until the new execution returns.

		const controller = roomWorkspace ? new AbortController() : null;
		activeRun.current = controller;
		try {
			const runLanguage =
				taskId &&
				language !== Language.CPP &&
				language !== Language.JAVA &&
				language !== Language.SQL
					? Language.PY
					: language;
			const codeBefore = selectedAnswer?.code_before || "";
			const codeAfter = selectedAnswer?.code_after || "";
			const editableCode = extractEditableCode(
				taskId ? code : (code || currentCode),
				codeBefore,
				codeAfter
			);
			const fullCode = [
				...(codeBefore ? [codeBefore] : []),
				editableCode,
				...(codeAfter ? [codeAfter] : []),
			].join("\n");

			const checkData = {
				input_data: selectedAnswer?.input || inputData || "-",
				output_data: task?.input_file && selectedAnswer?.output != null
					? selectedAnswer.output.trim()
					: selectedAnswer?.output?.trim() || outputData.trim() || "-",
				program: fullCode,
				test_number: -1,
				timeout: selectedAnswer?.timeout || 30,
				...(task?.input_file && taskId ? { task_id: Number(taskId) } : {}),
			};

			const canCheckPublicTaskExample = hasPublicTaskExample;
			const localSqlite = runLanguage === Language.SQL && sqliteWorkspace?.hasDatabase ? sqliteWorkspace : undefined;

			if (!canCheckPublicTaskExample && (localSqlite || taskId || !outputData.trim() || runLanguage === Language.PY || runLanguage === Language.CPP)) {
				const runInputData = inputData || "";
				const result = localSqlite
					? await localSqlite.run(fullCode, runInputData, selectedAnswer?.timeout || 30)
					: await api.runCode(
						{
							input_data: runInputData,
							program: fullCode,
							timeout: selectedAnswer?.timeout || 30,
							task_id: taskId ? Number(taskId) : undefined,
							...(runLanguage === Language.SQL ? { include_sql_results: true } : {}),
						},
						runLanguage,
						...(controller ? [controller.signal] as const : [])
					);

				const tables = result.result ? result.sql_results ?? [] : [];
				setSqlResults(tables);
				recordExecution(result);
				setOutputMismatch(null);
				setRunInputData(result.input ?? runInputData);
				if (!taskId && (runLanguage === Language.PY || runLanguage === Language.CPP) && outputData.trim() && result.result) {
					const actual = result.output || "";
					const expected = outputData.trim();
					const matches = actual.trim() === expected;
					setOutput(matches
						? `Программа успешно выполнена${actual ? `\nРезультат программы: ${actual}` : ""}`
						: "");
					if (!matches) setOutputMismatch({ actual, expected });
					setStatus(matches ? "success" : "error");
					return;
				}
				setOutput(
					taskId && result.result
						? shouldAutoSubmitAfterPublicTest
							? "Первый тест пройден. Идёт полная проверка решения"
							: "Первый тест пройден. Для сдачи задания отправь решение на полную проверку"
						: tables.length ? "" : result.output || result.comment || ""
				);
				setStatus(result.result ? (taskId ? "success" : "idle") : "error");
				if (result.result && shouldAutoSubmitAfterPublicTest) {
					setActiveTab("output");
					await onSendCheck();
				}
				return;
			}

			const result = await api.checkCode(checkData, runLanguage);
			setSqlResults([]);
			recordExecution(result);
			setOutputMismatch(null);
			setRunInputData(checkData.input_data === "-" ? "" : checkData.input_data);

			if (result.result) {
				if (!outputData && !taskId) {
					setOutput(result.output!);
					return;
				}
				setOutput(
					taskId
						? shouldAutoSubmitAfterPublicTest
							? "Первый тест пройден. Идёт полная проверка решения"
							: task?.input_file
								? "Пример пройден. Нажмите «Отправить» для полной проверки"
								: "Первый тест пройден. Для сдачи задания отправь решение на полную проверку"
						: `Программа успешно выполнена${result.output ? `\nРезультат программы: ${result.output}` : ""}`
				);
				setStatus("success");
				if (shouldAutoSubmitAfterPublicTest) {
					setActiveTab("output");
					await onSendCheck();
				}
			} else {
				if (typeof result.output === "string" && result.output !== "error") {
					setOutputMismatch({ actual: result.output, expected: selectedAnswer?.output || outputData });
					setOutput("");
				} else {
					setOutput(result.comment || result.error || "Не удалось выполнить программу");
				}
				setStatus("error");
			}
		} catch (error: any) {
			if (controller?.signal.aborted) return;
			setRunInputData("");
			setProgramOutput(null);
			setOutputImages([]);
			setSqlResults([]);
			setOutputMismatch(null);
			setOutput(maintenanceMessage(error) || admissionMessage(error) || `Ошибка выполнения: ${error.message}`);
			setStatus("error");
		} finally {
			activeRun.current = null;
			executionInFlight.current = false;
			setIsRunning(false);
			if (!controller?.signal.aborted) onRunFinished?.();
			if (taskId || roomWorkspace || window.innerWidth < 768) {
				setActiveTab("output");
			}
		}
	};

	const onSendCheck = async () => {
		setIsRunning(true);
		setCheckProgress(null);
		let shouldOpenModal = false;
		let keepEditorOpen = false;
		const resolvedAnswerId = answer_id || "";
		const resolvedTaskId = Number(taskId);
		const resolvedUserId = Number.parseInt(clientId, 10) || 0;

		try {
			if (isInIframe && taskId) {
				const result = await api.checkTaskAnswer(
					Number(taskId),
					getIframeAnswerPayload(),
					setCheckProgress
				);

				setSubmitMessage(result.message);
				shouldOpenModal = true;

				if (result.result) {
					setSubmitResult("success");
					postToParent({
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
						completion_token: result.completion_token,
					});
					return;
				}

				setSubmitResult("error");
				setOutputMismatch(null);
				setOutput("");
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
		} catch (error) {
			keepEditorOpen = maintenanceMessage(error) !== null;
			setSubmitMessage(
				maintenanceMessage(error) || (isInIframe
					? "Сервис не смог проверить решение"
					: "")
			);
			setSubmitResult("error");
			setOutputMismatch(null);
			setOutput("");
			setStatus("idle");
			shouldOpenModal = true;
		} finally {
			if (shouldOpenModal) {
				onOpen();
			}
			setIsRunning(false);
			setCheckProgress(null);

			if (!isInIframe && !keepEditorOpen) {
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
		checkProgress,
		outputMismatch,
		programOutput,
		outputImages,
		sqlResults,
		handleRunCode,
		onSendCheck,
		currentCode,
		setCurrentCode
	};
};
