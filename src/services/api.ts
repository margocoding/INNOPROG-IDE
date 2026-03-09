import axios from "axios";
import {
	Task,
	CheckResult,
	CodeCheckRequest,
	SubmitRequest,
	TaskAnswerCheckRequest,
	TaskAnswerCheckResult,
} from "../types/task";

const API_URL = "https://bot.innoprog.ru:8443";
const BASE_API = axios.create({
	baseURL: API_URL,
	headers: {
		Authorization: "Bearer bot",
	},
});

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

	async getSubmitCode(answer_id: string, user_id: string, task_id: number) {
		const response = await fetch(
			`https://bot.innoprog.ru:8443/answer/code?answer_id=${answer_id}&user_id=${user_id}&task_id=${task_id}`
		);
		const data = await response.json();
		return data;
	},
};
