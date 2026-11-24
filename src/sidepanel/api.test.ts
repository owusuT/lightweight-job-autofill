import { afterEach, expect, it, vi } from 'vitest';
import { captureCurrentJob } from './api';

afterEach(() => vi.unstubAllGlobals());

it('reads jobs from the main page even when the tab has embedded frames', async () => {
  const job = { title: 'Analyst', url: 'https://www.glassdoor.com/job-listing/analyst.htm?jl=123' };
  const sendMessage = vi.fn((_tabId, _message, options, respond) => {
    respond(options.frameId === 0 ? { success: true, jobs: [job] } : { success: false });
  });
  vi.stubGlobal('chrome', {
    tabs: { query: async () => [{ id: 7 }], sendMessage },
    runtime: {},
  });

  expect(await captureCurrentJob()).toEqual({ success: true, jobs: [job] });
  expect(sendMessage).toHaveBeenCalledWith(7, { type: 'CAPTURE_JOB' }, { frameId: 0 }, expect.any(Function));
});
