import { render, screen } from '@testing-library/react';
import { LessonMarkdown } from './LessonMarkdown';

it('formats lesson Markdown without allowing embedded markup or unsafe URLs', () => {
  const { container } = render(<LessonMarkdown source={[
    '## Условие',
    '**Решение**',
    '<img src="x" onerror="alert(1)">',
    '',
    '[опасная ссылка](javascript:alert%281%29)',
    '[пример](https://example.com)',
    '![изображение](https://example.com/track)',
  ].join('\n\n')} />);

  expect(screen.getByRole('heading', { name: 'Условие' })).toBeInTheDocument();
  expect(screen.getByText('Решение').tagName).toBe('STRONG');
  expect(screen.getByRole('link', { name: 'пример' })).toHaveAttribute('href', 'https://example.com');
  expect(screen.queryByRole('link', { name: 'опасная ссылка' })).toBeNull();
  expect(container.querySelector('img')).toBeNull();
});
