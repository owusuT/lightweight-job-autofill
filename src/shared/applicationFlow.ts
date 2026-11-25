export type FlowStatus = 'running' | 'paused' | 'review' | 'stopped';

export interface ApplicationFlow {
  id: string;
  tabId: number;
  status: FlowStatus;
  phase: 'fill' | 'advance' | 'waiting';
  step: number;
  message: string;
  signature: string;
  updatedAt: number;
  position: string;
  company: string;
  accessFailure?: { stage: 'tab' | 'frames' | 'inspect' | 'fill' | 'advance'; since: number };
}

export interface ApplicationInspection {
  signature: string;
  fields: number;
  blockers: string[];
  missing: string[];
  next: boolean;
  review: boolean;
}

export interface FlowResponse {
  success: boolean;
  flow: ApplicationFlow | null;
  error?: string;
}

export const FLOW_STORAGE_KEY = 'applicationFlow';
