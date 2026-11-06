import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export type ConsoleState = 'idle' | 'connecting' | 'starting' | 'compiling' | 'running' | 'stopping' | 'finished' | 'failed' | 'busy' | 'error';
export const CONSOLE_LANGUAGES = new Set(['py', 'cpp', 'java', 'js', 'bash', 'dart']);

export type ConsoleOutputChunk = { text: string; stream: 'stdout' | 'stderr' };

export function appendConsoleOutput(previous: ConsoleOutputChunk[], text: string, stream: 'stdout' | 'stderr'): ConsoleOutputChunk[] {
  if (!text) return previous;
  const chunks = previous.slice();
  let data = text;
  const last = chunks[chunks.length - 1];
  if (last?.stream === stream) {
    chunks[chunks.length - 1] = { stream, text: last.text + data };
  } else chunks.push({ stream, text: data });
  let excess = chunks.reduce((total, chunk) => total + chunk.text.length, 0) - 1048576;
  while (excess > 0 && chunks.length) {
    if (chunks[0].text.length <= excess) excess -= chunks.shift()!.text.length;
    else { chunks[0] = { ...chunks[0], text: chunks[0].text.slice(excess) }; excess = 0; }
  }
  return chunks.slice(-1024);
}

export function useConsoleExecution() {
  const [state, setState] = useState<ConsoleState>('idle');
  const [outputChunks, setOutputChunks] = useState<ConsoleOutputChunk[]>([]);
  const transcript = outputChunks.map(chunk => chunk.text).join('');
  const [message, setMessage] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const deadline = useRef(0);
  const isRunning = ['connecting','starting','compiling','running','stopping'].includes(state);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const send = useCallback((type: 'input' | 'eof' | 'interrupt' | 'stop', data?: string) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return false;
    socket.current.send(JSON.stringify(data === undefined ? { type } : { type, data }));
    return true;
  }, []);

  const stop = useCallback(() => {
    if (!active.current) return;
    setState('stopping');
    if (!send('stop')) {
      generation.current++;
      socket.current?.close();
      active.current = false;
      setState('finished');
      setMessage('Остановлено');
    }
  }, [send]);

  const start = useCallback(async (program: string, lang: string) => {
    if (active.current || !CONSOLE_LANGUAGES.has(lang)) return;
    active.current = true;
    const run = ++generation.current;
    setOutputChunks([]); setMessage(''); setExitCode(null); setRemaining(0);
    setState('connecting');
    deadline.current = 0;
    try {
      const ticket = await api.consoleTicket();
      if (run !== generation.current) return;
      const ws = new WebSocket(api.consoleSocketUrl());
      socket.current = ws;
      let terminal = false;
      const connectionTimer = window.setTimeout(() => {
        if (run === generation.current && !deadline.current) ws.close();
      }, 15000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start', ticket: ticket.ticket, program, lang }));
      ws.onmessage = ({ data }) => {
        if (run !== generation.current) return;
        try {
          const event = JSON.parse(data);
          if (event.type === 'ready') {
            deadline.current = Date.now() + event.seconds * 1000;
            setRemaining(event.seconds); setState('starting');
            window.clearTimeout(connectionTimer);
          } else if (event.type === 'state' && ['starting','compiling','running'].includes(event.state)) {
            setState(current => current === 'stopping' ? current : event.state);
          } else if (event.type === 'output' && typeof event.data === 'string') {
            // Render only text. Never interpret terminal output as HTML/links.
            setOutputChunks(previous => appendConsoleOutput(previous, event.data, event.stream === 'stderr' ? 'stderr' : 'stdout'));
          } else if (event.type === 'finished' || event.type === 'error') {
            terminal = true; active.current = false;
            setState(event.type === 'error' ? (event.code === 'execution_busy' ? 'busy' : 'error') : event.result === false && event.code !== 'stopped' ? 'failed' : 'finished');
            setExitCode(typeof event.exit_code === 'number' ? event.exit_code : null);
            setMessage(event.message || event.comment || 'Программа завершена');
            ws.close();
          }
        } catch { ws.close(); }
      };
      ws.onclose = () => {
        window.clearTimeout(connectionTimer);
        if (run !== generation.current) return;
        active.current = false;
        if (!terminal) {
          setState('error');
          setMessage('Соединение прервано. Запуск остановлен; повторите его вручную.');
        }
      };
      ws.onerror = () => ws.close();
    } catch (error) {
      if (run !== generation.current) return;
      active.current = false; setState('error');
      setMessage(error instanceof Error ? error.message : 'Не удалось подключиться к консоли');
    }
  }, []);

  useEffect(() => () => {
    generation.current++;
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({type:'stop'}));
    socket.current?.close();
  }, []);

  return { state, transcript, outputChunks, message, exitCode, remaining, isRunning, start, stop, send, clear: () => setOutputChunks([]) };
}
