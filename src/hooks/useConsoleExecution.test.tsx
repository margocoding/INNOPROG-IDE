import { act, renderHook } from '@testing-library/react';
import { api } from '../services/api';
import { useConsoleExecution } from './useConsoleExecution';
jest.mock('../services/api',()=>({api:{consoleTicket:jest.fn(),consoleSocketUrl:()=> 'ws://localhost/console'}}));
class Socket {
  static OPEN=1; readyState=1; send=jest.fn(); close=jest.fn();
  onopen:any; onmessage:any; onclose:any; onerror:any;
  static instances:Socket[]=[];
  constructor(){Socket.instances.push(this);}
  event(event:object){this.onmessage({data:JSON.stringify(event)});}
}
beforeEach(()=>{Socket.instances=[]; (global as any).WebSocket=Socket; (api.consoleTicket as jest.Mock).mockResolvedValue({ticket:'opaque'});});

test('snapshot starts once; streams output, input, EOF and stop; waits for finished',async()=>{
  const {result}=renderHook(()=>useConsoleExecution());
  await act(async()=>{await result.current.start('print(input())','py'); await result.current.start('other','py');});
  expect(Socket.instances).toHaveLength(1);
  const ws=Socket.instances[0];
  act(()=>ws.onopen());
  expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({program:'print(input())',type:'start',ticket:'opaque'});
  act(()=>{ws.event({type:'ready',seconds:30});ws.event({type:'state',state:'running'});ws.event({type:'output',data:'Имя: '});});
  expect(result.current.transcript).toBe('Имя: ');
  act(()=>{result.current.send('input','');result.current.send('eof');result.current.stop();});
  expect(result.current.isRunning).toBe(true);
  act(()=>ws.event({type:'finished',exit_code:0,comment:'Готово'}));
  expect(result.current.isRunning).toBe(false);expect(result.current.exitCode).toBe(0);
});

test('closing a live connection does not replay; unmount stops',async()=>{
  const {result,unmount}=renderHook(()=>useConsoleExecution());
  await act(async()=>{await result.current.start('x','py');});
  const ws=Socket.instances[0];
  act(()=>ws.onclose());
  expect(result.current.state).toBe('error');expect(api.consoleTicket).toHaveBeenCalled();
  unmount(); expect(ws.send).toHaveBeenCalledWith('{"type":"stop"}');
});

test('keeps output channel identity after failure and clears both channels together',async()=>{
  const {result}=renderHook(()=>useConsoleExecution());
  await act(async()=>{await result.current.start('bad','py');});
  const ws=Socket.instances[0];
  act(()=>{
    ws.event({type:'output',stream:'stdout',data:'Число: a\n'});
    ws.event({type:'output',stream:'stderr',data:'Traceback\n'});
    ws.event({type:'output',stream:'stderr',data:'ValueError\n'});
    ws.event({type:'finished',result:false,code:'exited',exit_code:1});
  });
  expect(result.current.outputChunks).toEqual([
    {stream:'stdout',text:'Число: a\n'},
    {stream:'stderr',text:'Traceback\nValueError\n'}
  ]);
  expect(result.current.state).toBe('failed');
  act(()=>result.current.clear());
  expect(result.current.outputChunks).toEqual([]);
  expect(result.current.transcript).toBe('');
});

test('bounds alternating channel metadata as well as output text',()=>{
  const {appendConsoleOutput}=require('./useConsoleExecution');
  let chunks:any[]=[];
  for(let i=0;i<2000;i++) chunks=appendConsoleOutput(chunks,'x',i%2?'stderr':'stdout');
  expect(chunks).toHaveLength(1024);
  chunks=appendConsoleOutput(chunks,'y'.repeat(1100000),'stderr');
  expect(chunks.reduce((size:number,chunk:any)=>size+chunk.text.length,0)).toBeLessThanOrEqual(1048576);
});

test('normalized stdout prompt stays neutral before a traceback',async()=>{
  const {result}=renderHook(()=>useConsoleExecution());
  await act(async()=>{await result.current.start('x','py');});
  const ws=Socket.instances[0];
  act(()=>ws.event({type:'output',stream:'stdout',data:'Число: '}));
  expect(result.current.outputChunks[0].stream).toBe('stdout');
  act(()=>result.current.send('input','a'));
  act(()=>{
    ws.event({type:'output',stream:'stdout',data:'a\n'});
    ws.event({type:'output',stream:'stderr',data:'Traceback\nValueError\n'});
    ws.event({type:'finished',result:false,exit_code:1});
  });
  expect(result.current.outputChunks).toEqual([
    {stream:'stdout',text:'Число: a\n'},
    {stream:'stderr',text:'Traceback\nValueError\n'}
  ]);
});

test('compiler diagnostics without trailing newline are never treated as an input prompt',()=>{
  const {appendConsoleOutput}=require('./useConsoleExecution');
  expect(appendConsoleOutput([],'compiler error: unfinished','stderr')).toEqual([{stream:'stderr',text:'compiler error: unfinished'}]);
});

test('capacity refusal stays a retryable busy state rather than a connection failure',async()=>{
  const {result}=renderHook(()=>useConsoleExecution());
  await act(async()=>{await result.current.start('x','py');});
  act(()=>Socket.instances[0].event({type:'error',code:'execution_busy',message:'Все места заняты'}));
  expect(result.current.state).toBe('busy');
  expect(result.current.isRunning).toBe(false);
  expect(result.current.message).toBe('Все места заняты');
});

test.each(['input','eof','interrupt','stop'] as const)('diagnostics retain their channel after %s and successful exit',async(command)=>{
  const {result}=renderHook(()=>useConsoleExecution());
  await act(async()=>{await result.current.start('x','py');});
  const ws=Socket.instances[0];
  act(()=>ws.event({type:'output',stream:'stderr',data:'warning\n'}));
  act(()=>result.current.send(command, command === 'input' ? '12' : undefined));
  act(()=>ws.event({type:'finished',result:true,exit_code:0}));
  expect(result.current.outputChunks).toEqual([{stream:'stderr',text:'warning\n'}]);
});
