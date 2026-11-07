import React from 'react';
import { TextEncoder } from 'node:util';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ConsoleSection from './ConsoleSection';

const base = {state:'idle',outputChunks:[],transcript:'',message:'',exitCode:null,remaining:0,isRunning:false,start:jest.fn(),stop:jest.fn(),send:jest.fn(()=>true),clear:jest.fn()};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const revealInput = () => act(() => { jest.advanceTimersByTime(750); });

beforeAll(()=>{Object.defineProperty(global,'TextEncoder',{value:TextEncoder,configurable:true});});

test('failed execution highlights the traceback itself, not only the completion message',()=>{
  const traceback="Traceback (most recent call last):\nValueError: invalid number";
  render(<ConsoleSection activeTab="output" width={50} execution={{...base,state:'failed',transcript:'Число: a\n'+traceback,outputChunks:[{text:'Число: a\n',stream:'stdout'},{text:traceback,stream:'stderr'}],message:'Программа завершена',exitCode:1}}/>);
  expect(screen.getByText(/ValueError: invalid number/)).toHaveClass('console-output-error');
  expect(screen.getByText('Число: a')).not.toHaveClass('console-output-error');
  expect(screen.getByText(/ValueError: invalid number/).closest('.console-transcript')).not.toHaveClass('console-output-error');
  expect(screen.getByText('Программа завершена, код выхода 1')).toBeInTheDocument();
});

test('sends a long input intact and retains EOF as a separate action',()=>{
  const send=jest.fn(()=>true);
  render(<ConsoleSection activeTab="output" width={50} execution={{...base,state:'running',isRunning:true,send}}/>);
  revealInput();
  const input=screen.getByRole('textbox',{name:'Ввод для программы'});
  const line='1234567890'.repeat(8);
  fireEvent.change(input,{target:{value:line}});
  fireEvent.submit(input.closest('form')!);
  expect(send).toHaveBeenCalledWith('input',line);
  expect(input).toHaveValue('');
  fireEvent.click(screen.getByRole('button',{name:'Больше нет данных'}));
  expect(send).toHaveBeenCalledWith('eof');
  expect(input).toBeDisabled();
});


test.each(['c', 'с'])('Ctrl+C interrupts with key %s and the physical C key', key => {
  const send = jest.fn(() => true);
  render(<ConsoleSection activeTab="output" width={50} execution={{...base,state:'running',isRunning:true,send}}/>);
  revealInput();
  fireEvent.keyDown(screen.getByRole('textbox',{name:'Ввод для программы'}), {key,code:'KeyC',ctrlKey:true});
  expect(send).toHaveBeenCalledWith('interrupt');
});

test('Ctrl+C keeps selected transcript text available for copy', () => {
  const send = jest.fn(() => true);
  const selection = jest.spyOn(window, 'getSelection').mockReturnValue({toString:()=> 'selected output'} as Selection);
  render(<ConsoleSection activeTab="output" width={50} execution={{...base,state:'running',isRunning:true,send}}/>);
  revealInput();
  fireEvent.keyDown(screen.getByRole('textbox',{name:'Ввод для программы'}), {key:'с',code:'KeyC',ctrlKey:true});
  expect(send).not.toHaveBeenCalled();
  selection.mockRestore();
});

test('a fast print-only run shows its output and finish without flashing an input field', () => {
  const { rerender } = render(<ConsoleSection activeTab="output" width={50} execution={{...base, state: 'running', isRunning: true}} />);
  expect(screen.queryByRole('textbox')).toBeNull();
  rerender(<ConsoleSection activeTab="output" width={50} execution={{...base, state: 'finished', transcript: '123', message: 'Программа завершена', exitCode: 0}} />);
  revealInput();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByText('123')).toBeInTheDocument();
  expect(screen.getByText('Программа завершена, код выхода 0')).toBeInTheDocument();
});
