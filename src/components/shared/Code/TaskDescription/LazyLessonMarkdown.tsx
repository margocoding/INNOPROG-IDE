import { lazy, Suspense, type ComponentProps } from 'react';

const LessonMarkdown = lazy(() =>
  import('./LessonMarkdown').then(module => ({ default: module.LessonMarkdown })),
);

export function LazyLessonMarkdown(props: ComponentProps<typeof LessonMarkdown>) {
  return <Suspense fallback={null}><LessonMarkdown {...props} /></Suspense>;
}
