import { Language } from './task';

export interface LessonModule {
  id: number;
  name: string;
  language: Language | null;
}

export interface RoomLessonTask {
  title: string;
  description: string;
  descriptionFormat?: 'markdown';
  moduleId: number;
  language: Language;
  initialCode: string;
  input: string;
  output?: string;
  before?: string;
  after?: string;
  topic?: string;
  platformId?: number;
}

export interface RoomLessonState {
  revision: number;
  key: string;
  task: RoomLessonTask | null;
  language: Language;
}

export type LessonSelection = { source: 'free' } |
  { source: 'personal'; id: string } | { source: 'platform'; id: number };
