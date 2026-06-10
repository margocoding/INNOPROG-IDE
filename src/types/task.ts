export type TaskType = 'code' | 'paste';

export interface Task {
  id: number;
  module?: string;
  topic?: {
    id: number;
    name: string;
  };
  video?: {
    id: number;
    name: string;
  };
  title?: string;
  description: string;
  points?: number;
  type?: TaskType;
  input_description?: string;
  output_description?: string;
  note?: string;
  task_type?: TaskType;
  examples?: Example[];
  initial_code?: string;
  tests?: Test[];
  answers?: Answer[];
}

export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface Test {
  input: string;
  output: string;
}

export interface CodeCheckRequest {
  input_data: string;
  output_data: string;
  program: string;
  test_number: number;
  timeout: number;
}

export interface RunCodeRequest {
  input_data?: string;
  program: string;
  timeout?: number;
}

export interface SubmitRequest {
  user_id: number;
  task_id: number;
  program: string;
  answer_id: string;
}

export interface CheckResult {
  result: boolean;
  error?: string;
  output?: string;
  input?: string;
  transcript?: string;
  comment?: string;
  expected?: string;
}

export type RunCodeResult = CheckResult;

export interface TaskAnswerCheckRequest {
  client_id: string;
  answer_id: string;
  program: string;
}

export interface TaskAnswerCheckResult {
  result: boolean;
  message: string;
  status: number;
}

export interface Answer {
  id: number;
  code_before: string;
  code_after: string;
  input: string;
  output: string;
  hint: string;
  timeout: number;
}

export enum Language {
  JAVA = 'java',
  JS = 'js',
  BASH = 'bash',
  CPP = 'cpp',
  SQL = 'sql',
  PY = 'py',
  DART = 'dart',
  HTML = 'html'
}
