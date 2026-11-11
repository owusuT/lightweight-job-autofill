import { MESSAGE_TYPE } from "../shared/messages";
import type { Job, Profile } from "../shared/types";
import type { AiConfig } from "../shared/ai/tasks";
import type { ProviderId } from "../shared/ai/providers";
import type { RawPageJob } from "../shared/jobCapture";

export interface CaptureJobResponse {
  success: boolean;
  job?: RawPageJob;
  /** Every job card found on results pages; `job` is the first entry. */
  jobs?: RawPageJob[];
  error?: string;
}

export async function captureCurrentJob(): Promise<CaptureJobResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { success: false, error: "No active tab." };
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tab.id!, { type: MESSAGE_TYPE.CAPTURE_JOB }, (response) => {
        void chrome.runtime.lastError;
        resolve(response ?? { success: false, error: "Could not read this page. Reload it and try again." });
      });
    } catch {
      resolve({ success: false, error: "Extension context lost. Reload the panel." });
    }
  });
}

export interface FindApplyUrlResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export interface ClickContinueResponse {
  success: boolean;
  clicked?: boolean;
  error?: string;
}

export interface FillResult {
  success: boolean;
  fieldsFilled?: number;
  framesReached?: number;
  error?: string;
}

export async function clickContinue(tabId: number): Promise<ClickContinueResponse> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPE.CLICK_CONTINUE }, (response) => {
        void chrome.runtime.lastError;
        resolve(response ?? { success: false, error: "No content script in tab." });
      });
    } catch {
      resolve({ success: false, error: "Extension context lost." });
    }
  });
}

export async function findApplyUrl(tabId: number): Promise<FindApplyUrlResponse> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPE.FIND_APPLY_URL }, (response) => {
        void chrome.runtime.lastError;
        resolve(response ?? { success: false, error: "No content script in tab." });
      });
    } catch {
      resolve({ success: false, error: "Extension context lost." });
    }
  });
}

export interface GetJobsResponse {
  success: boolean;
  jobs?: Job[];
  fetchedAt?: number;
  cached?: boolean;
  error?: string;
}

export interface GetProfileResponse {
  success: boolean;
  profile?: Profile | null;
}

export interface AiSettingsResponse {
  success: boolean;
  config?: AiConfig;
  hasKeys?: Record<ProviderId, boolean>;
}

export interface AiModelsResponse {
  success: boolean;
  models?: string[];
  error?: string;
}

export interface AiTestResponse {
  success: boolean;
  model?: string;
  latencyMs?: number;
  error?: string;
  code?: string;
}

export interface AiChatResponse {
  success: boolean;
  text?: string;
  error?: string;
  code?: string;
  cached?: boolean;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AiQuestionCandidate {
  token: string;
  frameId: number;
  label: string;
  question: string;
  tag: string;
  maxLength: number | null;
  currentValue: string;
  required: boolean;
}

export interface AiCandidatesResponse {
  success: boolean;
  candidates?: AiQuestionCandidate[];
  error?: string;
}

export function send<T>(type: string, value?: unknown, tabId?: number): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, value, tabId }, (response) => {
        void chrome.runtime.lastError;
        resolve((response ?? { success: false, error: "No response from background." }) as T);
      });
    } catch {
      resolve({ success: false, error: "Extension context lost. Reload the panel." } as T);
    }
  });
}

export const getJobs = (query: string, remote: boolean, visa: boolean): Promise<GetJobsResponse> =>
  send<GetJobsResponse>(MESSAGE_TYPE.GET_JOBS, { query, remote, visa, limit: 60 });

export const getProfile = (): Promise<GetProfileResponse> =>
  send<GetProfileResponse>(MESSAGE_TYPE.GET_USER_PROFILE);

export const fillApplicationTab = (tabId: number): Promise<FillResult> =>
  send<FillResult>(MESSAGE_TYPE.ALL_FRAMES_FILL, undefined, tabId);

export const getAiSettings = (): Promise<AiSettingsResponse> =>
  send<AiSettingsResponse>(MESSAGE_TYPE.AI_GET_SETTINGS);

export const saveAiSettings = (config: Partial<AiConfig>, keys?: Record<string, string>): Promise<{ success: boolean }> =>
  send<{ success: boolean }>(MESSAGE_TYPE.AI_SET_SETTINGS, { config, keys });

export const clearAiKeys = (provider?: ProviderId): Promise<{ success: boolean }> =>
  send<{ success: boolean }>(MESSAGE_TYPE.AI_CLEAR_KEYS, provider ? { provider } : {});

export const listModels = (provider: ProviderId): Promise<AiModelsResponse> =>
  send<AiModelsResponse>(MESSAGE_TYPE.AI_LIST_MODELS, { provider });

export const testConnection = (provider: ProviderId): Promise<AiTestResponse> =>
  send<AiTestResponse>(MESSAGE_TYPE.AI_TEST_CONNECTION, { provider });

export const usageTotals = {
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
};

export const aiChat = async (payload: {
  task: string;
  profile: Profile;
  job: { title: string; company: string; description: string };
  extra?: { question?: string; maxLength?: number };
  requestId: string;
  bypassCache?: boolean;
}): Promise<AiChatResponse> => {
  const res = await send<AiChatResponse>(MESSAGE_TYPE.AI_CHAT, payload);
  if (res.success) {
    usageTotals.calls += 1;
    usageTotals.promptTokens += res.usage?.promptTokens || 0;
    usageTotals.completionTokens += res.usage?.completionTokens || 0;
  }
  return res;
};

export const cancelAi = (requestId: string): Promise<{ success: boolean }> =>
  send<{ success: boolean }>(MESSAGE_TYPE.AI_CANCEL, { requestId });

export const listQuestionFields = (): Promise<AiCandidatesResponse> =>
  send<AiCandidatesResponse>(MESSAGE_TYPE.ALL_FRAMES_QUESTION_CANDIDATES);

export const applyAnswer = (
  candidate: { token: string; frameId: number },
  text: string,
): Promise<{ success: boolean; error?: string }> =>
  send<{ success: boolean; error?: string }>(MESSAGE_TYPE.ALL_FRAMES_APPLY_ANSWER, {
    token: candidate.token,
    frameId: candidate.frameId,
    text,
  });
