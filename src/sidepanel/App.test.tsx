import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

afterEach(() => vi.unstubAllGlobals());

it('autofills the current application tab from Best Jobs', async () => {
  const query = vi.fn().mockResolvedValue([{ id: 42 }]);
  const sendMessage = vi.fn((message: { type: string }, respond: (value: unknown) => void) => {
    if (message.type === 'ALL_FRAMES_FILL') respond({ success: true, fieldsFilled: 2, framesReached: 1 });
    else respond({ success: true });
  });
  vi.stubGlobal('chrome', {
    tabs: { query },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { sendMessage },
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Autofill' }));

  expect(await screen.findByText('Filled 2 fields. Review before submitting.')).toBeInTheDocument();
  expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  expect(sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'ALL_FRAMES_FILL', tabId: 42 }),
    expect.any(Function),
  );
});
