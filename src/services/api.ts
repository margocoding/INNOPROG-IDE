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

const LOCAL_TASK_PREVIEWS: Record<string, Task> = {
	"10006": {
		id: 10006,
		title: "Сумма чисел от a до b",
		description:
			"Напиши программу, которая выведет сумму чисел от a до b (включительно), числа введет пользователь с новой строки, a точно меньше чем b.",
		points: 6,
		task_type: "code",
		answers: [
			{
				id: 10006,
				code_before: "",
				code_after: "",
				input: "1\n16",
				output: "136",
				hint: "",
				timeout: 30,
			},
		],
	},
};

function getLocalTaskPreview(taskId: string): Task | null {
	const hostname = window.location.hostname;
	const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
	const previewId = new URLSearchParams(window.location.search).get(
		"local_task_preview",
	);

	if (!isLocalhost || previewId !== taskId) {
		return null;
	}

	return LOCAL_TASK_PREVIEWS[previewId] || null;
}

let platformAccessToken = "";
let platformSessionPromise: Promise<string> | null = null;
let launchBrowserNonce = "";
let launchCodeFingerprint = "";
const LAUNCH_NONCE_STORAGE_KEY = "innoprog:ide:launch-nonce";

function fingerprintLaunchCode(launchCode: string): string {
	let hash = 2166136261;
	for (const character of launchCode) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function getLaunchBrowserNonce(launchCode: string): string {
	const fingerprint = fingerprintLaunchCode(launchCode);
	if (launchBrowserNonce && launchCodeFingerprint === fingerprint) {
		return launchBrowserNonce;
	}
	try {
		const stored = JSON.parse(sessionStorage.getItem(LAUNCH_NONCE_STORAGE_KEY) || "{}");
		if (stored.fingerprint === fingerprint && typeof stored.nonce === "string" && stored.nonce) {
			launchBrowserNonce = stored.nonce;
			launchCodeFingerprint = fingerprint;
			return launchBrowserNonce;
		}
	} catch {
		sessionStorage.removeItem(LAUNCH_NONCE_STORAGE_KEY);
	}
	if (!launchBrowserNonce || launchCodeFingerprint !== fingerprint) {
		launchBrowserNonce = globalThis.crypto?.randomUUID?.()
			|| `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
		launchCodeFingerprint = fingerprint;
		try {
			sessionStorage.setItem(
				LAUNCH_NONCE_STORAGE_KEY,
				JSON.stringify({ fingerprint, nonce: launchBrowserNonce }),
			);
		} catch {
			// Same-page retries remain safe when storage is unavailable.
		}
	}
	return launchBrowserNonce;
}

export function clearPlatformAccessSession(): void {
	platformAccessToken = "";
	platformSessionPromise = null;
}

async function restorePlatformSession(): Promise<string> {
	if (platformAccessToken) return platformAccessToken;
	if (platformSessionPromise) return platformSessionPromise;
	platformSessionPromise = (async () => {
		const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
		const launchCode = String(fragment.get("launch_code") || "").trim();
		const incoming = String(fragment.get("platform_auth") || fragment.get("auth") || "").trim();
		const clearIncomingCredential = () => {
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
		};
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
					? JSON.stringify({
						launch_code: launchCode,
						target_service: "ide",
						browser_nonce: getLaunchBrowserNonce(launchCode),
					})
					: (incoming ? JSON.stringify({ auth: incoming }) : undefined),
			},
		);
		if (!response.ok) return "";
		const payload = await response.json();
		platformAccessToken = String(payload?.access_token || "").trim();
		if (platformAccessToken && (launchCode || incoming)) {
			clearIncomingCredential();
		}
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
		const localPreview = getLocalTaskPreview(taskId);
		if (localPreview) {
			return localPreview;
		}

		try {
			const headers = await protectedTaskHeaders();
			const response = await axios.get(`https://api.innoprog.ru/task/${taskId}`, {
				params: { client_id: clientId },
				headers,
				withCredentials: true,
			});
			return response.data;
		} catch (error: any) {
			if (error?.response?.status !== 401) throw error;
			clearPlatformAccessSession();
			const headers = await protectedTaskHeaders();
			if (!headers.Authorization && !headers["X-Telegram-Init-Data"]) throw error;
			const response = await axios.get(`https://api.innoprog.ru/task/${taskId}`, {
				params: { client_id: clientId },
				headers,
				withCredentials: true,
			});
			return response.data;
		}
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
