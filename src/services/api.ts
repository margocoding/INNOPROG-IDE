import axios from "axios";
import { currentRoomToken, currentRoomUser, saveRoomSession } from "../utils/roomSession";
import { isRoomTokenExpired } from "../utils/roomToken";
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
// Runner budget includes queue/compilation (235s); API 240s, proxies 250s.
// Leave time for the server to return its structured timeout response.
const CODE_EXECUTION_TIMEOUT_MS = 260000;
const TASK_CHECK_TIMEOUT_MS = 90000;
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

async function restorePlatformSession(bootstrapTimeoutMs = API_REQUEST_TIMEOUT_MS): Promise<string> {
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
		const response = await fetchWithTimeout(
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
			bootstrapTimeoutMs,
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

async function protectedTaskHeaders(bootstrapTimeoutMs = API_REQUEST_TIMEOUT_MS): Promise<Record<string, string>> {
	const headers: Record<string, string> = {};
	const platformToken = platformAccessToken || await restorePlatformSession(bootstrapTimeoutMs);
	const telegramInitData = String(window.Telegram?.WebApp?.initData || "").trim();
	if (platformToken) {
		headers.Authorization = `Bearer ${platformToken}`;
	} else if (telegramInitData) {
		headers["X-Telegram-Init-Data"] = telegramInitData;
	}
	return headers;
}

async function executionHeaders(): Promise<Record<string, string>> {
	const roomId = new URLSearchParams(window.location.search).get("roomId");
	if (roomId) {
		let token = currentRoomToken(roomId);
		if (token && isRoomTokenExpired(token)) {
			const user = currentRoomUser(roomId);
			const response = await fetchWithTimeout(`/api/room/${encodeURIComponent(roomId)}/token`, {
				method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
				body: JSON.stringify(user && /^i\d+$/.test(user) ? { telegramId: user } : {}),
			});
			if (!response.ok) throw new Error("Не удалось обновить доступ к комнате");
			const session = await response.json();
			if (!session.roomToken || session.telegramId !== user) throw new Error("Переподключитесь к комнате перед запуском кода");
			saveRoomSession(roomId, session.telegramId, session.roomToken);
			token = session.roomToken;
		}
		// A room never silently falls back to the restricted anonymous mode.
		if (!token) throw new Error("Дождитесь подключения к комнате перед запуском кода");
		return { "X-Room-ID": roomId, "X-Room-Token": token };
	}
	const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
	const params = new URLSearchParams(window.location.search);
	const explicitCredential = ["launch_code", "platform_auth", "auth"].some((key) => Boolean(fragment.get(key)));
	const educationalContext = Boolean(platformAccessToken || explicitCredential || params.get("task_id") || params.get("taskId") || params.get("client_id"));
	const telegram = String(window.Telegram?.WebApp?.initData || "").trim();
	if (telegram && !platformAccessToken && !explicitCredential) return { "X-Telegram-Init-Data": telegram };
	let headers: Record<string, string>;
	try {
		headers = await protectedTaskHeaders(educationalContext ? API_REQUEST_TIMEOUT_MS : 2000);
	} catch (error) {
		// An optional cookie lookup must not make the public offline IDE depend
		// on another origin. Known educational identities never downgrade.
		if (educationalContext) throw error;
		return {};
	}
	if (educationalContext && !headers.Authorization && !headers["X-Telegram-Init-Data"]) {
		throw new Error("Не удалось восстановить учебную сессию");
	}
	if (headers.Authorization) {
		headers["X-Platform-Auth"] = headers.Authorization.slice(7);
	}
	return headers;
}

async function withExecutionRetry<T>(request: (headers: Record<string, string>) => Promise<T>): Promise<T> {
	try {
		return await request(await executionHeaders());
	} catch (error) {
		if (!isUnauthorizedResponse(error) || new URLSearchParams(window.location.search).get("roomId")) throw error;
		clearPlatformAccessSession();
		const refreshed = await executionHeaders();
		if (!refreshed["X-Platform-Auth"] && !refreshed["X-Telegram-Init-Data"]) throw error;
		return request(refreshed);
	}
}

function isUnauthorizedResponse(value: any): boolean {
	return Number(value?.status ?? value?.response?.status) === 401;
}

async function withProtectedTaskRetry<T>(
	request: (headers: Record<string, string>) => Promise<T>,
): Promise<T> {
	try {
		const response = await request(await protectedTaskHeaders());
		if (!isUnauthorizedResponse(response)) return response;
	} catch (error) {
		if (!isUnauthorizedResponse(error)) throw error;
	}

	clearPlatformAccessSession();
	return request(await protectedTaskHeaders());
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = API_REQUEST_TIMEOUT_MS) {
	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

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
				timeout: API_REQUEST_TIMEOUT_MS,
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
				timeout: API_REQUEST_TIMEOUT_MS,
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
		const response = await withExecutionRetry((headers) => BASE_API.post(
			`/check/${language}`,
			data,
			{
				timeout: CODE_EXECUTION_TIMEOUT_MS,
				headers: {
					...headers,
					"Content-Type": "application/json",
				},
			}
		));
		return response.data;
	},

	async runCode(
		data: RunCodeRequest,
		language: string
	): Promise<RunCodeResult> {
		const runLanguage = language === "sql" ? "sqlite" : language;
		const response = await withExecutionRetry((headers) => BASE_API.post(
			`/code/run/${runLanguage}`,
			data,
			{
				timeout: CODE_EXECUTION_TIMEOUT_MS,
				headers: {
					...headers,
					"Content-Type": "application/json",
				},
			}
		));
		return response.data;
	},

	async submitCode(data: SubmitRequest) {
		const response = await withProtectedTaskRetry((headers) =>
			BASE_API.post(`/answer/code`, data, {
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				withCredentials: true,
			}),
		);
		return response.data;
	},

	async checkTaskAnswer(
		taskId: number,
		data: TaskAnswerCheckRequest
	): Promise<TaskAnswerCheckResult> {
		const response = await withProtectedTaskRetry((headers) =>
			BASE_API.post(
				`/task/${taskId}/check-answer`,
				data,
				{
					timeout: TASK_CHECK_TIMEOUT_MS,
					withCredentials: true,
					headers: {
					"Content-Type": "application/json",
					...headers,
				},
				validateStatus: (status) => status < 500,
				},
			),
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
		const response = await withProtectedTaskRetry(async (headers) => {
			const read = () => fetchWithTimeout(`${API_URL}/answer/code?${params.toString()}`, {
				headers, credentials: "include",
			});
			// This GET is safe to repeat. Do not retry writes, invalid payloads,
			// or permission failures, and never substitute an empty saved answer.
			let result: Response;
			try {
				result = await read();
			} catch (error) {
				if (!(error instanceof TypeError) && (error as Error)?.name !== "AbortError") throw error;
				return read();
			}
			return result.status >= 500 ? read() : result;
		});
		if (!response.ok) {
			throw new Error(`Failed to load submitted code: ${response.status}`);
		}
		const data = await response.json();
		if (
			!data ||
			typeof data !== "object" ||
			(data.status && data.status !== "success") ||
			typeof data.code !== "string"
		) {
			throw new Error("Invalid submitted-code response");
		}
		return data;
	},
};
