import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApplicationFlowModule } from './applicationFlow';
import { AllFramesModule } from './allFrames';
import { UserDataService } from './userData';
import type { ApplicationInspection, FlowResponse } from '../../shared/applicationFlow';

let stored: Record<string, unknown>;
let inspection: ApplicationInspection;
let sendMessage: ReturnType<typeof vi.fn>;
let frames: AllFramesModule;

beforeEach(() => {
  vi.useFakeTimers();
  stored = {};
  inspection = { signature: 'step-one', fields: 2, blockers: [], missing: [], next: true, review: false };
  sendMessage = vi.fn(async (_id, message) => message.type === 'AUTOMATION_INSPECT' ? inspection : { clicked: true });
  vi.stubGlobal('chrome', {
    alarms: { onAlarm: { addListener: vi.fn() }, create: vi.fn(), clear: vi.fn() },
    tabs: {
      onUpdated: { addListener: vi.fn() },
      query: async () => [{ id: 12, url: 'https://careers.example.test/apply' }],
      get: async () => ({ id: 12, status: 'complete' }),
      sendMessage,
    },
    webNavigation: { getAllFrames: async () => [{ frameId: 0 }] },
    storage: {
      local: { get: async () => stored, set: async (value: Record<string, unknown>) => { stored = { ...stored, ...structuredClone(value) }; } },
      sync: { get: async () => ({ userProfile: { firstName: 'Ada' } }) },
    },
  });
  frames = new AllFramesModule(new UserDataService());
  vi.spyOn(frames, 'runForTab').mockResolvedValue({ success: true, fieldsFilled: 2, framesReached: 1, perFrame: { 0: 2 } });
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function control(module: ApplicationFlowModule, type: string): Promise<FlowResponse> {
  return new Promise(resolve => module.processMessage({ type: `APPLICATION_FLOW_${type}` }, {}, resolve));
}

it('fills and advances automatically until final review in the original tab', async () => {
  const module = new ApplicationFlowModule(frames, new UserDataService());
  await control(module, 'START');
  await vi.advanceTimersByTimeAsync(1000);
  expect(frames.runForTab).toHaveBeenCalledWith(12, 'AUTOMATION_FILL', { firstName: 'Ada' });
  await vi.advanceTimersByTimeAsync(1000);
  expect(sendMessage).toHaveBeenCalledWith(12, { type: 'AUTOMATION_ADVANCE', value: { signature: 'step-one' } }, { frameId: 0 });
  inspection = { ...inspection, signature: 'review', next: false, review: true };
  await vi.advanceTimersByTimeAsync(3000);
  const result = await control(module, 'STATUS');
  expect(result.flow).toMatchObject({ status: 'review', step: 2 });
  expect(sendMessage.mock.calls.filter(([, message]) => message.type === 'AUTOMATION_ADVANCE')).toHaveLength(1);
});

it('pauses for missing answers and resumes after the user completes them', async () => {
  const module = new ApplicationFlowModule(frames, new UserDataService());
  inspection.missing = ['Desired salary'];
  await control(module, 'START');
  await vi.advanceTimersByTimeAsync(2000);
  expect((await control(module, 'STATUS')).flow).toMatchObject({ status: 'paused', message: 'Please complete: Desired salary.' });
  inspection.missing = [];
  await control(module, 'RESUME');
  await vi.advanceTimersByTimeAsync(2000);
  expect(sendMessage.mock.calls.some(([, message]) => message.type === 'AUTOMATION_ADVANCE')).toBe(true);
});

it('stops progressing after Pause or Stop', async () => {
  const module = new ApplicationFlowModule(frames, new UserDataService());
  await control(module, 'START');
  await control(module, 'PAUSE');
  await vi.advanceTimersByTimeAsync(5000);
  expect(frames.runForTab).not.toHaveBeenCalledWith(12, 'AUTOMATION_FILL', expect.anything());
  await control(module, 'STOP');
  expect((await control(module, 'STATUS')).flow?.status).toBe('stopped');
  expect((await control(module, 'RESUME')).success).toBe(false);
});

it('recovers a waiting step after a worker restart without clicking Next again', async () => {
  const module = new ApplicationFlowModule(frames, new UserDataService());
  await control(module, 'START');
  await vi.advanceTimersByTimeAsync(2000);
  const resumed = new ApplicationFlowModule(frames, new UserDataService());
  await vi.advanceTimersByTimeAsync(1000);
  expect((await control(resumed, 'STATUS')).flow?.phase).toBe('waiting');
  expect(sendMessage.mock.calls.filter(([, message]) => message.type === 'AUTOMATION_ADVANCE')).toHaveLength(1);
});
