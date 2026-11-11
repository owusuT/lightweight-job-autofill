// Field allowlist and redaction for AI prompts

import type { Profile } from '../types';

// Fields that are never sent to AI providers
const BLOCKED_FIELDS: Array<keyof Profile> = [
  'gender',
  'race',
  'veteranStatus',
  'disabilityStatus',
  'consentBackgroundCheck',
  'consentDrugScreening',
  'consentSignature',
  'consentTerms',
];

// Fields that are safe to send
const ALLOWED_FIELDS: Array<keyof Profile> = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'zip',
  'country',
  'summary',
  'skills',
  'position',
  'company',
  'linkedin',
  'website',
  'education',
  'availability',
  'workType',
  'workAuthorization',
  'sponsorshipNeeded',
  'ageConfirmed',
  'employmentType',
  'startDate',
  'relocate',
  'travel',
  'yearsExperience',
  'certifications',
  'coverLetter',
  'whyInterested',
  'referralSource',
  'referredBy',
  'references',
  'referenceName',
  'referenceRelationship',
  'referenceContact',
];

export function sanitizeProfile(profile: Profile): Partial<Profile> {
  const sanitized: Record<string, unknown> = {};

  for (const field of ALLOWED_FIELDS) {
    const value = profile[field];
    if (value) {
      sanitized[field] = value;
    }
  }

  return sanitized as Partial<Profile>;
}

export function truncateJobDescription(description: string, maxLength = 4000): string {
  return description.slice(0, maxLength);
}

export function containsBlockedFields(profile: Profile): boolean {
  return BLOCKED_FIELDS.some((field) => profile[field] !== undefined && profile[field] !== '');
}
