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
});

let platformAccessToken = "";
let platformSessionPromise: Promise<string> | null = null;

async function restorePlatformSession(): Promise<string> {
	if (platformAccessToken) return platformAccessToken;
	if (platformSessionPromise) return platformSessionPromise;
	platformSessionPromise = (async () => {
		const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
		const launchCode = String(fragment.get("launch_code") || "").trim();
		const incoming = String(fragment.get("platform_auth") || fragment.get("auth") || "").trim();
		if (launchCode || incoming) {
			fragment.delete("launch_code");
			fragment.delete("target_service");
			fragment.delete("platform_auth");
			fragment.delete("auth");
			const suffix = fragment.toString();
			window.history.replaceState(
				null,
				"",
				`${window.location.pathname}${window.location.search}${suffix ? `#${suffix}` : ""}`,
			);
		}
		const endpoint = launchCode
			? "/platform/session/launch/exchange"
			: (incoming ? "/platform/session/magic-link/exchange" : "/platform/session/refresh");
		const response = await fetch(
			`https://api.innoprog.ru${endpoint}`,
			{
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: launchCode
					? JSON.stringify({ launch_code: launchCode, target_service: "ide" })
					: (incoming ? JSON.stringify({ auth: incoming }) : undefined),
			},
		);
		if (!response.ok) return "";
		const payload = await response.json();
		platformAccessToken = String(payload?.access_token || "").trim();
		return platformAccessToken;
	})().finally(() => {
		platformSessionPromise = null;
	});
	return platformSessionPromise;
}

async function protectedTaskHeaders(): Promise<Record<string, string>> {
	const headers: Record<string, string> = {};
	const platformToken = platformAccessToken || await restorePlatformSession();
	const telegramInitData = String(window.Telegram?.WebApp?.initData || "").trim();
	if (platformToken) {
		headers.Authorization = `Bearer ${platformToken}`;
	} else if (telegramInitData) {
		headers["X-Telegram-Init-Data"] = telegramInitData;
	}
	return headers;
}

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
	async getTask(taskId: string, clientId: string): Promise<Task> {
		const response = await axios.get(`https://api.innoprog.ru/task/${taskId}`, {
			params: { client_id: clientId },
			headers: await protectedTaskHeaders(),
			withCredentials: true,
		});
		return response.data;
	},

	async checkCode(
		data: CodeCheckRequest,
		language: string
	): Promise<CheckResult> {
		const response = await BASE_API.post(
			`/check/${language}`,
			data,
			{
				headers: {
					"Content-Type": "application/json",
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
			`/code/run/${runLanguage}`,
			data,
			{
				headers: {
					"Content-Type": "application/json",
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
					...await protectedTaskHeaders(),
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
