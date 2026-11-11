import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

const emptyStats = { total: 0, today: 0, thisWeek: 0, thisMonth: 0 };

beforeAll(() => {
  (window as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: (message: { type: string }, callback: (response: unknown) => void) => {
        if (message.type === 'GET_USER_PROFILE') {
          callback({ success: true, profile: { firstName: 'Ada', email: 'ada@example.com' } });
          return;
        }
        if (message.type === 'GET_APP_HISTORY') {
          callback({ success: true, history: [], stats: emptyStats });
          return;
        }
        callback({ success: true });
      },
      getManifest: () => ({ version: '3.0.0' }),
      lastError: undefined,
    },
    tabs: { query: async () => [{ id: 1, url: 'https://example.com/job' }] },
    sidePanel: { open: async () => {} },
    windows: { getCurrent: async () => ({ id: 1 }) },
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    },
  };
});

describe('popup App', () => {
  it('loads the saved profile and renders the shell', async () => {
    render(<App />);
    expect(screen.getByText('jolly R')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Apply' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('First Name')).toHaveValue('Ada');
    });
  });

  it('switches tabs and loads history', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
  });
});
