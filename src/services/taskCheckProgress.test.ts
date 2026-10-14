import { taskCheckProgressDecoder } from './taskCheckProgress';

it('handles cumulative fragmented progress and preserves the final completion proof', () => {
  const progress = jest.fn();
  const decoder = taskCheckProgressDecoder(progress);
  const first = JSON.stringify({ type: 'progress', completed: 0, total: 26 }) + '\n';
  const second = JSON.stringify({ type: 'progress', completed: 8, total: 26 }) + '\n';
  const final = JSON.stringify({ type: 'result', status: 200, data: { result: true, message: 'Верно', completion_token: 'proof' } }) + '\n';
  decoder.consume(first.slice(0, 10));
  decoder.consume(first + second.slice(0, 15));
  decoder.consume(first + second);
  expect(progress.mock.calls.map(([value]) => value.completed)).toEqual([0, 8]);
  expect(decoder.finish(first + second + final, 200).completion_token).toBe('proof');
});

it('does not accept a disconnected stream as successful verification', () => {
  const decoder = taskCheckProgressDecoder(jest.fn());
  expect(() => decoder.finish('{"type":"progress","completed":8,"total":26}\n', 200)).toThrow('прервалась');
});

it('rejects invalid progress and keeps ordinary authentication errors', () => {
  expect(taskCheckProgressDecoder(jest.fn()).finish('{"result":false,"message":"Forbidden"}', 403).status).toBe(403);
  const decoder = taskCheckProgressDecoder(jest.fn());
  expect(() => decoder.finish('{"type":"progress","completed":99,"total":26}\n', 200)).toThrow('прогресс');
});
