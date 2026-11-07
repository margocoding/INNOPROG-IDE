import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useConsoleExecution } from '../../../../hooks/useConsoleExecution';
import './ConsoleSection.css';

type Props = {
  execution: ReturnType<typeof useConsoleExecution>;
  activeTab: 'editor' | 'output';
  width: number;
  desktopStackedPane?: boolean;
};
const LABELS = { idle:'Готова к запуску', connecting:'Подключение…', starting:'Запуск…', compiling:'Компиляция…', running:'Выполняется', stopping:'Остановка…', finished:'Завершено', failed:'Ошибка выполнения', busy:'Сервис занят', error:'Ошибка подключения' };

// Drop escape/control sequences; this is a line console, not a terminal emulator.
export function consoleText(value: string) {
  return value.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

export default function ConsoleSection({ execution, activeTab, width, desktopStackedPane = false }: Props) {
  const [line, setLine] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [eof, setEof] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
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
    if (canInput && new TextEncoder().encode(line).length <= 4000 && execution.send('input',line)) setLine('');
  };
  return (
    <section className={`console-section ${activeTab === 'output' ? 'console-section--visible' : ''} ${desktopStackedPane ? 'console-section--stacked' : ''}`} style={{flexBasis:`${width}%`, "--console-width":`${width}%`} as React.CSSProperties} aria-label="Консоль программы">
      <div className="console-panel" onKeyDown={event => {
        if (event.ctrlKey && (event.code === 'KeyC' || event.key.toLowerCase() === 'c') && execution.isRunning && !window.getSelection()?.toString()) {
          event.preventDefault(); execution.send('interrupt');
        }
      }}>
        <div className="console-toolbar">
          <span className="console-title"><span className="console-symbol">&gt;_</span> Консоль</span>
          <span className={`console-state ${execution.isRunning ? 'console-state--active' : ''}`} role="status">{LABELS[execution.state]}</span>
          {execution.isRunning && execution.remaining > 0 && <span className="console-time">{execution.remaining} с</span>}
          <button type="button" className="console-icon-button" onClick={execution.clear} title="Очистить экран" aria-label="Очистить консоль">⌫</button>
        </div>
        <div className="console-content" ref={scroll}>
          {!execution.transcript && execution.state === 'idle' && <div className="console-placeholder"><span>&gt;_</span><p>Запустите код, затем вводите данные в консоль</p></div>}
          <div ref={terminal} className="console-transcript">{execution.outputChunks?.length ? execution.outputChunks.map((chunk,index) => <span key={index} className={chunk.stream === 'stderr' ? 'console-output-error' : undefined}>{consoleText(chunk.text)}</span>) : <span>{consoleText(execution.transcript)}</span>}<span ref={inputAnchor} className="console-input-anchor" aria-hidden="true"/>
          {running && showInput && <form onSubmit={submit} className="console-input-row" style={{width:`min(${Math.max(32, Math.min(60, Array.from(line).length + 3))}ch, ${inputRoom}px)`}}>
            <input ref={input} aria-label="Ввод для программы" value={line} disabled={!canInput} autoComplete="off" spellCheck={false}
              onChange={event => setLine(event.target.value)} maxLength={4000} placeholder={eof ? 'Ввод завершён' : 'Введите данные'} />
            <button type="submit" disabled={!canInput || new TextEncoder().encode(line).length > 4000} aria-label="Отправить строку">↵</button>
          </form>}</div>
          {execution.message && <div className={`console-result ${['error','failed'].includes(execution.state) ? 'console-result--error' : ''}`} role="status">{execution.message}{execution.exitCode !== null ? `, код выхода ${execution.exitCode}` : ''}</div>}
        </div>
        <div className="console-bottom" ref={bottom}>
          <span ref={shortcuts} aria-hidden={hideShortcuts} className={`console-shortcuts ${hideShortcuts ? 'console-shortcuts--hidden' : ''}`}>Enter — отправить, Ctrl+C — прервать</span>
          <div className="console-actions" ref={actions}>
            <button type="button" disabled={!canInput} title="Сообщить программе, что данных больше не будет (EOF); программа продолжит выполнение" onClick={() => { if (execution.send('eof')) setEof(true); }}>Больше нет данных</button>
            <button type="button" className="console-stop" disabled={!execution.isRunning || execution.state === 'stopping'} onClick={execution.stop}><span>■</span> Остановить</button>
          </div>
        </div>
      </div>
    </section>
  );
}
