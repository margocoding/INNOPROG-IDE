import { lazy, Suspense, type ComponentProps } from 'react';

const LessonMarkdown = lazy(() =>
  import('./LessonMarkdown').then(module => ({ default: module.LessonMarkdown })),
);

export function LazyLessonMarkdown(props: ComponentProps<typeof LessonMarkdown>) {
  return (
    <Suspense fallback={
      <div className="task-markdown-placeholder" role="status" aria-label="Загрузка условия задания">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
    }>
      <LessonMarkdown {...props} />
    </Suspense>
  );
}
