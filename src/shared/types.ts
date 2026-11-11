// User profile
export interface Profile {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  summary?: string;
  skills?: string;
  experience?: string;
  salary?: string;
  industry?: string;
  position?: string;
  company?: string;
  linkedin?: string;
  website?: string;
  education?: string;
  availability?: string;
  workType?: string;
  workAuthorization?: string;
  sponsorshipNeeded?: string;
  ageConfirmed?: string;
  employmentType?: string;
  startDate?: string;
  relocate?: string;
  travel?: string;
  yearsExperience?: string;
  certifications?: string;
  gender?: string;
  race?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  coverLetter?: string;
  whyInterested?: string;
  referralSource?: string;
  referredBy?: string;
  references?: string;
  referenceName?: string;
  referenceRelationship?: string;
  referenceContact?: string;
  consentBackgroundCheck?: boolean;
  consentDrugScreening?: boolean;
  consentSignature?: boolean;
  consentTerms?: boolean;
}

// Application history entry
export interface ApplicationEntry {
  id: string;
  timestamp: number;
  url: string;
  title?: string;
  company?: string;
  atsName?: string;
  fieldsFilled: number;
  status?: "filled" | "submitted";
}

// Job listing
export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description?: string;
  tags?: string[];
  postedAt?: number;
  salary?: string;
  remote?: boolean;
  visaSponsorship?: boolean;
}

// Scored job with match score
export interface ScoredJob extends Job {
  score: number;
  stars: number;
  breakdown: ScorePart[];
}

// Individual score component
export interface ScorePart {
  name: string;
  score: number;
  weight: number;
  reason?: string;
}

// AI API keys (never returned to UI). AiConfig lives in shared/ai/tasks.ts.
export interface AiKeys {
  openai?: string;
  anthropic?: string;
  openrouter?: string;
  custom?: string;
}

// Storage helper types
export type StorageArea = "local" | "sync";

export interface StorageGetResult<T> {
  [key: string]: T;
}
