import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useConsoleExecution } from '../../../../hooks/useConsoleExecution';
import './ConsoleSection.css';

type Props = {
  execution: ReturnType<typeof useConsoleExecution>;
  activeTab: 'editor' | 'output';
  width: number;
  desktopStackedPane?: boolean;
  sharedTitle?: boolean;
  frozenLine?: string;
  detachedDraft?: { line: string; eof: boolean };
  sharedInput?: {
    line: string;
    eof: boolean;
    showMarkers: boolean;
    edit: (line: string, position: number) => void;
    moveCursor: (position: number | null) => void;
    cursors: { id: string; isLocal: boolean; color: string; position: number }[];
  };
};
const LABELS = { idle:'Готова к запуску', connecting:'Подключение…', starting:'Запуск…', compiling:'Компиляция…', running:'Выполняется', stopping:'Остановка…', finished:'Завершено', failed:'Ошибка выполнения', busy:'Сервис занят', error:'Ошибка подключения', detached:'Общий режим выключен' };

// Drop escape/control sequences; this is a line console, not a terminal emulator.
export function consoleText(value: string) {
  return value.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

export default function ConsoleSection({ execution, activeTab, width, desktopStackedPane = false, sharedTitle, sharedInput, detachedDraft, frozenLine }: Props) {
  const [localLine, setLine] = useState('');
  const line = frozenLine ?? sharedInput?.line ?? localLine;
  const localCursor = sharedInput?.cursors.find(cursor => cursor.isLocal)?.position;
  const cursorOffsets = new Map<number, number>();
  const inputColumns = sharedInput ? 32 : Math.max(32, Math.min(60, Array.from(line).length + 3));
  const [showInput, setShowInput] = useState(false);
  const [localEof, setEof] = useState(false);
  useLayoutEffect(() => {
    if (!detachedDraft) return;
    setLine(detachedDraft.line);
    setEof(detachedDraft.eof);
  }, [detachedDraft]);
  const eof = sharedInput?.eof ?? localEof;
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const localCaret = useRef<{ line: string; start: number; end: number }>();
  const [inputScroll, setInputScroll] = useState(0);
  const rememberCaret = (element: HTMLInputElement) => {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    localCaret.current = { line: element.value, start, end };
    setInputScroll(element.scrollLeft);
    return end;
  };
  useLayoutEffect(() => {
    const element = input.current;
    const previous = localCaret.current;
    if (!sharedInput || !element || document.activeElement !== element || !previous || previous.line === line) return;
    let prefix = 0;
    while (prefix < previous.line.length && prefix < line.length && previous.line[prefix] === line[prefix]) prefix++;
    let suffix = 0;
    while (suffix < previous.line.length - prefix && suffix < line.length - prefix &&
      previous.line[previous.line.length - 1 - suffix] === line[line.length - 1 - suffix]) suffix++;
    const adjust = (position: number) => {
      if (position === previous.line.length) return line.length;
      if (position <= prefix) return position;
      if (position >= previous.line.length - suffix) return Math.max(prefix, position + line.length - previous.line.length);
      return prefix;
    };
    const collapsed = previous.start === previous.end ? localCursor : undefined;
    const start = collapsed ?? adjust(previous.start);
    const end = collapsed ?? adjust(previous.end);
    element.setSelectionRange(start, end);
    localCaret.current = { line, start, end };
    setInputScroll(element.scrollLeft);
  }, [line, localCursor, sharedInput !== undefined]);
  const terminal = useRef<HTMLDivElement>(null);
  const inputAnchor = useRef<HTMLSpanElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const shortcuts = useRef<HTMLSpanElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const [inputRoom, setInputRoom] = useState(280);
  const [hideShortcuts, setHideShortcuts] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      if (terminal.current && inputAnchor.current) {
        const bounds = terminal.current.getBoundingClientRect();
        const remaining = Math.floor(bounds.right - inputAnchor.current.getBoundingClientRect().left);
        if (bounds.width > 0) setInputRoom(remaining >= 110 ? remaining : bounds.width);
      }
      if (bottom.current && shortcuts.current && actions.current) {
        const style = getComputedStyle(bottom.current);
        const space = bottom.current.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
        const needed = shortcuts.current.getBoundingClientRect().width + actions.current.getBoundingClientRect().width + (parseFloat(style.columnGap) || 12);
        if (space > 0) setHideShortcuts(needed > space);
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    [terminal.current, bottom.current, shortcuts.current, actions.current].forEach(element => { if (element) observer?.observe(element); });
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [execution.transcript, execution.state]);
  const running = execution.state === 'running';
  const showPlaceholder = execution.state === 'idle' && !execution.transcript;
  const canInput = running && showInput && !eof;
  useEffect(() => {
    if (!running) {
      setShowInput(false);
      return;
    }
    const timer = window.setTimeout(() => setShowInput(true), 750);
    return () => window.clearTimeout(timer);
  }, [running]);
  useEffect(() => {
    if (canInput && activeTab === 'output') input.current?.focus();
  }, [canInput, activeTab]);
  useEffect(() => {
    const element = scroll.current;
    if (element) element.scrollTop = execution.state === 'idle' ? 0 : element.scrollHeight;
  }, [execution.transcript, execution.state, showInput]);
  useEffect(() => {
    if (execution.state === 'connecting') { setEof(false); setLine(''); }
  }, [execution.state]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (canInput && new TextEncoder().encode(line).length <= 4000 && execution.send('input',line) && !sharedInput) setLine('');
  };
  return (
    <section className={`console-section ${activeTab === 'output' ? 'console-section--visible' : ''} ${desktopStackedPane ? 'console-section--stacked' : ''}`} style={{flexBasis:`${width}%`, "--console-width":`${width}%`} as React.CSSProperties} aria-label="Консоль программы">
      <div className="console-panel" onKeyDown={event => {
        if (event.ctrlKey && (event.code === 'KeyC' || event.key.toLowerCase() === 'c') && execution.isRunning && !window.getSelection()?.toString()) {
          event.preventDefault(); execution.send('interrupt');
        }
      }}>
        <div className="console-toolbar">
          <span className="console-title"><span className="console-symbol">&gt;_</span> {sharedTitle ? 'Общая консоль' : 'Консоль'}</span>
          <span className={`console-state ${execution.isRunning ? 'console-state--active' : ''}`} role="status">{LABELS[execution.state]}</span>
          {execution.isRunning && execution.remaining > 0 && <span className="console-time">{execution.remaining} с</span>}
          <button type="button" className="console-icon-button" onClick={execution.clear} title="Очистить экран" aria-label="Очистить консоль">⌫</button>
        </div>
        <div className="console-content" ref={scroll}>
          {showPlaceholder ? <div className="console-placeholder"><span>&gt;_</span><p>Запустите код, затем вводите данные в консоль</p></div>
          : <div ref={terminal} className="console-transcript">{execution.outputChunks?.length ? execution.outputChunks.map((chunk,index) => <span key={index} className={chunk.stream === 'stderr' ? 'console-output-error' : undefined}>{consoleText(chunk.text)}</span>) : <span>{consoleText(execution.transcript)}</span>}<span ref={inputAnchor} className="console-input-anchor" aria-hidden="true"/>
          {((running && showInput) || frozenLine !== undefined) && <form onSubmit={submit} className="console-input-row" style={{width:`min(${inputColumns}ch, ${inputRoom}px)`}}>
            <span className="console-input-field">
              <input ref={input} className={sharedInput?.showMarkers && localCursor !== undefined ? "console-input-with-local-marker" : undefined} aria-label="Ввод для программы" value={line} disabled={!canInput} autoComplete="off" spellCheck={false}
                onChange={event => {
                  if (sharedInput) sharedInput.edit(event.currentTarget.value, rememberCaret(event.currentTarget));
                  else setLine(event.currentTarget.value);
                }}
                onSelect={event => sharedInput?.moveCursor(rememberCaret(event.currentTarget))}
                onFocus={event => sharedInput?.moveCursor(rememberCaret(event.currentTarget))}
                onBlur={() => sharedInput?.moveCursor(null)}
                onScroll={event => { if (sharedInput) setInputScroll(event.currentTarget.scrollLeft); }}
                maxLength={4000} placeholder={eof ? 'Ввод завершён' : 'Введите данные'} />
              {canInput && sharedInput?.showMarkers && (
                <span className="console-remote-cursors" aria-hidden="true">
                  {sharedInput.cursors.map(cursor => {
                    const offset = cursorOffsets.get(cursor.position) ?? 0;
                    cursorOffsets.set(cursor.position, offset + 5);
                    return <span key={cursor.id} className="console-remote-position"
                      data-local={cursor.isLocal || undefined}
                      data-position={cursor.position}
                      style={{ left: offset - inputScroll, '--console-cursor-color': cursor.color } as React.CSSProperties}>
                      {line.slice(0, cursor.position)}<span className="console-remote-caret" />
                    </span>;
                  })}
                </span>
              )}
            </span>
            <button type="submit" disabled={!canInput || new TextEncoder().encode(line).length > 4000} aria-label="Отправить строку">↵</button>
          </form>}</div>}
          {execution.message && <div className={`console-result ${['error','failed'].includes(execution.state) ? 'console-result--error' : ''}`} role="status">{execution.message}{execution.exitCode !== null ? `, код выхода ${execution.exitCode}` : ''}</div>}
        </div>
        <div className="console-bottom" ref={bottom}>
          <span ref={shortcuts} aria-hidden={hideShortcuts} className={`console-shortcuts ${hideShortcuts ? 'console-shortcuts--hidden' : ''}`}>Enter — отправить, Ctrl+C — прервать</span>
          <div className="console-actions" ref={actions}>
            <button type="button" disabled={!canInput} title="Сообщить программе, что данных больше не будет (EOF); программа продолжит выполнение" onClick={() => { if (execution.send('eof') && !sharedInput) setEof(true); }}>Больше нет данных</button>
            <button type="button" className="console-stop" disabled={!execution.isRunning || execution.state === 'stopping'} onClick={execution.stop}><span>■</span> Остановить</button>
          </div>
        </div>
      </div>
    </section>
  );
}
