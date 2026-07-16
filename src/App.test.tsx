import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./components/shared/Room/Cursor/Cursor', () => () => <div data-testid="cursor" />);
jest.mock('./components/shared/Code/IDE/IDE', () => () => <div data-testid="ide" />);
jest.mock('./hooks/useWebSocket', () => ({
  useWebSocket: () => ({ telegramId: null }),
}));

test('renders the IDE shell and passes URL room parameters to the app', () => {
  window.history.pushState({}, '', '/?roomId=room-1&roomToken=token-1&telegramId=123');
  render(<App />);
  expect(screen.getByTestId('cursor')).toBeInTheDocument();
  expect(screen.getByTestId('ide')).toBeInTheDocument();
});
