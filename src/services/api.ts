import axios from "axios";
import {
	Task,
	CheckResult,
	CodeCheckRequest,
	RunCodeRequest,
	RunCodeResult,
	SubmitRequest,
	TaskAnswerCheckRequest,
	TaskAnswerCheckResult,
} from "../types/task";

const API_URL = (process.env.REACT_APP_BOT_API_URL || "/bot-api").replace(/\/$/, "");
const API_REQUEST_TIMEOUT_MS = 15000;
const BASE_API = axios.create({
	baseURL: API_URL,
	timeout: API_REQUEST_TIMEOUT_MS,
	headers: {
		Authorization: "Bearer bot",
	},
});

async function fetchWithTimeout(url: string, options: RequestInit = {}) {
	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

	try {
		return await fetch(url, {
			...options,
			signal: options.signal || controller.signal,
		});
	} finally {
		window.clearTimeout(timeoutId);
	}
}

export const api = {
	async getTask(taskId: string): Promise<Task> {
		const response = await axios.get(`https://api.innoprog.ru/task/${taskId}`);
		return response.data;
	},

	async checkCode(
		data: CodeCheckRequest,
		language: string
	): Promise<CheckResult> {
		const response = await BASE_API.post(
			`https://api.innoprog.ru/check/${language}`,
			data,
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer bot",
				},
			}
		);
		return response.data;
	},

	async runCode(
		data: RunCodeRequest,
		language: string
	): Promise<RunCodeResult> {
		const runLanguage = language === "sql" ? "sqlite" : language;
		const response = await BASE_API.post(
			`https://api.innoprog.ru/code/run/${runLanguage}`,
			data,
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer bot",
				},
			}
		);
		return response.data;
	},

	async submitCode(data: SubmitRequest) {
		const response = await BASE_API.post(`/answer/code`, data);
		return response.data;
	},

	async checkTaskAnswer(
		taskId: number,
		data: TaskAnswerCheckRequest
	): Promise<TaskAnswerCheckResult> {
		const response = await BASE_API.post(
			`/task/${taskId}/check-answer`,
			data,
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer bot",
				},
				validateStatus: (status) => status < 500,
			}
		);

		return {
			...response.data,
			status: response.status,
		};
	},

	async getSubmitCode(answer_id: string, user_id: number, task_id: number) {
		const params = new URLSearchParams({
			answer_id,
			user_id: String(user_id),
			task_id: String(task_id),
		});
		const response = await fetchWithTimeout(`${API_URL}/answer/code?${params.toString()}`);
		const data = await response.json();
		return data;
	},
};
