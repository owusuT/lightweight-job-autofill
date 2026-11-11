import { MESSAGE_TYPE } from "../shared/messages";
import type { ApplicationEntry, Profile } from "../shared/types";

export interface DetectedField {
  type?: string;
  label?: string;
  id?: string;
  name?: string;
}

export interface FillResponse {
  success: boolean;
  fieldsFilled?: number;
  framesReached?: number;
  perFrame?: Record<number, number>;
  forms?: DetectedField[];
  error?: string;
}

export interface HistoryResponse {
  success: boolean;
  history?: ApplicationEntry[];
  stats?: { total: number; today: number; thisWeek: number; thisMonth: number };
}

export interface AtsStatusResponse {
  success: boolean;
  hasProfile?: boolean;
  atsName?: string | null;
  isApplying?: boolean;
}

export function send<T>(type: string, value?: unknown): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, value }, (response) => {
        void chrome.runtime.lastError;
        resolve((response ?? { success: false }) as T);
      });
    } catch {
      resolve({ success: false, error: "Extension context lost. Reload the popup." } as T);
    }
  });
}

export const getProfile = (): Promise<{ success: boolean; profile?: Profile | null }> =>
  send(MESSAGE_TYPE.GET_USER_PROFILE);

export const saveProfile = (profile: Profile): Promise<{ success: boolean }> =>
  send(MESSAGE_TYPE.SAVE_USER_PROFILE, profile);

export const getHistory = (): Promise<HistoryResponse> => send(MESSAGE_TYPE.GET_APP_HISTORY);

export const getAtsStatus = (tabId?: number): Promise<AtsStatusResponse> =>
  send(MESSAGE_TYPE.GET_ATS_STATUS, { tabId });

export const fillApplication = (profile: Profile): Promise<FillResponse> =>
  send("ALL_FRAMES_FILL", profile);

export const manualFill = (options: Record<string, boolean>): Promise<FillResponse> =>
  send("ALL_FRAMES_MANUAL", options);

export const detectForms = (): Promise<FillResponse> => send("ALL_FRAMES_DETECT");

export const clearForms = (): Promise<FillResponse> => send("ALL_FRAMES_CLEAR");
