import { afterEach, expect, it, vi } from 'vitest';
import { ApplicationAnswersModule } from './applicationAnswers';
import { AllFramesModule } from './allFrames';
import { UserDataService } from './userData';
import type { ApplicationAnswerChoice } from '../../shared/applicationAnswers';

afterEach(() => vi.unstubAllGlobals());

it('stores only remembered answers and sends once-only answers to the page', async () => {
  let stored: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    tabs: { query: async () => [{ id: 8 }] },
    storage: {
      local: { get: async () => stored, set: async (value: Record<string, unknown>) => { stored = { ...stored, ...value }; } },
      sync: { get: async () => ({}) },
    },
  });
  const userData = new UserDataService();
  const frames = new AllFramesModule(userData);
  const fill = vi.spyOn(frames, 'runForTab').mockResolvedValue({ success: true, fieldsFilled: 2, framesReached: 1, perFrame: {} });
  const module = new ApplicationAnswersModule(frames);
  const answers: ApplicationAnswerChoice[] = [
    { question: 'Currently employed?', answer: 'Yes', origin: 'https://careers.example.test', remember: true },
    { question: 'Last four SSN digits?', answer: '1234', origin: 'https://careers.example.test', remember: false },
  ];
  const result = await new Promise(resolve => module.processMessage({ type: 'APPLICATION_ANSWERS_APPLY', value: answers }, {}, resolve));
  expect(result).toMatchObject({ success: true });
  expect(stored.applicationAnswers).toEqual([{ question: 'Currently employed?', answer: 'Yes', origin: 'https://careers.example.test' }]);
  expect(fill).toHaveBeenCalledWith(8, 'APPLICATION_APPLY_ANSWERS', { profile: {}, answers });
});

it('rejects malformed answers before changing storage', async () => {
  const userData = new UserDataService();
  const module = new ApplicationAnswersModule(new AllFramesModule(userData));
  const response = vi.fn();
  module.processMessage({ type: 'APPLICATION_ANSWERS_APPLY', value: [{ question: 'Question', answer: true }] }, {}, response);
  expect(response).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
});
