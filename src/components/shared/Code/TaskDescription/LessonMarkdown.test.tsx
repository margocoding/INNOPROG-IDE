import { fireEvent, render, screen } from '@testing-library/react';
import { LessonMarkdown } from './LessonMarkdown';

it('formats lesson Markdown without allowing embedded markup or unsafe URLs', () => {
  const { container } = render(<LessonMarkdown source={[
    '## Условие',
    '**Решение**',
    '<img src="x" onerror="alert(1)">',
    '<iframe src="https://example.com"></iframe>',
    '<span style="background:url(https://example.com)">Стили</span>',
    '',
    '[опасная ссылка](javascript:alert%281%29)',
    '[пример](https://example.com)',
    '![изображение](https://example.com/image.png)',
    '![опасное изображение](javascript:alert%281%29)',
    '<u onclick="alert(1)">текст</u>',
    'Сноска[^" onmouseover="alert(1)]',
    '[^" onmouseover="alert(1)]: Примечание',
    String.raw`$\href{javascript:alert(1)}{unsafe}$`,

  ].join('\n\n')} />);

  expect(screen.getByRole('heading', { name: 'Условие' })).toBeInTheDocument();
  expect(screen.getByText('Решение').tagName).toBe('STRONG');
  expect(screen.getByRole('link', { name: 'пример' })).toHaveAttribute('href', 'https://example.com');
  expect(screen.queryByRole('link', { name: 'опасная ссылка' })).toBeNull();
  expect(screen.getByRole('img', { name: 'изображение' })).toHaveAttribute('referrerpolicy', 'no-referrer');
  expect(screen.queryByRole('img', { name: 'опасное изображение' })).toBeNull();
  expect(container.querySelectorAll('img')).toHaveLength(1);
  expect(container.querySelector('iframe, [onerror], [onclick], [onmouseover], [href^="javascript:"], [style*="url("]')).toBeNull();

});

it('renders formulas, footnotes, disclosure and inline formatting from a lesson', () => {
  const { container } = render(<LessonMarkdown source={[
    '<u>Подчёркнуто</u> и ==Выделено==, код `O(n²)`.',
    'Математика: $E = mc^2$',
    'Сноска[^1]',
    '[^1]: Текст сноски.',
    '<details>\n<summary>Раскрывающийся блок</summary>\n\nСкрытый **текст**.\n\n</details>',
  ].join('\n\n')} />);
  expect(container.querySelector('u')).toHaveTextContent('Подчёркнуто');
  expect(container.querySelector('mark')).toHaveTextContent('Выделено');
  expect(container.querySelector('code')).toHaveTextContent('O(n²)');
  expect(container.querySelector('math')).not.toBeNull();
  const reference = screen.getByRole('link', { name: '1' });
  expect(document.getElementById(reference.getAttribute('href')!.slice(1))).toHaveTextContent('Текст сноски.');
  expect(container.querySelector('details')).not.toHaveAttribute('open');
  expect(container.querySelector('details strong')).toHaveTextContent('текст');
});

it('copies only the chosen code block without changing the code', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    render(<LessonMarkdown source={[
      '```python', 'print(1)', '```', '',
      '```cpp title="example.cpp" linenums="1" hl_lines="2"', '  if (a < b && x > y) {', '    return;', '  }', '```',
    ].join('\n')} />);
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('C++, example.cpp')).toBeInTheDocument();
    expect(document.querySelector('.lesson-markdown-highlight-line')).toHaveAttribute('data-line-number', '2');
    fireEvent.click(screen.getAllByRole('button', { name: 'Копировать' })[1]);
    expect(writeText).toHaveBeenCalledWith('  if (a < b && x > y) {\n    return;\n  }');
    expect(await screen.findByText('Код скопирован')).toBeInTheDocument();
  } finally {
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});

it('renders lesson dialects and resolves document links without changing the room URL', () => {
  const source = [
    '---', 'title: Test', 'published: true', '---', '',
    '[Перейти](#11-таблицы)', '', '## 11. Таблицы [GFM]', '',
    '#### Кастомный {#custom}', '',
    '+++', '', '++подчёркнуто++ и H~2~O.', '',
    String.raw`Экранирование \(круглые\) и формула \(x^2\).`, '',
    String.raw`\[`, 'x^3', String.raw`\]`, '',
    '> [!WARNING]', '> Пример предупреждения', '',
    'Markdown', ': Определение с `кодом`.', '',
    'HTML', '', '*[HTML]: HyperText Markup Language', '',
    '<details open><summary>Открытый блок</summary>Внутри</details>', '',
    'Сноска^[Встроенная сноска].', '', '[TOC]',
  ].join('\n');
  const { container } = render(<LessonMarkdown source={source} />);
  expect(screen.queryByText('published: true')).toBeNull();
  const target = screen.getByRole('heading', { name: '11. Таблицы [GFM]' });
  expect(screen.getByRole('link', { name: 'Перейти' })).toHaveAttribute('href', '#' + target.id);
  expect(screen.getByRole('navigation', { name: 'Оглавление' })).toBeInTheDocument();
  expect(container.querySelectorAll('math')).toHaveLength(2);
  expect(screen.getByText(/Экранирование \(круглые\)/)).toBeInTheDocument();
  expect(container.querySelector('.lesson-markdown-callout--warning')).toHaveTextContent('Пример предупреждения');
  expect(container.querySelector('dl dd')).toHaveTextContent('Определение с кодом');
  expect(container.querySelector('abbr')).toHaveAttribute('title', 'HyperText Markup Language');
  expect(container.querySelector('details')).toHaveAttribute('open');
  expect(container.querySelector('.footnotes')).toHaveTextContent('Встроенная сноска');
});

it('colors code by its language while keeping numbered multiline tokens and plain text intact', () => {
  const { container } = render(<LessonMarkdown language="py" source={[
    '```sql linenums="3"', '/* first line', 'second line */', 'SELECT 1;', '```', '',
    '```', 'return 2', '```', '',
    '```text', '<img src=x onerror=alert(1)>', '```',
  ].join('\n')} />);
  const [sql, python, plain] = container.querySelectorAll('pre code');
  expect(sql.querySelector('[data-line-number="3"] .token.comment')).toHaveTextContent('/* first line');
  expect(sql.querySelector('[data-line-number="4"] .token.comment')).toHaveTextContent('second line */');
  expect(sql.querySelector('.token.keyword')).toHaveTextContent('SELECT');
  expect(python.querySelector('.token.keyword')).toHaveTextContent('return');
  expect(plain.textContent).toBe('<img src=x onerror=alert(1)>');
  expect(plain.querySelector('img, .token')).toBeNull();
});
