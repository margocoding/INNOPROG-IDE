import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

const mockUseWebSocket = jest.fn((_params?: unknown) => ({ telegramId: null }));

jest.mock('./components/shared/Room/Cursor/Cursor', () => () => <div data-testid="cursor" />);
jest.mock('./components/shared/Code/IDE/IDE', () => () => <div data-testid="ide" />);
jest.mock('./hooks/useWebSocket', () => ({
  useWebSocket: (params: unknown) => mockUseWebSocket(params),
}));

beforeEach(() => {
  sessionStorage.clear();
  mockUseWebSocket.mockClear();
  mockUseWebSocket.mockImplementation((_params?: unknown) => ({ telegramId: null }));
});

test('renders the IDE shell and passes URL room parameters to the app', () => {
  window.history.pushState({}, '', '/?roomId=room-1&roomToken=token-1&telegramId=123');
  render(<App />);
  expect(screen.getByTestId('cursor')).toBeInTheDocument();
  expect(screen.getByTestId('ide')).toBeInTheDocument();
  expect(window.location.search).toBe('?roomId=room-1');
  expect(mockUseWebSocket).toHaveBeenCalledWith(expect.objectContaining({
    myTelegramId: '123', roomToken: 'token-1',
  }));
});

test('passes a fragment launch code without keeping it in the address bar', () => {
  window.history.pushState({}, '', '/?roomId=room-1#launchCode=single-use-code');
  render(<App />);
  expect(window.location.hash).toBe('');
  expect(mockUseWebSocket).toHaveBeenCalledWith(expect.objectContaining({
    roomLaunchCode: 'single-use-code',
  }));
});
